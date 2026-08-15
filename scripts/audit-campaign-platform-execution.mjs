import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = process.argv.slice(2)
const explicitFile = args.find((value) => !value.startsWith('--'))
const filename = path.resolve(
  projectDir,
  explicitFile || 'ops/campaigns/ai-native-generation-30d-platform-execution.json',
)
const registry = JSON.parse(await fs.readFile(filename, 'utf8'))
const requiredPlatforms = ['website', 'wechat', 'csdn', 'x', 'toutiao', 'zsxq', 'notebooklm', 'jimeng']
const invalid = []

if (registry.version !== 1) invalid.push('version 必须为 1')
if (registry.campaignId !== 'ai-native-generation-30d') invalid.push('campaignId 不匹配')
if (!Array.isArray(registry.credentialPolicy) || registry.credentialPolicy.length < 3) invalid.push('credentialPolicy 不完整')
if (!Array.isArray(registry.globalStopConditions) || registry.globalStopConditions.length < 5) invalid.push('globalStopConditions 不完整')

for (const platform of requiredPlatforms) {
  const value = registry.platforms?.[platform]
  if (!value) {
    invalid.push(`缺少平台 ${platform}`)
    continue
  }
  for (const field of ['role', 'executionMode', 'authenticatedState', 'externalWriteStatus', 'currentBlocker']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) invalid.push(`${platform}.${field} 不能为空`)
  }
  for (const field of ['allowedActions', 'prohibitedActions', 'confirmationEvidence', 'metricsCapture']) {
    if (!Array.isArray(value[field]) || value[field].length === 0) invalid.push(`${platform}.${field} 必须是非空数组`)
  }
  const serialized = JSON.stringify(value).toLowerCase()
  for (const forbidden of ['cookie export', 'cookie_export', 'localstorage export', 'password export']) {
    if (serialized.includes(forbidden)) invalid.push(`${platform} 包含禁止的凭证方案 ${forbidden}`)
  }
  if (platform === 'zsxq') {
    if (value.pinPolicy?.defaultAction !== 'skip_existing_pinned_topic') {
      invalid.push('zsxq.pinPolicy 必须保护已观察到的现有置顶入口')
    }
    if (value.publicProfileReview?.status !== 'legacy_persona_claims_visible_pending_owner_review') {
      invalid.push('zsxq.publicProfileReview 必须保持等待作者审阅')
    }
    const proposalAsset = value.publicProfileReview?.proposalAsset
    if (!proposalAsset) invalid.push('zsxq.publicProfileReview.proposalAsset 不能为空')
    else {
      try {
        await fs.stat(path.resolve(projectDir, proposalAsset))
      } catch {
        invalid.push(`zsxq 公开简介提案不存在：${proposalAsset}`)
      }
    }
  }
}

const report = {
  campaignId: registry.campaignId,
  state: invalid.length ? 'invalid' : 'ready',
  platforms: requiredPlatforms.map((id) => ({
    id,
    executionMode: registry.platforms?.[id]?.executionMode || null,
    externalWriteStatus: registry.platforms?.[id]?.externalWriteStatus || null,
    currentBlocker: registry.platforms?.[id]?.currentBlocker || null,
    ...(id === 'zsxq' ? {
      pinPolicy: registry.platforms?.[id]?.pinPolicy || null,
      publicProfileReview: registry.platforms?.[id]?.publicProfileReview || null,
    } : {}),
  })),
  invalid,
}

if (args.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  const lines = [
    '# 平台执行能力审计',
    '',
    `- 状态：${report.state}`,
    `- 平台：${report.platforms.length}`,
    '',
    '| 平台 | 执行方式 | 外部写入状态 | 当前阻断 |',
    '|---|---|---|---|',
    ...report.platforms.map((item) => `| ${item.id} | ${item.executionMode} | ${item.externalWriteStatus} | ${item.currentBlocker} |`),
    '',
    `- 无效项：${invalid.length}`,
    '',
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
}
if (invalid.length) process.exitCode = 1
