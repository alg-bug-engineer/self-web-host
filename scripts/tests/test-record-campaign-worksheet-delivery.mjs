import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'record-campaign-worksheet-delivery.mjs')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-worksheet-delivery-record-'))

try {
  const deliveryFile = copy('ops/campaigns/ai-native-generation-30d-course-delivery.json', 'delivery.json')
  const logFile = copy('ops/campaigns/ai-native-generation-30d-log.json', 'log.json')
  const manifestFile = copy('ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-13.json', 'manifest.json')
  const delivery = JSON.parse(fs.readFileSync(deliveryFile, 'utf8'))
  const lesson = delivery.lessons.find((item) => item.lessonId === 'L01')
  lesson.worksheetAttachmentAssetId = 'l01-family-ai-footprint-card'
  fs.writeFileSync(deliveryFile, `${JSON.stringify(delivery, null, 2)}\n`)
  const log = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  const dailyRun = log.dailyRuns.find((item) => item.date === '2026-08-12')
  dailyRun.date = '2026-08-13'
  dailyRun.externalPublishes = [{
    platform: 'zsxq',
    calendarEntryId: 'w1-zsxq-01',
    title: 'L01｜先不学提示词：找出今天替你做预测的 3 个 AI',
    publishedAt: '2026-08-13T09:00:00+08:00',
    url: 'https://t.zsxq.com/1uK2r',
    verification: '可见主题标题、正文和发布时间一致',
  }]
  fs.writeFileSync(logFile, `${JSON.stringify(log, null, 2)}\n`)

  const common = [
    '--lesson', 'L01',
    '--verified-at', '2026-08-13T09:06:00+08:00',
    '--url', 'https://t.zsxq.com/1uK2r',
    '--verification', '具体主题中显示家庭 AI 足迹卡 PDF 附件可见且可下载',
    '--delivery', deliveryFile,
    '--log', logFile,
    '--manifest', manifestFile,
    '--recorded-at', '2026-08-13T09:07:00+08:00',
    '--json',
  ]
  const before = fs.readFileSync(deliveryFile, 'utf8')
  const dryRun = run(common)
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.worksheetStatus, 'published_verified')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(fs.readFileSync(deliveryFile, 'utf8'), before)

  const groupUrl = spawnSync(process.execPath, [script, ...replace(common, 'https://t.zsxq.com/1uK2r', 'https://wx.zsxq.com/group/88888881284242')], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(groupUrl.status, 1)
  assert.match(groupUrl.stderr, /不能使用星球首页/)

  const wrongUrl = spawnSync(process.execPath, [script, ...replace(common, 'https://t.zsxq.com/1uK2r', 'https://t.zsxq.com/another')], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(wrongUrl.status, 1)
  assert.match(wrongUrl.stderr, /必须先登记同一知识星球承接主题/)

  const noAttachmentEvidence = spawnSync(process.execPath, [script, ...replace(common, '具体主题中显示家庭 AI 足迹卡 PDF 附件可见且可下载', '具体主题标题和正文已经公开可见')], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(noAttachmentEvidence.status, 1)
  assert.match(noAttachmentEvidence.stderr, /PDF 附件可见或可下载/)

  const applied = run([...common, '--apply'])
  assert.equal(applied.writesPerformed, true)
  assert.equal(applied.worksheetStatus, 'published_verified')
  const updatedDelivery = JSON.parse(fs.readFileSync(deliveryFile, 'utf8'))
  const updatedLesson = updatedDelivery.lessons.find((item) => item.lessonId === 'L01')
  assert.equal(updatedLesson.worksheetStatus, 'published_verified')
  assert.equal(updatedLesson.worksheetExternalUrl, 'https://t.zsxq.com/1uK2r')
  assert.match(updatedLesson.worksheetSha256, /^[a-f0-9]{64}$/)
  const updatedLog = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  const updatedRun = updatedLog.dailyRuns.find((item) => item.date === '2026-08-13')
  assert.ok(updatedRun.outputs.some((item) => item.includes('L01') && item.includes('练习卡') && item.includes('可见附件')))
  assert.ok(updatedRun.notes.some((item) => item.includes('三个独立状态')))

  const duplicate = spawnSync(process.execPath, [script, ...common, '--apply'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /已登记为 published_verified/)

  const tamperedManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  tamperedManifest.assets.find((item) => item.id === 'l01-family-ai-footprint-card').sha256 = '0'.repeat(64)
  const tamperedManifestFile = path.join(tempDir, 'tampered-manifest.json')
  fs.writeFileSync(tamperedManifestFile, `${JSON.stringify(tamperedManifest, null, 2)}\n`)
  const freshDelivery = JSON.parse(fs.readFileSync(deliveryFile, 'utf8'))
  const freshLesson = freshDelivery.lessons.find((item) => item.lessonId === 'L01')
  freshLesson.worksheetStatus = 'local_ready'
  delete freshLesson.worksheetPublishedAt
  delete freshLesson.worksheetVerifiedAt
  delete freshLesson.worksheetExternalUrl
  delete freshLesson.worksheetVerification
  delete freshLesson.worksheetSha256
  fs.writeFileSync(deliveryFile, `${JSON.stringify(freshDelivery, null, 2)}\n`)
  const tampered = spawnSync(process.execPath, [script, ...replace(common, manifestFile, tamperedManifestFile)], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(tampered.status, 1)
  assert.match(tampered.stderr, /SHA-256 与发布清单不一致/)

  const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
  assert.match(help, /默认只做 dry-run/)
  assert.match(help, /星球首页/)
  assert.match(help, /课程效果/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign worksheet delivery record tests passed')

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

function replace(values, source, target) {
  return values.map((value) => value === source ? target : value)
}
