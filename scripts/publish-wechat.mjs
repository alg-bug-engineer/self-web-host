import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const manifestFile = process.argv[2]
if (!manifestFile) throw new Error('用法：node scripts/publish-wechat.mjs content/wechat/<article>.json')

const appId = process.env.WECHAT_APP_ID?.trim()
const appSecret = process.env.WECHAT_APP_SECRET?.trim()
const autoPublish = process.env.WECHAT_AUTO_PUBLISH === 'true'
const dryRun = process.env.WECHAT_DRY_RUN === 'true'
const author = process.env.WECHAT_ARTICLE_AUTHOR?.trim() || '芝士AI吃鱼'
const stateFile = process.env.WECHAT_PUBLISH_STATE_FILE?.trim() || path.join(os.homedir(), '.config', 'ai-knowledgepoints', 'wechat-publish-state.json')
if (!dryRun && (!appId || !appSecret)) throw new Error('公众号主动发布需要 WECHAT_APP_ID 与 WECHAT_APP_SECRET。')

const manifestPath = path.resolve(projectDir, manifestFile)
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const stateKey = manifest.date ? `${manifest.date}:${manifest.slug}` : manifest.slug
const state = await readJson(stateFile, {})
if (['published', 'draft'].includes(state[stateKey]?.status)) {
  console.log(`${stateKey} 已存在公众号${state[stateKey].status === 'published' ? '发布记录' : '草稿'}，跳过重复操作。`)
  process.exit(0)
}

const html = await fs.readFile(path.resolve(projectDir, manifest.htmlPath), 'utf8')
const article = html.match(/<article>([\s\S]*?)<\/article>/i)?.[1]
if (!article) throw new Error('公众号 HTML 中没有找到 article 正文。')
const token = dryRun ? '' : await getAccessToken()
if (!dryRun && state[stateKey]?.status === 'publishing' && state[stateKey]?.publishId) {
  const result = await waitForPublish(token, state[stateKey].publishId)
  state[stateKey] = { ...state[stateKey], status: 'published', articleId: result.article_id, updatedAt: new Date().toISOString() }
  await saveState(state)
  console.log(`公众号发布已确认：${result.article_id || state[stateKey].publishId}`)
  process.exit(0)
}
let content = article

const imageMatches = [...content.matchAll(/<img[^>]+data-local-src="([^"]+)"[^>]*>/g)]
for (const match of imageMatches) {
  const localPath = path.resolve(projectDir, match[1])
  await fs.access(localPath)
  const uploadedUrl = dryRun ? match[0].match(/src="([^"]*)"/)?.[1] : await uploadInlineImage(token, localPath)
  content = content.replace(match[0], match[0].replace(/src="[^"]*"/, `src="${escapeHtml(uploadedUrl)}"`).replace(/\sdata-local-src="[^"]*"/, ''))
}

content = content
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .replace(/<header\b[\s\S]*?<\/header>/gi, '')
  .replace(/\sclass="[^"]*"/g, '')
content = inlineWechatStyles(content)

if (dryRun) {
  if (content.length < 3000) throw new Error('公众号正文转换后过短。')
  if (content.length > 100_000) throw new Error('公众号正文转换后过长。')
  console.log(`公众号发布预检通过：${manifest.title}，正文 ${content.length} 字符，图片 ${imageMatches.length} 张。`)
  process.exit(0)
}

const thumbMediaId = await uploadPermanentImage(token, path.resolve(projectDir, manifest.coverPath))
const draftResponse = await wechatJson(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`, {
  articles: [{
    title: manifest.title.slice(0, 64),
    author: author.slice(0, 16),
    digest: manifest.description.slice(0, 120),
    content,
    content_source_url: manifest.websiteUrl,
    thumb_media_id: thumbMediaId,
    need_open_comment: 1,
    only_fans_can_comment: 0,
  }],
})

const record = {
  status: autoPublish ? 'publishing' : 'draft',
  draftMediaId: draftResponse.media_id,
  manifestDate: manifest.date || null,
  manifestSlug: manifest.slug,
  websiteUrl: manifest.websiteUrl,
  contentHash: crypto.createHash('sha256').update(content).digest('hex'),
  updatedAt: new Date().toISOString(),
}

if (autoPublish) {
  let publishResponse
  try {
    publishResponse = await wechatJson(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(token)}`, {
      media_id: draftResponse.media_id,
    })
  } catch (error) {
    if (error?.wechatCode !== 48001) throw error
    record.status = 'draft'
    record.publishNote = 'freepublish API 未授权（48001），已自动保留为公众号草稿。'
    state[stateKey] = record
    await saveState(state)
    console.warn(record.publishNote)
    console.log(`公众号草稿已创建：${record.draftMediaId}`)
    process.exit(0)
  }
  record.publishId = publishResponse.publish_id
  record.status = 'publishing'
  state[stateKey] = record
  await saveState(state)
  const publishResult = await waitForPublish(token, publishResponse.publish_id)
  record.status = 'published'
  record.articleId = publishResult.article_id
}

