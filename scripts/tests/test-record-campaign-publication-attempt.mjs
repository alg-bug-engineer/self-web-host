import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts/record-campaign-publication-attempt.mjs')
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'campaign-publication-attempt-'))
const log = path.join(tempDir, 'log.json')
const calendar = path.join(tempDir, 'calendar.json')
await fs.copyFile(path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-log.json'), log)
await fs.copyFile(path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-week1-content-calendar.json'), calendar)

try {
  const initialLog = JSON.parse(await fs.readFile(log, 'utf8'))
  const initialAttemptCount = initialLog.dailyRuns
    .find((item) => item.date === '2026-08-12')
    ?.externalPublishAttempts?.length || 0
  const initialCalendar = JSON.parse(await fs.readFile(calendar, 'utf8'))
  const initialCalendarStatus = initialCalendar.entries
    .find((item) => item.id === 'w1-zsxq-start')
    ?.status
  const common = [
    '--log', log,
    '--calendar', calendar,
    '--platform', 'zsxq',
    '--calendar-entry', 'w1-zsxq-start',
    '--action', 'publish',
    '--attempted-at', '2026-08-12T09:03:00+08:00',
    '--outcome', 'risk_control',
    '--evidence', '可见页面出现平台风险控制提示，未提交或取得公开主题 URL。',
    '--safe-next-action', '停止本时段外部写入，保留锁定草稿并等待平台状态恢复。',
    '--retry-not-before', '2026-08-12T11:00:00+08:00',
    '--json',
  ]
  const dry = run(common)
  assert.equal(dry.status, 0, dry.stderr)
  assert.equal(JSON.parse(dry.stdout).writesPerformed, false)
  assert.equal(
    JSON.parse(await fs.readFile(log, 'utf8')).dailyRuns
      .find((item) => item.date === '2026-08-12')
      ?.externalPublishAttempts?.length || 0,
    initialAttemptCount,
  )

  const applied = run([...common, '--apply'])
  assert.equal(applied.status, 0, applied.stderr)
  const savedLog = JSON.parse(await fs.readFile(log, 'utf8'))
  const saved = savedLog.dailyRuns.find((item) => item.date === '2026-08-12').externalPublishAttempts.at(-1)
  assert.equal(saved.outcome, 'risk_control')
  assert.equal(saved.terminal, false)
  assert.equal(saved.externalPublicationVerified, false)
  assert.equal(
    JSON.parse(await fs.readFile(calendar, 'utf8')).entries
      .find((item) => item.id === 'w1-zsxq-start')
      ?.status,
    initialCalendarStatus,
  )

  const duplicate = run([...common, '--apply'])
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /失败尝试已存在/)

  const invalidTerminal = run([...common, '--terminal'])
  assert.equal(invalidTerminal.status, 1)
  assert.match(invalidTerminal.stderr, /--terminal 只适用于/)
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('campaign publication attempt recorder tests passed')

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: projectDir, encoding: 'utf8' })
}
