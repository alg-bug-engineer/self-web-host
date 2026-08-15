import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'verify-campaign-publish-manifest.mjs')
const manifestFile = path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-12.json')
const l01ManifestFile = path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-13.json')

const report = JSON.parse(execFileSync(process.execPath, [script, '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(report.state, 'ready')
assert.equal(report.assets.length, 4)
assert.deepEqual(report.invalid, [])
assert.ok(report.assets.filter((item) => item.weightedLength != null).every((item) => item.weightedLength <= 280))
assert.ok(report.runtimeDerivative.requiredOutputFields.includes('contentSha256'))
assert.equal(report.runtimeDerivative.shareQrDecoderScript, 'scripts/decode-zsxq-share-qr.mjs')
assert.match(report.runtimeDerivative.shareQrDecoderCommandTemplate, /campaign:zsxq:share-qr/)
assert.ok(report.runtimeDerivative.shareQrRequiredOutputFields.includes('imageSha256'))
assert.equal(report.writesPerformed, false)
const teaserVideo = report.assets.find((item) => item.id === 'x-teaser-video')
assert.equal(teaserVideo.media.videoCodec, 'h264')
assert.equal(teaserVideo.media.audioCodec, 'aac')
assert.equal(teaserVideo.media.subtitleCodec, 'mov_text')
assert.equal(teaserVideo.media.subtitleLanguage, 'zho')
assert.ok(teaserVideo.media.durationSeconds >= 57.8 && teaserVideo.media.durationSeconds <= 58)
assert.ok(teaserVideo.media.subtitleDurationSeconds <= teaserVideo.media.durationSeconds)

const l01Report = JSON.parse(execFileSync(process.execPath, [
  script,
  '--manifest', l01ManifestFile,
  '--json',
], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(l01Report.state, 'ready')
assert.equal(l01Report.date, '2026-08-13')
assert.equal(l01Report.assets.length, 5)
assert.deepEqual(l01Report.invalid, [])
assert.ok(l01Report.assets.find((item) => item.id === 'l01-video').bytes > 0)
assert.ok(l01Report.assets.find((item) => item.id === 'l01-family-ai-footprint-card').bytes > 0)
assert.equal(l01Report.runtimeDerivative, undefined)

const l01Manifest = JSON.parse(fs.readFileSync(l01ManifestFile, 'utf8'))
const l01Fallback = fs.readFileSync(path.join(projectDir, l01Manifest.assets.find((item) => item.id === 'zsxq-l01-text-fallback').file), 'utf8')
const l01VideoSuccess = fs.readFileSync(path.join(projectDir, l01Manifest.assets.find((item) => item.id === 'zsxq-l01-video-success').file), 'utf8')
assert.equal(
  l01VideoSuccess,
  `${l01Fallback.trimEnd()}\n\n本帖所附公开试听含生成式视觉与合成配音，不代表真实儿童或课程效果。\n`,
)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-publish-manifest-'))
try {
  const tamperedManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  tamperedManifest.assets[0].sha256 = '0'.repeat(64)
  const tamperedFile = path.join(tempDir, 'tampered.json')
  fs.writeFileSync(tamperedFile, JSON.stringify(tamperedManifest))
  const rejected = spawnSync(process.execPath, [script, '--manifest', tamperedFile, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(rejected.status, 1)
  assert.match(rejected.stdout, /SHA-256 不匹配/)

  const wrongMediaManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  wrongMediaManifest.assets.find((item) => item.id === 'x-teaser-video').expectedMedia.width = 1280
  const wrongMediaFile = path.join(tempDir, 'wrong-media.json')
  fs.writeFileSync(wrongMediaFile, JSON.stringify(wrongMediaManifest))
  const wrongMedia = spawnSync(process.execPath, [script, '--manifest', wrongMediaFile, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(wrongMedia.status, 1)
  assert.match(wrongMedia.stdout, /视频宽度/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign publish manifest tests passed')
