import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts/audit-campaign-source-coverage.mjs')

const current = run([])
assert.equal(current.status, 0, current.stderr)
const currentReport = JSON.parse(current.stdout)
assert.equal(currentReport.state, 'ready')
assert.equal(currentReport.calendars, 5)
assert.ok(currentReport.longformEntries >= 25)
assert.ok(currentReport.entriesRequiringSources >= 5)
assert.equal(currentReport.entriesRequiringSources, currentReport.entriesWithSourceCoverage)
assert.equal(currentReport.externalWritesPerformed, false)

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'campaign-source-coverage-'))
try {
  const unsafeAsset = path.join(tempDir, 'unsafe.md')
  const safeAsset = path.join(tempDir, 'safe.md')
  const supportedAsset = path.join(tempDir, 'supported.md')
  const lowQualityAsset = path.join(tempDir, 'low-quality.md')
  const calendar = path.join(tempDir, 'calendar.json')
  await fs.writeFile(unsafeAsset, '研究显示，82% 的受访者已经掌握这项能力。\n', 'utf8')
  await fs.writeFile(safeAsset, [
    '下面是应被识别为反例、而不是公开断言的代码块：',
    '```text',
    '研究表明，这种方法适合所有儿童。',
    '```',
    '可核验说明见 https://example.org/primary-study 。',
  ].join('\n'), 'utf8')
  await fs.writeFile(supportedAsset, [
    '调查显示，82% 的受访家长选择先核验来源。',
    '原始研究：https://www.nist.gov/example/primary-survey',
  ].join('\n'), 'utf8')
  await fs.writeFile(lowQualityAsset, [
    '报告指出，这项方法适合所有家庭。',
    '推广页：https://marketing.example.org/course',
  ].join('\n'), 'utf8')
  await fs.writeFile(calendar, `${JSON.stringify({
    version: 1,
    campaignId: 'ai-native-generation-30d',
    entries: [
      { id: 'unsafe', date: '2026-08-12', platform: 'wechat', status: 'draft_ready', assets: [unsafeAsset] },
      { id: 'safe', date: '2026-08-12', platform: 'csdn', status: 'draft_ready', assets: [safeAsset] },
      { id: 'supported', date: '2026-08-12', platform: 'toutiao', status: 'draft_ready', assets: [supportedAsset] },
      { id: 'low-quality', date: '2026-08-12', platform: 'website', status: 'draft_ready', assets: [lowQualityAsset] },
    ],
  }, null, 2)}\n`, 'utf8')
  const blocked = run(['--calendar', calendar])
  assert.equal(blocked.status, 1)
  const report = JSON.parse(blocked.stdout)
  assert.equal(report.state, 'blocked')
  assert.ok(report.invalid.some((item) => item.includes('unsafe') && item.includes('没有官方机构')))
  assert.ok(report.invalid.some((item) => item.includes('low-quality') && item.includes('没有官方机构')))
  assert.equal(report.entries.find((entry) => entry.calendarEntryId === 'safe').sourceCoverage, true)
  assert.equal(report.entries.find((entry) => entry.calendarEntryId === 'safe').factualMarkers.length, 0)
  assert.equal(report.entries.find((entry) => entry.calendarEntryId === 'supported').sourceCoverage, true)
  assert.ok(report.entries.find((entry) => entry.calendarEntryId === 'supported').factualMarkers.length >= 1)
  assert.equal(report.entries.find((entry) => entry.calendarEntryId === 'supported').verifiableSourceUrls.length, 1)
  assert.equal(report.entries.find((entry) => entry.calendarEntryId === 'low-quality').verifiableSourceUrls.length, 0)
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('campaign source coverage tests passed')

function run(extraArgs) {
  return spawnSync(process.execPath, [script, ...extraArgs, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
}