state[stateKey] = record
await saveState(state)
console.log(autoPublish ? `公众号发布任务已提交：${record.publishId}` : `公众号草稿已创建：${record.draftMediaId}`)

async function getAccessToken() {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error(`获取公众号 access_token 失败：${wechatError(data)}`)
  return data.access_token
}

async function uploadInlineImage(token, file) {
  const form = new FormData()
  form.append('media', new Blob([await fs.readFile(file)], { type: 'image/png' }), path.basename(file))
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
  })
  const data = await response.json()
  if (!response.ok || !data.url) throw new Error(`上传公众号正文图片失败：${wechatError(data)}`)
  return data.url
}

async function uploadPermanentImage(token, file) {
  const form = new FormData()
  form.append('media', new Blob([await fs.readFile(file)], { type: 'image/png' }), path.basename(file))
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
  })
  const data = await response.json()
  if (!response.ok || !data.media_id) throw new Error(`上传公众号封面失败：${wechatError(data)}`)
  return data.media_id
}

async function wechatJson(url, body) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  })
  const data = await response.json()
  if (!response.ok || (data.errcode && data.errcode !== 0)) {
    const error = new Error(`公众号接口失败：${wechatError(data)}`)
    error.wechatCode = Number(data?.errcode)
    throw error
  }
  return data
}

async function waitForPublish(token, publishId) {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const result = await wechatJson(`https://api.weixin.qq.com/cgi-bin/freepublish/get?access_token=${encodeURIComponent(token)}`, {
      publish_id: publishId,
    })
    if (result.publish_status === 0) return result
    if (result.publish_status !== 1) throw new Error(`公众号发布失败：状态 ${result.publish_status} ${result.fail_idx?.join(',') || ''}`)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error(`公众号发布状态等待超时：${publishId}`)
}

async function saveState(value) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 })
  await fs.writeFile(stateFile, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

function wechatError(data) { return `${data?.errcode ?? 'HTTP'} ${data?.errmsg || data?.message || '未知错误'}` }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function inlineWechatStyles(value) {
  return value
    .replace(/<h2>/g, '<h2 style="box-sizing:border-box;margin:46px 0 22px;padding:12px 0 0 12px;border-left:4px solid #2F6FA5;font-size:23px;line-height:1.5;font-weight:700;color:#102A43;">')
    .replace(/<h3>/g, '<h3 style="box-sizing:border-box;margin:28px 0 13px;font-size:19px;line-height:1.6;font-weight:700;color:#102A43;">')
    .replace(/<p>/g, '<p style="box-sizing:border-box;margin:0 0 18px;font-size:16px;line-height:1.95;color:#273A57;text-align:justify;">')
    .replace(/<blockquote>/g, '<blockquote style="box-sizing:border-box;margin:0 0 30px;padding:18px 22px;border-left:5px solid #2F6FA5;background:#F3F7FB;color:#263C5E;font-size:17px;line-height:1.9;font-weight:600;">')
    .replace(/<figure>/g, '<section style="box-sizing:border-box;margin:32px 0 44px;padding-top:16px;border-top:2px solid #102A43;">')
    .replace(/<\/figure>/g, '</section>')
    .replace(/<figcaption>/g, '<p style="box-sizing:border-box;margin:9px 0 0;font-size:12px;line-height:1.7;color:#8793A5;">')
    .replace(/<\/figcaption>/g, '</p>')
    .replace(/<img([^>]*)>/g, '<img$1 style="box-sizing:border-box;display:block;width:100%;height:auto;border:1px solid #E8EDF3;">')
    .replace(/<ul>/g, '<ul style="box-sizing:border-box;margin:10px 0 24px;padding-left:24px;">')
    .replace(/<ol>/g, '<ol style="box-sizing:border-box;margin:10px 0 24px;padding-left:24px;">')
    .replace(/<li>/g, '<li style="box-sizing:border-box;margin:0 0 7px;font-size:15px;line-height:1.85;color:#4B5E77;">')
    .replace(/<a /g, '<a style="color:#2F6FA5;text-decoration:underline;" ')
    .replace(/<hr>/g, '<hr style="box-sizing:border-box;height:1px;border:0;background:#E5EAF0;margin:44px 0;">')
}
