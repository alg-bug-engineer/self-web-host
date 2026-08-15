import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'record-campaign-research-task.mjs')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-research-record-'))
const queueFile = path.join(directory, 'queue.json')
const evidenceMapFile = path.join(directory, 'evidence.json')
const logFile = path.join(directory, 'log.json')
const outputFile = path.join(directory, 'r01-output.md')
const sourceIds = ['S02', 'S03', 'S04', 'S05']
const sources = sourceIds.map((id) => ({ id, url: `https://example.org/${id}` }))
fs.writeFileSync(queueFile, `${JSON.stringify({
  campaignId: 'ai-native-generation-30d',
  tasks: [{
    id: 'R01',
    dueOn: '2026-08-13',
    status: 'planned',
    sourceIds,
    mustReverifyOnline: false,
    outputAssets: [outputFile],
  }],
}, null, 2)}\n`)
fs.writeFileSync(evidenceMapFile, `${JSON.stringify({ sources }, null, 2)}\n`)
fs.writeFileSync(logFile, `${JSON.stringify({ campaignId: 'ai-native-generation-30d', dailyRuns: [] }, null, 2)}\n`)
fs.writeFileSync(outputFile, [
  '# 研究范围与来源',
  ...sources.map((source) => `- ${source.url}`),
  '## 来源支持',
  '限定来源只支持原则与风险边界。'.repeat(120),
  '## 课程教学假设',
  '家庭任务仍需真实验证。',
  '## 仍未知',
  '没有任务数据时保持未知。',
  '## 禁止公开',
  '不得推出课程效果、频率或真实家庭引语。',
].join('\n'))

try {
  const common = [
    '--task', 'R01',
    '--completed-at', '2026-08-13T10:00:00+08:00',
    ...sourceIds.flatMap((id) => ['--verified-source', id]),
    '--queue', queueFile,
    '--evidence-map', evidenceMapFile,
    '--log', logFile,
    '--recorded-at', '2026-08-13T10:05:00+08:00',
    '--json',
  ]
  const before = fs.readFileSync(queueFile, 'utf8')
  const dryRun = run(common)
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(dryRun.externalWritesPerformed, false)
  assert.equal(fs.readFileSync(queueFile, 'utf8'), before)

  const missingGates = spawnSync(process.execPath, [script, ...common, '--apply'], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(missingGates.status, 1)
  assert.match(missingGates.stderr, /--source-citations-verified 与 --privacy-verified/)

  const applied = run([...common, '--source-citations-verified', '--privacy-verified', '--apply'])
  assert.equal(applied.writesPerformed, true)
  assert.equal(applied.status, 'completed_verified')
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'))
  assert.equal(queue.tasks[0].result.containsChildData, false)
  assert.equal(queue.tasks[0].result.publicFactGate, 'primary_sources_required')
  assert.deepEqual(queue.tasks[0].result.verifiedSourceIds, sourceIds)
  const log = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  assert.ok(log.dailyRuns[0].outputs.some((item) => item.includes('R01') && item.includes(outputFile)))

  const duplicate = spawnSync(process.execPath, [script, ...common, '--source-citations-verified', '--privacy-verified', '--apply'], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /已登记为 completed_verified/)

  const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
  assert.match(help, /默认 dry-run/)
  assert.match(help, /NotebookLM 笔记不直接作为公开事实来源/)
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}

console.log('campaign research task recorder tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], { cwd: projectDir, encoding: 'utf8' }))
}
