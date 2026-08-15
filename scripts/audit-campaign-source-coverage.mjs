import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const calendarFiles = args.calendars.length
  ? args.calendars
  : [1, 2, 3, 4, 5].map((week) => `ops/campaigns/ai-native-generation-30d-week${week}-content-calendar.json`)
const publicLongformPlatforms = new Set(['website', 'wechat', 'csdn', 'toutiao'])
const verifiableSourceDomains = [
  'ai.google',
  'anthropic.com',
  'apa.org',
  'arxiv.org',
  'doi.org',
  'gov.cn',
  'mathematica.org',
  'microsoft.com',
  'nature.com',
  'nist.gov',
  'oecd.org',
  'openai.com',
  'science.org',
  'un.org',
  'unesco.org',
  'unicef.org',
  'wipo.int',
]
const factualPatterns = [
  { id: 'research_claim', pattern: /研究(?:显示|发现|表明|指出)/gu },
  { id: 'survey_claim', pattern: /调查(?:显示|发现|表明|指出)/gu },
  { id: 'report_claim', pattern: /报告(?:显示|发现|表明|指出)/gu },
  { id: 'sample_size', pattern: /(?:样本|受访者|调查对象).{0,12}\d+/gu },
  {
    id: 'percentage_claim',
    pattern: /(?:(?:研究|调查|报告|样本|受访者|学生|家长|教师|儿童).{0,40}\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%.{0,40}(?:研究|调查|报告|样本|受访者|学生|家长|教师|儿童))/gu,
  },
  {
    id: 'named_authority_claim',
    pattern: /(?:NIST|UNESCO|UNICEF|OECD|教育部|网信办|国家互联网信息办公室|全国人大).{0,60}(?:列出|列为|明确|指出|要求|规定|定义|发布|提出)/gu,
  },
  {
    id: 'normative_rule_claim',
    pattern: /(?:法律|法规|规章|国家标准|平台规则).{0,30}(?:规定|要求|禁止|必须)/gu,
  },
  { id: 'named_legal_instrument', pattern: /《[^》]{2,40}(?:法|条例|规定|办法|标准)》/gu },
]

const entries = []
const invalid = []
for (const calendarFile of calendarFiles) {
  const calendar = await readJson(calendarFile)
  if (calendar.campaignId !== 'ai-native-generation-30d') {
    invalid.push(`${calendarFile} campaignId 不匹配`)
    continue
  }
  for (const entry of calendar.entries || []) {
    if (!publicLongformPlatforms.has(entry.platform)) continue
    const textAssets = (entry.assets || []).filter((asset) => /\.(?:md|mdx|html|tsx)$/i.test(asset))
    if (!textAssets.length) continue
    const assetTexts = []
    const missingAssets = []
    for (const asset of textAssets) {
      const text = await fs.readFile(path.resolve(projectDir, asset), 'utf8').catch(() => null)
      if (text == null) missingAssets.push(asset)
      else assetTexts.push({ asset, text })
    }
    const combined = assetTexts.map((item) => item.text).join('\n')
    const publicClaimText = stripNonClaimText(combined)
    const markers = factualPatterns.flatMap(({ id, pattern }) =>
      [...publicClaimText.matchAll(pattern)].map((match) => ({ id, text: cleanLine(match[0]) })))
    const urls = unique([...combined.matchAll(/https:\/\/[^\s)\]"'<>`，。；：！？、]+/gu)].map((match) => trimUrl(match[0])))
    const verifiableSourceUrls = urls.filter(isVerifiableSourceUrl)
    const requiresSourceCoverage = markers.length > 0
    const sourceCoverage = !requiresSourceCoverage || verifiableSourceUrls.length > 0
    const report = {
      calendarEntryId: entry.id,
      date: entry.date,
      platform: entry.platform,
      status: entry.status,
      textAssets,
      missingAssets,
      factualMarkers: markers,
      sourceUrls: urls,
      verifiableSourceUrls,
      requiresSourceCoverage,
      sourceCoverage,
    }
    entries.push(report)
    for (const asset of missingAssets) invalid.push(`${entry.id} 缺少文本资产：${asset}`)
    if (!sourceCoverage) {
      invalid.push(`${entry.id} 包含事实性或规范性权威断言，但关联文本资产中没有官方机构、法规库、论文库或原始研究来源`)
    }
  }
}

const report = {
  campaignId: 'ai-native-generation-30d',
  calendars: calendarFiles.length,
  longformEntries: entries.length,
  entriesRequiringSources: entries.filter((entry) => entry.requiresSourceCoverage).length,
  entriesWithSourceCoverage: entries.filter((entry) => entry.requiresSourceCoverage && entry.sourceCoverage).length,
  entries,
  state: invalid.length ? 'blocked' : 'ready',
  invalid,
  policy: {
    scope: '网站、公众号、CSDN 与今日头条周历文本资产',
    trigger: '研究/调查/报告结论、样本或受访者数量、同语境百分比、具名权威机构结论、法律法规与平台规则断言',
    codeFenceRule: '代码块、行内代码、frontmatter 与 URL 编码不当作公开事实断言',
    evidenceRule: '触发项必须在同一周历条目的文本资产或来源核对表中至少包含一个官方机构、法规库、论文库或原始研究域名；普通推广链接和知识星球入口不能充当证据。链接仍需发布前人工确认内容与适用范围。',
    verifiableSourceDomains,
  },
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))
if (invalid.length) process.exitCode = 1

function parseArgs(values) {
  const parsed = { calendars: [], json: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--calendar') parsed.calendars.push(values[++index] || '')
    else if (value === '--json') parsed.json = true
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.calendars.some((value) => !value)) throw new Error('--calendar 不能为空。')
  return parsed
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.resolve(projectDir, filename), 'utf8'))
}

function stripNonClaimText(value) {
  return String(value || '')
    .replace(/^---\s*[\s\S]*?\n---\s*/u, '')
    .replace(/```[\s\S]*?```/gu, '')
    .replace(/`[^`\n]*`/gu, '')
    .replace(/https?:\/\/[^\s)\]"'<>]+/gu, '')
}

function trimUrl(value) {
  return value.replace(/[，。；：！？、,.!?;:]+$/u, '')
}

function isVerifiableSourceUrl(value) {
  let hostname
  try {
    hostname = new URL(value).hostname.toLowerCase()
  } catch {
    return false
  }
  return verifiableSourceDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    || hostname.endsWith('.edu')
}

function unique(values) {
  return [...new Set(values)]
}

function cleanLine(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim()
}

function renderMarkdown(value) {
  return `# 全月公开长文来源覆盖审计\n\n- 状态：${value.state}\n- 周历：${value.calendars}\n- 长文条目：${value.longformEntries}\n- 触发来源门禁：${value.entriesRequiringSources}\n- 已覆盖：${value.entriesWithSourceCoverage}\n- 无效项：${value.invalid.length}\n- 外部写入：无\n`
}
