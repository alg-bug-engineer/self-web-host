import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { parseArticle } from './content-diversity.mjs'

const execFileAsync = promisify(execFile)
const publicRoutes = new Set([
  '/',
  '/about',
  '/blog',
  '/collections/articles',
  '/collections/manga',
  '/collections/tools',
  '/lab',
  '/planet',
  '/portfolio',
])
const globalDiscoveryFiles = new Set([
  'ops/indexnow.json',
  'src/app/layout.tsx',
  'src/app/sitemap.ts',
  'src/components/SiteStructuredData.tsx',
  'src/lib/site.ts',
])
const globalLayoutFiles = new Set([
  'src/components/Footer.tsx',
  'src/components/Header.tsx',
  'src/components/LayoutWrapper.tsx',
  'src/components/MobileMenu.tsx',
  'src/components/Sidebar.tsx',
])
const blogTemplateFiles = new Set([
  'src/app/blog/[slug]/page.tsx',
  'src/components/ArticleViewCounter.tsx',
  'src/components/PlanetBanner.tsx',
  'src/components/WechatCard.tsx',
  'src/components/mdx/index.tsx',
])

export async function loadIndexNowConfig(projectDir) {
  const configPath = path.join(projectDir, 'ops', 'indexnow.json')
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  validateIndexNowConfig(config)
  const keyPath = path.join(projectDir, 'public', config.keyFile)
  const hostedKey = (await fs.readFile(keyPath, 'utf8')).trim()
  if (hostedKey !== config.key) throw new Error('IndexNow 配置与公开验证文件不一致。')
  return config
}

export function validateIndexNowConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('IndexNow 配置无效。')
  const siteUrl = new URL(config.siteUrl)
  const endpoint = new URL(config.endpoint)
  if (siteUrl.protocol !== 'https:' || endpoint.protocol !== 'https:') throw new Error('IndexNow 站点与接口必须使用 HTTPS。')
  if (!/^[A-Za-z0-9-]{8,128}$/.test(config.key || '')) throw new Error('IndexNow key 格式无效。')
  if (config.keyFile !== `${config.key}.txt`) throw new Error('IndexNow 验证文件必须使用 <key>.txt。')
  if (!Number.isInteger(config.maxUrlsPerSubmission) || config.maxUrlsPerSubmission < 1 || config.maxUrlsPerSubmission > 10_000) {
    throw new Error('IndexNow 单次 URL 上限无效。')
  }
}

export async function loadPublishedPostPaths(projectDir) {
  const postsDir = path.join(projectDir, 'content', 'posts')
  const files = await fs.readdir(postsDir, { recursive: true })
  const output = []
  for (const relativeFile of files) {
    if (!relativeFile.endsWith('.mdx')) continue
    const raw = await fs.readFile(path.join(postsDir, relativeFile), 'utf8')
    const article = parseArticle(raw, relativeFile)
    if (article.published === false) continue
    output.push(`/blog/${toPosix(relativeFile).replace(/\.mdx$/i, '')}`)
  }
  return output.sort()
}

export async function changedFilesBetween(projectDir, fromCommit, toCommit) {
  if (!isCommit(fromCommit) || !isCommit(toCommit) || /^0+$/.test(fromCommit)) return []
  try {
    const { stdout } = await execFileAsync('git', [
      'diff',
      '--name-only',
      '--diff-filter=ACMRD',
      `${fromCommit}..${toCommit}`,
    ], { cwd: projectDir, maxBuffer: 1024 * 1024 })
    return stdout.split('\n').map((item) => item.trim()).filter(Boolean)
  } catch {
    console.warn('IndexNow 无法读取完整提交范围，将回退到线上 Sitemap，不中断搜索发现通知。')
    return []
  }
}

export function mapChangedFilesToUrls(changedFiles, { siteUrl, publishedPostPaths = [] }) {
  const origin = new URL(siteUrl).origin
  const paths = new Set()
  let needsFullSitemap = false

  for (const rawFile of changedFiles) {
    const file = toPosix(rawFile).replace(/^\.\//, '')
    if (globalDiscoveryFiles.has(file) || file.startsWith('public/') && file.endsWith('.txt')) {
      needsFullSitemap = true
      continue
    }
    if (globalLayoutFiles.has(file)) {
      needsFullSitemap = true
      continue
    }
    if (file.startsWith('content/posts/') && file.endsWith('.mdx')) {
      paths.add(`/blog/${file.slice('content/posts/'.length).replace(/\.mdx$/i, '')}`)
      paths.add('/blog')
      continue
    }
    if (blogTemplateFiles.has(file)) {
      paths.add('/blog')
      publishedPostPaths.forEach((pathname) => paths.add(pathname))
      continue
    }
    if (file === 'src/app/blog/BlogClient.tsx' || file === 'src/app/blog/page.tsx') {
      paths.add('/blog')
      continue
    }
    if (file === 'src/app/page.tsx') {
      paths.add('/')
      continue
    }
    const appPage = file.match(/^src\/app\/(.+)\/page\.tsx$/)
    if (appPage) {
      const route = `/${appPage[1]}`
      if (publicRoutes.has(route)) paths.add(route)
    }
  }

  return {
    needsFullSitemap,
    urls: [...paths].map((pathname) => new URL(pathname, origin).toString()).sort(),
  }
}

export function buildIndexNowPayload(config, urls) {
  const site = new URL(config.siteUrl)
  const unique = [...new Set(urls.map((value) => normalizeUrl(value)))]
  if (!unique.length) throw new Error('IndexNow 没有可提交 URL。')
  if (unique.length > config.maxUrlsPerSubmission) throw new Error(`IndexNow URL 超过单次上限 ${config.maxUrlsPerSubmission}。`)
  for (const url of unique) {
    if (new URL(url).host !== site.host) throw new Error(`IndexNow URL 不属于本站：${url}`)
  }
  return {
    host: site.host,
    key: config.key,
    keyLocation: new URL(`/${config.keyFile}`, site).toString(),
    urlList: unique,
  }
}

export function chunkUrls(urls, size) {
  if (!Number.isInteger(size) || size < 1) throw new Error('IndexNow 分批大小无效。')
  const output = []
  for (let index = 0; index < urls.length; index += size) output.push(urls.slice(index, index + size))
  return output
}

export function urlsFromSitemap(xml, siteUrl) {
  const site = new URL(siteUrl)
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => normalizeUrl(match[1].trim()))
    .filter((url) => new URL(url).host === site.host)
}

function normalizeUrl(value) {
  const url = new URL(value)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

function toPosix(value) {
  return String(value).split(path.sep).join('/')
}

function isCommit(value) {
  return /^[0-9a-f]{7,40}$/i.test(String(value || ''))
}
