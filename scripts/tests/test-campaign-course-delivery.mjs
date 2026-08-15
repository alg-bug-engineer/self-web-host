import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'audit-campaign-course-delivery.mjs')
const report = JSON.parse(execFileSync(process.execPath, [script, '--json', '--expect-ready'], {
  cwd: projectDir,
  encoding: 'utf8',
}))

assert.equal(report.state, 'ready')
assert.equal(report.lessons, 12)
assert.equal(report.mediaType, 'public_preview')
assert.deepEqual(report.statusCounts, { local_ready: 12, published: 0, blocked: 0 })
assert.equal(report.missingAssets.length, 0)
assert.equal(report.invalidEntries.length, 0)
assert.ok(report.totalVideoBytes > 150 * 1024 * 1024)
assert.ok(report.totalVideoBytes < 250 * 1024 * 1024)
assert.deepEqual(report.ageScaffoldingGuide, {
  asset: 'content/courses/ai-native-generation/age-scaffolding-facilitator-guide.md',
  lessonSections: 12,
  ageBands: 3,
})
assert.deepEqual(report.evidenceMap, {
  asset: 'ops/campaigns/ai-native-generation-30d-course-evidence-map.json',
  verifiedAt: '2026-08-12',
  sources: 12,
  lessonMappings: 12,
  usePolicies: 4,
  disallowedClaims: 5,
  invalidSources: 0,
  invalidLessonMappings: 0,
})
assert.equal(report.worksheet.asset, 'output/pdf/ai-native-generation-l01-family-ai-footprint-card.pdf')
assert.equal(report.worksheet.attachmentAssetId, 'l01-family-ai-footprint-card')
assert.equal(report.worksheet.status, 'local_ready')
assert.equal(report.worksheet.pages, 1)
assert.equal(report.worksheet.pageSize, 'A4')
assert.ok(report.worksheet.bytes > 50 * 1024)
assert.ok(report.worksheet.bytes < 1024 * 1024)
assert.deepEqual(report.worksheet.missingPhrases, [])
assert.equal(report.successDisclosure, '本帖所附公开试听含生成式视觉与合成配音，不代表真实儿童或课程效果。')
assert.equal(report.fallbackPayloadChecks.length, 12)
assert.ok(report.fallbackPayloadChecks.every((item) => item.asset?.endsWith('-publish.txt')))
assert.ok(report.fallbackPayloadChecks.every((item) => item.claimsAttachedVideo === false))

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-delivery-audit-'))
try {
  const source = JSON.parse(fs.readFileSync(path.join(
    projectDir,
    'ops/campaigns/ai-native-generation-30d-course-delivery.json',
  ), 'utf8'))
  Object.assign(source.lessons[0], {
    status: 'published',
    publishedAt: '2026-08-13T09:00:00+08:00',
    externalUrl: 'https://wx.zsxq.com/group/88888881284242',
  })
  const invalidFile = path.join(tempDir, 'missing-subtitle-status.json')
  fs.writeFileSync(invalidFile, `${JSON.stringify(source, null, 2)}\n`)
  const invalid = JSON.parse(execFileSync(process.execPath, [script, '--file', invalidFile, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
  assert.ok(invalid.invalidEntries.some((item) => item.includes('subtitleAvailability')))
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign course delivery tests passed')
