import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const manifestFile = process.argv[2]
if (!manifestFile) throw new Error('用法：node scripts/verify-wechat-draft.mjs content/wechat/<article>.json')

const manifest = JSON.parse(await fs.readFile(path.resolve(projectDir, manifestFile), 'utf8'))
if (manifest.releaseGate !== 'draft_only_manual_preview') throw new Error('草稿清单缺少 draft_only_manual_preview 门禁')
if (manifest.authorApproval?.status !== 'pending') throw new Error('草稿清单的作者确认状态必须为 pending')
const stateFile = process.env.WECHAT_PUBLISH_STATE_FILE?.trim()
  || path.join(os.homedir(), '.config', 'ai-knowledgepoints', 'wechat-publish-state.json')
const state = JSON.parse(await fs.readFile(stateFile, 'utf8'))
const stateKey = manifest.date ? `${manifest.date}:${manifest.slug}` : manifest.slug
const record = state[stateKey]
if (record?.status !== 'draft' || !record.draftMediaId) throw new Error(`${stateKey} 没有可核验的公众号草稿记录`)

const fixture = process.env.WECHAT_DRAFT_VERIFY_FIXTURE?.trim()
const data = fixture
  ? JSON.parse(await fs.readFile(path.resolve(projectDir, fixture), 'utf8'))
  : await getDraft(record.draftMediaId)
const articles = Array.isArray(data.news_item) ? data.news_item : []
const article = articles[0]
const invalid = []
if (articles.length !== 1) invalid.push(`草稿文章数应为 1，当前为 ${articles.length}`)
if (article?.title !== manifest.title) invalid.push(`草稿标题不一致：${article?.title || '未获得'}`)
if (typeof article?.content !== 'string' || article.content.length < 3000) invalid.push('草稿正文缺失或过短')
if (!article?.thumb_media_id) invalid.push('草稿缺少封面 media_id')

const report = {
  state: invalid.length ? 'invalid' : 'verified_draft',
  stateKey,
  status: record.status,
  draftMediaId: record.draftMediaId,
  title: article?.title || null,
  articleCount: articles.length,
  contentCharacters: typeof article?.content === 'string' ? article.content.length : 0,
  hasCover: Boolean(article?.thumb_media_id),
  requiresAuthorPreview: true,
  approvedForPublish: false,
  publishedUrl: null,
  invalid,
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (invalid.length) process.exitCode = 1

async function getDraft(mediaId) {
  const appId = process.env.WECHAT_APP_ID?.trim()
  const appSecret = process.env.WECHAT_APP_SECRET?.trim()
  if (!appId || !appSecret) throw new Error('公众号草稿核验需要 WECHAT_APP_ID 与 WECHAT_APP_SECRET')
  const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token')
  tokenUrl.searchParams.set('grant_type', 'client_credential')
  tokenUrl.searchParams.set('appid', appId)
  tokenUrl.searchParams.set('secret', appSecret)
  const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(30_000) })
  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error(`获取公众号 access_token 失败：${wechatError(tokenData)}`)
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${encodeURIComponent(tokenData.access_token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ media_id: mediaId }),
    signal: AbortSignal.timeout(60_000),
  })
  const draft = await response.json()
  if (!response.ok || (draft.errcode && draft.errcode !== 0)) throw new Error(`读取公众号草稿失败：${wechatError(draft)}`)
  return draft
}

function wechatError(data) {
  return `${data?.errcode ?? 'HTTP'} ${data?.errmsg || data?.message || '未知错误'}`
}
