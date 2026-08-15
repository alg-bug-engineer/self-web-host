import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const cliArgs = process.argv.slice(2)
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(renderHelp())
  process.exit(0)
}

const args = parseArgs(cliArgs)
const inputFile = path.resolve(projectDir, args.input)
const allowedDir = path.resolve(projectDir, 'content', 'campaigns', 'ai-native-generation-30d')
if (inputFile !== allowedDir && !inputFile.startsWith(`${allowedDir}${path.sep}`)) {
  throw new Error('--input 必须位于本活动内容目录。')
}
if (!inputFile.endsWith('-publish.txt')) throw new Error('--input 必须是纯发布载荷 -publish.txt。')

const destination = validateZsxqDestination(args.destinationUrl)
const source = await fs.readFile(inputFile, 'utf8')
const matches = [...source.matchAll(/https:\/\/wx\.zsxq\.com\/[^\s]+/g)]
if (matches.length !== 1) throw new Error(`纯载荷必须且只能包含 1 个知识星球链接，当前为 ${matches.length} 个。`)

const originalDestination = matches[0][0]
const payload = source.replace(originalDestination, destination.toString())
validateXPayload(payload)
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex')
const contentSha256 = crypto.createHash('sha256').update(payload).digest('hex')

const result = {
  campaignId: 'ai-native-generation-30d',
  mode: 'read_only_runtime_payload',
  platform: 'x',
  inputAsset: path.relative(projectDir, inputFile),
  sourceSha256,
  contentSha256,
  originalDestination,
  destination: destination.toString(),
  destinationType: destination.hostname === 't.zsxq.com'
    ? 'verified_topic_share_shortlink'
    : destination.pathname.includes('/topic_detail/')
      ? 'verified_topic_detail'
      : 'group_fallback',
  weightedLength: xWeightedLength(payload.trim()),
  payload,
  writesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  process.stdout.write([
    '# X 运行时跨平台直链载荷',
    '',
    `- 输入：${result.inputAsset}`,
    `- 源 SHA-256：${result.sourceSha256}`,
    `- 最终 SHA-256：${result.contentSha256}`,
    `- 目标：${result.destination}`,
    `- 类型：${result.destinationType}`,
    `- X 加权长度：${result.weightedLength} / 280`,
    '- 本地或外部写入：无',
    '',
    '> 仅使用知识星球可见分享面板生成的主题短链，或可见页面已核验的主题详情链接；无法取得时保留原始星球首页载荷。',
    '',
    payload.trim(),
    '',
  ].join('\n'))
}

function parseArgs(values) {
  const parsed = { destinationUrl: '', input: '', json: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--destination-url') parsed.destinationUrl = values[++index] || ''
    else if (value === '--input') parsed.input = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else throw new Error(`未知参数：${value}`)
  }
  if (!parsed.input) throw new Error('--input 不能为空。')
  if (!parsed.destinationUrl) throw new Error('--destination-url 不能为空。')
  return parsed
}

function validateZsxqDestination(value) {
  const url = new URL(value)
  const isWxDestination = url.hostname === 'wx.zsxq.com'
    && (url.pathname.startsWith('/group/') || url.pathname.includes('/topic_detail/'))
  const isTopicShareShortlink = url.hostname === 't.zsxq.com'
    && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)
  if (url.protocol !== 'https:' || (!isWxDestination && !isTopicShareShortlink)) {
    throw new Error('--destination-url 必须是知识星球 HTTPS 链接。')
  }
  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('--destination-url 不得包含凭证、查询参数或片段。')
  }
  return url
}

function validateXPayload(value) {
  if (!value.trim()) throw new Error('X 纯载荷为空。')
  if (/建议发布时间|可选首评|发布核验|回复模板|后台设置|运营动作/.test(value)) {
    throw new Error('X 纯载荷包含内部字段。')
  }
  const weightedLength = xWeightedLength(value.trim())
  if (weightedLength > 280) throw new Error(`X 纯载荷加权长度 ${weightedLength} 超过 280。`)
}

function xWeightedLength(value) {
  const urls = [...value.matchAll(/https?:\/\/\S+/g)].length
  const withoutUrls = value.replace(/https?:\/\/\S+/g, '')
  let length = urls * 23
  for (const character of [...withoutUrls]) {
    length += /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(character) ? 2 : 1
  }
  return length
}

function renderHelp() {
  return [
    'X 运行时知识星球直链载荷准备器（只读）',
    '',
    '用法：',
    '  node scripts/prepare-campaign-crosslink-payload.mjs \\',
    '    --input <X -publish.txt> \\',
    '    --destination-url <可见分享面板生成的 t.zsxq.com 主题短链，或已核验的群组/主题详情 HTTPS URL> [--json]',
    '',
    '此工具不写文件、不操作浏览器，也不读取登录凭证。',
    '',
  ].join('\n')
}
