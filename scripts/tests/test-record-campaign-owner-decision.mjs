import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts/record-campaign-owner-decision.mjs')
const source = path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-owner-decisions.json')
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'campaign-owner-decision-'))
const registry = path.join(tempDir, 'registry.json')
await fs.copyFile(source, registry)

try {
  const common = [
    '--registry', registry,
    '--id', 'website-deployment-authorization',
    '--decision', 'approved',
    '--decided-at', '2026-08-12T20:05:00+08:00',
    '--evidence', '作者明确授权进入最小部署清单审查、版本化与生产验收流程。',
    '--json',
  ]
  const dryRun = run(common)
  assert.equal(dryRun.status, 0, dryRun.stderr)
  const dryReport = JSON.parse(dryRun.stdout)
  assert.equal(dryReport.queueUpdated, false)
  assert.equal(dryReport.after.status, 'approved')
  assert.equal(dryReport.after.resolution.externalActionExecuted, false)
  assert.match(dryReport.guardrail, /不发布、部署/)
  assert.equal(JSON.parse(await fs.readFile(registry, 'utf8')).decisions.find((item) => item.id === 'website-deployment-authorization').status, 'pending')

  const applied = run([...common, '--apply'])
  assert.equal(applied.status, 0, applied.stderr)
  const saved = JSON.parse(await fs.readFile(registry, 'utf8')).decisions.find((item) => item.id === 'website-deployment-authorization')
  assert.equal(saved.status, 'approved')
  assert.equal(saved.resolution.externalActionExecuted, false)
  assert.match(saved.resolution.nextAction, /部署就绪报告/)

  const duplicate = run([...common, '--apply'])
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /拒绝覆盖/)

  const unsafe = run([
    '--registry', registry,
    '--id', 'zsxq-public-profile-copy',
    '--decision', 'approved',
    '--decided-at', '2026-08-13T20:05:00+08:00',
    '--evidence', '姓名：测试儿童；采用短版。',
    '--json',
  ])
  assert.equal(unsafe.status, 1)
  assert.match(unsafe.stderr, /不得包含儿童或家庭身份/)
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('campaign owner decision recorder tests passed')

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: projectDir, encoding: 'utf8' })
}
