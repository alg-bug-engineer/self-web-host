import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const projectDir = process.cwd()
const args = new Set(process.argv.slice(2))
const campaignDir = path.join(projectDir, 'ops', 'campaigns')
const auditScript = path.join(projectDir, 'scripts', 'audit-campaign-content-calendar.mjs')
const calendars = (await fs.readdir(campaignDir))
  .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
  .sort()
const reports = calendars.map((name) => JSON.parse(execFileSync(process.execPath, [
  auditScript,
  '--file', path.join('ops/campaigns', name),
  '--json',
], { cwd: projectDir, encoding: 'utf8' })))

const platformTotals = {}
for (const report of reports) {
  for (const item of report.platforms) {
    const total = platformTotals[item.platform] ||= {
      planned: 0,
      ready: 0,
      scheduled: 0,
      published: 0,
      blocked: 0,
      gap: 0,
    }
    for (const field of Object.keys(total)) total[field] += item[field] || 0
  }
}
const structuralIssues = reports.reduce((total, report) => total
  + report.missingAssets.length
  + report.invalidEntries.length
  + report.heldTrackingLinks.length, 0)
const externalGates = reports.flatMap((report) => report.blockers.map((blocker) => ({
  period: report.period,
  ...blocker,
})))
const report = {
  campaignId: reports[0]?.campaignId || null,
  period: {
    startsOn: reports[0]?.period.startsOn || null,
    endsOn: reports.at(-1)?.period.endsOn || null,
  },
  state: structuralIssues ? 'invalid' : externalGates.length ? 'ready_with_external_gates' : 'ready',
  calendars: reports.length,
  entries: reports.reduce((total, item) => total + item.entries, 0),
  structuralIssues,
  missingAssets: reports.reduce((total, item) => total + item.missingAssets.length, 0),
  invalidEntries: reports.reduce((total, item) => total + item.invalidEntries.length, 0),
  heldTrackingLinks: reports.reduce((total, item) => total + item.heldTrackingLinks.length, 0),
  platformTotals,
  externalGates,
  weeks: reports.map((item, index) => ({
    week: index + 1,
    period: item.period,
    entries: item.entries,
    state: item.state,
    structuralIssues: item.missingAssets.length + item.invalidEntries.length + item.heldTrackingLinks.length,
    externalGates: item.blockers.length,
  })),
}

if (args.has('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  const lines = [
    '# 30 天跨平台内容矩阵审计',
    '',
    `- 周期：${report.period.startsOn} → ${report.period.endsOn}`,
    `- 状态：${report.state}`,
    `- 周历 / 内容条目：${report.calendars} / ${report.entries}`,
    `- 结构问题：${report.structuralIssues}`,
    `- 外部门禁：${report.externalGates.length}`,
    '',
    '| 平台 | 规划 | 就绪 | 定时 | 已发布 | 阻断 | 缺口 |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(platformTotals).map(([platform, item]) =>
      `| ${platform} | ${item.planned} | ${item.ready} | ${item.scheduled} | ${item.published} | ${item.blocked} | ${item.gap} |`),
    '',
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
}
if (structuralIssues) process.exitCode = 1
