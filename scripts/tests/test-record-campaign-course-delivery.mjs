import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'record-campaign-course-delivery.mjs')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-course-delivery-record-'))

try {
  const deliveryFile = copy('ops/campaigns/ai-native-generation-30d-course-delivery.json', 'delivery.json')
  const logFile = copy('ops/campaigns/ai-native-generation-30d-log.json', 'log.json')
  const calendarFile = copy('ops/campaigns/ai-native-generation-30d-week1-content-calendar.json', 'calendar.json')
  const calendar = JSON.parse(fs.readFileSync(calendarFile, 'utf8'))
  const companion = calendar.entries.find((item) => item.id === 'w1-zsxq-01')
  companion.status = 'published'
  companion.publishedAt = '2026-08-13T09:00:00+08:00'
  companion.externalUrl = 'https://t.zsxq.com/1uK2r'
  fs.writeFileSync(calendarFile, `${JSON.stringify(calendar, null, 2)}\n`)

  const common = [
    '--lesson', 'L01',
    '--published-at', '2026-08-13T09:00:00+08:00',
    '--url', 'https://t.zsxq.com/1uK2r',
    '--verification', '可见主题中显示 L01 视频上传完成且视频可播放；字幕状态未核验',
    '--delivery', deliveryFile,
    '--log', logFile,
    '--calendar', calendarFile,
    '--recorded-at', '2026-08-13T09:04:00+08:00',
    '--json',
  ]
  const before = fs.readFileSync(deliveryFile, 'utf8')
  const dryRun = run(common)
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(dryRun.subtitleAvailability, 'not_verified')
  assert.equal(fs.readFileSync(deliveryFile, 'utf8'), before)

  const subtitleWithoutEvidence = spawnSync(process.execPath, [script, ...common, '--subtitle-verified'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(subtitleWithoutEvidence.status, 1)
  assert.match(subtitleWithoutEvidence.stderr, /字幕可用证据/)

  const verifiedCommon = common.map((item) => item === '可见主题中显示 L01 视频上传完成且视频可播放；字幕状态未核验'
    ? '可见主题中显示 L01 视频上传完成且视频可播放，播放器字幕可用'
    : item)
  const applied = run([...verifiedCommon, '--subtitle-verified', '--apply'])
  assert.equal(applied.writesPerformed, true)
  assert.equal(applied.subtitleAvailability, 'verified_available')
  const delivery = JSON.parse(fs.readFileSync(deliveryFile, 'utf8'))
  assert.equal(delivery.lessons.find((item) => item.lessonId === 'L01').status, 'published')
  assert.equal(delivery.lessons.find((item) => item.lessonId === 'L01').subtitleAvailability, 'verified_available')
  const log = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  const dailyRun = log.dailyRuns.find((item) => item.date === '2026-08-13')
  assert.ok(dailyRun.outputs.some((item) => item.includes('L01') && item.includes('公开试听') && item.includes('可见可播放')))
  assert.ok(dailyRun.outputs.some((item) => item.includes('L01') && item.includes('字幕') && item.includes('可用')))

  const duplicate = spawnSync(process.execPath, [script, ...verifiedCommon, '--subtitle-verified', '--apply'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /已登记为 published/)

  const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
  assert.match(help, /默认只做 dry-run/)
  assert.match(help, /确认视频可播放/)
  assert.match(help, /--subtitle-verified/)
  assert.match(help, /本地字幕轨或 WebVTT 不代表平台字幕可用/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign course delivery record tests passed')

function copy(source, name) {
  const target = path.join(tempDir, name)
  fs.copyFileSync(path.join(projectDir, source), target)
  return target
}

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}
