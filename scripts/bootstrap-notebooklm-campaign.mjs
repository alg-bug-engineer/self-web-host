import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const projectDir = process.cwd()
const campaignFile = path.resolve(projectDir, process.env.CONTENT_CAMPAIGN_FILE || 'ops/campaigns/ai-native-generation-30d.json')
const campaignLogFile = path.resolve(
  projectDir,
  process.env.CONTENT_CAMPAIGN_LOG_FILE || 'ops/campaigns/ai-native-generation-30d-log.json',
)
const [campaign, campaignLog] = await Promise.all([
  fs.readFile(campaignFile, 'utf8').then(JSON.parse),
  fs.readFile(campaignLogFile, 'utf8').then(JSON.parse).catch(() => null),
])
const targetNotebookTitle = `${campaign.name}｜权威资料库`
const knownNotebookId = process.env.NOTEBOOKLM_NOTEBOOK || campaignLog?.notebooklm?.notebookId || ''
const cliProfile = process.env.NOTEBOOKLM_PROFILE || campaignLog?.notebooklm?.profile || 'ai-native-generation'
const localStateDir = path.resolve(projectDir, process.env.CONTENT_NOTEBOOKLM_STATE_DIR || '.campaign-local')
const localStateFile = path.join(localStateDir, `${campaign.id}-notebooklm.json`)

assertCli()
const auth = runJson(['auth', 'check', '--test', '--passive', '--json'], { allowFailure: true })
if (auth?.status !== 'ok') {
  throw new Error(`NotebookLM profile ${cliProfile} 尚未完成独立登录。请运行 notebooklm -p ${cliProfile} login --browser chrome，并在新打开的页面中手动登录；不要使用 --browser-cookies 或导出浏览器 Cookie。`)
}

let notebook = knownNotebookId
  ? runJson(['metadata', '--notebook', knownNotebookId, '--json'], { allowFailure: true })
  : null
if (!findId(notebook)) {
  const listed = runJson(['list', '--json'])
  const notebooks = asArray(listed, ['notebooks', 'items', 'data'])
  notebook = notebooks.find((item) => item?.title === targetNotebookTitle)
}
if (!findId(notebook)) notebook = runJson(['create', targetNotebookTitle, '--json'])

const notebookId = findId(notebook)
if (!notebookId) throw new Error('NotebookLM 创建成功但没有返回 notebook id。')

const metadata = runJson(['metadata', '--notebook', notebookId, '--json'])
const notebookTitle = metadata?.title || notebook?.title || targetNotebookTitle
const existingUrls = new Set(
  asArray(metadata, ['sources', 'items', 'data'])
    .map((source) => source?.url)
    .filter((url) => typeof url === 'string'),
)

const added = []
const failed = []
for (const sourceUrl of campaign.sourceSeeds || []) {
  if (existingUrls.has(sourceUrl)) continue
  try {
    const source = runJson(['source', 'add', sourceUrl, '--notebook', notebookId, '--type', 'url', '--json'])
    const sourceId = findId(source)
    if (sourceId) {
      runJson(['source', 'wait', sourceId, '--notebook', notebookId, '--timeout', '180', '--json'])
    }
    added.push({ url: sourceUrl, sourceId: sourceId || null })
  } catch (error) {
    failed.push({ url: sourceUrl, error: String(error?.message || error).slice(0, 300) })
  }
}

const state = {
  campaignId: campaign.id,
  profile: cliProfile,
  status: failed.length ? 'partial' : 'ready',
  notebookId,
  notebookTitle,
  sourceCount: existingUrls.size + added.length,
  added,
  failed,
  updatedAt: new Date().toISOString(),
}
await fs.mkdir(localStateDir, { recursive: true })
await fs.writeFile(localStateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

console.log(`NotebookLM 课程资料库已就绪：${notebookTitle}`)
console.log(`本次新增来源：${added.length}`)
console.log(`本次失败来源：${failed.length}`)
console.log(`本地状态：${path.relative(projectDir, localStateFile)}`)

function assertCli() {
  const result = spawnSync('notebooklm', ['--version'], { encoding: 'utf8' })
  if (result.error?.code === 'ENOENT') throw new Error('未找到 notebooklm CLI。请先使用 uv tool install "notebooklm-py[browser]" 安装。')
  if (result.status !== 0) throw new Error('notebooklm CLI 无法运行。')
}

function runJson(args, options = {}) {
  const result = spawnSync('notebooklm', ['--profile', cliProfile, ...args], { cwd: projectDir, encoding: 'utf8' })
  if (result.status !== 0 && !options.allowFailure) {
    const message = String(result.stderr || result.stdout || 'NotebookLM 命令失败').trim().slice(0, 600)
    throw new Error(message)
  }
  const raw = String(result.stdout || '').trim()
  if (!raw) return options.allowFailure ? null : {}
  try {
    return JSON.parse(raw)
  } catch {
    if (options.allowFailure) return null
    throw new Error(`NotebookLM 没有返回合法 JSON：${raw.slice(0, 240)}`)
  }
}

function asArray(value, keys) {
  if (Array.isArray(value)) return value
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key]
  return []
}

function findId(value) {
  if (!value || typeof value !== 'object') return ''
  for (const key of ['id', 'notebook_id', 'notebookId', 'source_id', 'sourceId']) {
    if (typeof value[key] === 'string' && value[key]) return value[key]
  }
  for (const key of ['notebook', 'source', 'data', 'result']) {
    const nested = findId(value[key])
    if (nested) return nested
  }
  return ''
}
