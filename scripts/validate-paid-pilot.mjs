import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const configFile = path.resolve(projectDir, args.config || 'ops/campaigns/ai-native-generation-30d-paid-pilot.json')
const coursePageFile = path.resolve(projectDir, args.coursePage || 'src/app/ai-native-generation/page.tsx')
const planetPageFile = path.resolve(projectDir, args.planetPage || 'src/app/planet/page.tsx')
const [config, coursePage, planetPage] = await Promise.all([
  fs.readFile(configFile, 'utf8').then(JSON.parse),
  fs.readFile(coursePageFile, 'utf8'),
  fs.readFile(planetPageFile, 'utf8'),
])
const intakeDisclosure = await fs.readFile(
  path.resolve(projectDir, config.intakeDisclosureAsset || ''),
  'utf8',
)

assert.equal(config.version, 1)
assert.equal(config.campaignId, 'ai-native-generation-30d')
assert.ok(['intake_only', 'ready_for_payment', 'closed'].includes(config.status))
assert.equal(config.contactPath.websiteCollectsContact, false)
assert.equal(
  config.intakeDisclosureAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-31-course-beta-participation-boundaries.md',
)
assert.match(intakeDisclosure, /当前只登记意向，不收费/)
assert.match(intakeDisclosure, /孩子不愿继续某个任务时，可以停止/)
assert.match(intakeDisclosure, /不自动授权公开复用/)
assert.match(intakeDisclosure, /完整合同、退款和支付安排/)
assert.ok(config.contactPath.forbiddenFields.includes('儿童姓名'))
assert.ok(config.contactPath.forbiddenFields.includes('健康情况'))
assert.equal(config.proposedOffer.status, 'pending_owner_approval_and_compliance')
assert.equal(config.proposedOffer.priceCny, 299)
assert.equal(config.proposedOffer.maxFamilies, 10)
assert.match(config.proposedOffer.paymentMethod, /不得使用个人收款码/)
assert.ok(Array.isArray(config.requiredComplianceBeforePayment))
assert.equal(config.requiredComplianceBeforePayment.length, 8)
assert.match(coursePage, /加入知识星球不等于报名课程内测/)
assert.match(coursePage, /guardian-intake-wechat/)
assert.match(planetPage, /知识星球共学和课程内测是两个不同选择/)

if (config.status === 'ready_for_payment') {
  assert.equal(config.paymentEnabled, true)
  for (const field of config.requiredBeforePayment) {
    const value = config.offer[field]
    assert.ok(value !== null && value !== '', `开放付款前必须填写 offer.${field}`)
  }
  for (const field of config.requiredComplianceBeforePayment) {
    const value = config.complianceGate[field]
    const confirmed = value === true || (typeof value === 'string' && value.trim().length > 0)
    assert.ok(confirmed, `开放付款前必须确认 complianceGate.${field}`)
  }
  assert.ok(Number(config.offer.priceCny) > 0)
  assert.ok(Number(config.offer.maxFamilies) > 0)
  assert.match(coursePage, /data-paid-pilot-status=["']ready_for_payment["']/)
  assert.match(coursePage, new RegExp(String(config.offer.priceCny)))
  assert.match(coursePage, /退款/)
  assert.match(coursePage, /支持|反馈/)
  assert.doesNotMatch(coursePage, /当前只登记意向，不收取课程内测费用/)
} else {
  assert.equal(config.paymentEnabled, false)
  assert.ok(config.requiredComplianceBeforePayment.some((field) => {
    const value = config.complianceGate[field]
    return value !== true && !(typeof value === 'string' && value.trim().length > 0)
  }))
  assert.match(coursePage, /当前只登记意向，不收取课程内测费用/)
  assert.doesNotMatch(coursePage, /立即购买|立即付款|支付课程费用/)
}

assert.ok(config.separationRules.some((item) => item.includes('分别表达')))
assert.ok(config.separationRules.some((item) => item.includes('任何付款前')))

console.log(`paid pilot gate passed: ${config.status}`)

function parseArgs(values) {
  const parsed = { config: '', coursePage: '', planetPage: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--config') parsed.config = values[++index] || ''
    else if (value === '--course-page') parsed.coursePage = values[++index] || ''
    else if (value === '--planet-page') parsed.planetPage = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}
