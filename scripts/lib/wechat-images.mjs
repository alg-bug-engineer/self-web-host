import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const WECHAT_IMAGE_HOSTS = new Set(['mmbiz.qpic.cn', 'mmbiz.qlogo.cn'])
const IMAGE_EXTENSIONS = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

export function normalizeWechatImages(html) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const dataSrc = tag.match(/\sdata-src=(['"])(.*?)\1/i)?.[2]
    if (!dataSrc) return tag
    return tag
      .replace(/\ssrc=(['"])(.*?)\1/i, '')
      .replace(/\sdata-src=(['"])(.*?)\1/i, ` src="${dataSrc}"`)
  })
}

export function isWechatImageUrl(value) {
  try {
    const url = new URL(value.replaceAll('&amp;', '&'))
    return url.protocol === 'https:' && WECHAT_IMAGE_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export async function downloadWechatImages(
  imageUrls,
  {
    slug,
    publicDir,
    fetchImpl = fetch,
    maxBytes = MAX_IMAGE_BYTES,
  },
) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`公众号图片目录名不安全：${slug}`)

  const uniqueUrls = [...new Set(imageUrls)]
  const downloads = []

  for (const [index, originalUrl] of uniqueUrls.entries()) {
    const requestUrl = originalUrl.replaceAll('&amp;', '&')
    if (!isWechatImageUrl(requestUrl)) continue

    const response = await fetchImpl(requestUrl, {
      headers: {
        Referer: 'https://mp.weixin.qq.com/',
        'User-Agent': 'ai-knowledgepoints-wechat-sync/1.0',
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      throw new Error(`公众号图片下载失败：${response.status} ${response.statusText} (${requestUrl})`)
    }

    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || ''
    const extension = IMAGE_EXTENSIONS.get(contentType)
    if (!extension) throw new Error(`公众号图片类型不受支持：${contentType || '未知'} (${requestUrl})`)

    const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10)
    if (declaredLength > maxBytes) throw new Error(`公众号图片超过 ${maxBytes} 字节限制：${requestUrl}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > maxBytes) {
      throw new Error(`公众号图片为空或超过 ${maxBytes} 字节限制：${requestUrl}`)
    }

    const filename = `image-${String(index + 1).padStart(2, '0')}.${extension}`
    downloads.push({
      originalUrl,
      bytes,
      filename,
      publicUrl: `/images/wechat/${slug}/${filename}`,
    })
  }

  if (!downloads.length) return new Map()

  const imageDir = path.join(publicDir, 'images', 'wechat', slug)
  await fs.mkdir(imageDir, { recursive: true })
  await Promise.all(downloads.map(({ bytes, filename }) => fs.writeFile(path.join(imageDir, filename), bytes)))
  return new Map(downloads.map(({ originalUrl, publicUrl }) => [originalUrl, publicUrl]))
}

export async function localizeWechatHtmlImages(html, options) {
  const normalizedHtml = normalizeWechatImages(html)
  const imageUrls = [...normalizedHtml.matchAll(/<img\b[^>]*\ssrc=(['"])(.*?)\1[^>]*>/gi)]
    .map((match) => match[2])
    .filter(isWechatImageUrl)
  const replacements = await downloadWechatImages(imageUrls, options)

  if (!replacements.size) return normalizedHtml
  return normalizedHtml.replace(/<img\b[^>]*>/gi, (tag) => tag.replace(
    /(\ssrc=(['"]))(.*?)\2/i,
    (attribute, prefix, quote, source) => `${prefix}${replacements.get(source) || source}${quote}`,
  ))
}
