import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const validator = path.join(projectDir, 'scripts', 'validate-paid-pilot.mjs')
const source = JSON.parse(await fs.readFile(
  path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-paid-pilot.json'),
  'utf8',
))
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paid-pilot-gate-'))
const configFile = path.join(tempDir, 'paid-pilot.json')

try {
  execFileSync(process.execPath, [validator], { cwd: projectDir, encoding: 'utf8' })

  const missingDisclosure = structuredClone(source)
  missingDisclosure.intakeDisclosureAsset = 'content/campaigns/ai-native-generation-30d/missing-intake-disclosure.md'
  await fs.writeFile(configFile, `${JSON.stringify(missingDisclosure, null, 2)}\n`, 'utf8')
  const disclosureFailure = captureFailure(['--config', configFile])
  assert.match(disclosureFailure, /ENOENT|missing-intake-disclosure/)

  const premature = structuredClone(source)
  premature.status = 'ready_for_payment'
  premature.paymentEnabled = true
  premature.offer = Object.fromEntries(
    premature.requiredBeforePayment.map((field) => [field, premature.proposedOffer[field]]),
  )
  await fs.writeFile(configFile, `${JSON.stringify(premature, null, 2)}\n`, 'utf8')

  const complianceFailure = captureFailure(['--config', configFile])
  assert.match(complianceFailure, /complianceGate\.jurisdiction/)

  premature.complianceGate = {
    ...premature.complianceGate,
    jurisdiction: '测试属地',
    providerLegalName: '测试主体',
    trainingEligibilityVerified: true,
    nationalPlatformOrLocalChannelVerified: true,
    regulatedPrepaymentAccountVerified: true,
    modelContractReady: true,
    invoiceCapabilityVerified: true,
    advertisingComplianceReviewed: true,
    reviewedAt: '2026-08-11T00:00:00+08:00',
  }
  await fs.writeFile(configFile, `${JSON.stringify(premature, null, 2)}\n`, 'utf8')

  const pageFailure = captureFailure(['--config', configFile])
  assert.match(pageFailure, /data-paid-pilot-status/)
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('paid pilot negative gate tests passed')

function captureFailure(extraArgs) {
  try {
    execFileSync(process.execPath, [validator, ...extraArgs], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    return `${error.stdout || ''}\n${error.stderr || ''}`
  }
  assert.fail('预期付款门禁拒绝当前配置，但命令成功。')
}
