import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'prepare-campaign-publish-payload.mjs')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-payload-'))

const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
assert.match(help, /省略时只做 dry-run/)
assert.match(help, /多个公开分支时会拒绝自动选择/)

try {
  const realZsxq = run(['--calendar-entry', 'w1-zsxq-03', '--json'])
  assert.equal(realZsxq.mode, 'dry_run')
  assert.equal(realZsxq.nextTitle, 'L02｜不用贴完整对话，只交 AI 三次回答里的一处变化')
  assert.match(realZsxq.payload, /^L02｜不用贴完整对话/m)
  assert.doesNotMatch(realZsxq.payload, /星主首评|回复模板|激活指标/)

  const realOfficeHours = run(['--calendar-entry', 'w1-zsxq-04', '--json'])
  assert.match(realOfficeHours.payload, /## 结束动作/)
  assert.doesNotMatch(realOfficeHours.payload, /记录指标|投票参与成员数/)

  const realPublicationGate = run(['--calendar-entry', 'w4-zsxq-03', '--json'])
  assert.match(realPublicationGate.payload, /状态只能选/)
  assert.match(realPublicationGate.payload, /do_not_publish/)

  const realDefenseWorkshop = run(['--calendar-entry', 'w4-zsxq-06', '--json'])
  assert.match(realDefenseWorkshop.payload, /本次只做家庭内部口头答辩/)
  assert.doesNotMatch(realDefenseWorkshop.payload, /星主反馈顺序/)

  const realDistributionX = run(['--calendar-entry', 'w2-x-01', '--json'])
  assert.equal(realDistributionX.platform, 'x')
  assert.ok(realDistributionX.weightedLength <= 280)
  assert.match(realDistributionX.payload, /^别急着让 AI 回答。/)
  assert.doesNotMatch(realDistributionX.payload, /知识星球|今日头条|建议发布时间/)
  assert.ok(realDistributionX.outputAsset.endsWith('-x-publish.txt'))

  const realDistributionZsxq = run(['--calendar-entry', 'w2-zsxq-01', '--json'])
  assert.equal(realDistributionZsxq.platform, 'zsxq')
  assert.equal(realDistributionZsxq.nextTitle, 'L04｜先别让 AI 回答：把一个模糊任务修理成可检查的问题')
  assert.match(realDistributionZsxq.payload, /评论区只提交四项/)
  assert.doesNotMatch(realDistributionZsxq.payload, /转化动作|## X|今日头条/)
  assert.ok(realDistributionZsxq.outputAsset.endsWith('-zsxq-publish.txt'))
  assert.notEqual(realDistributionX.outputAsset, realDistributionZsxq.outputAsset)

  const xSource = path.join(tempDir, 'x.md')
  const zsxqSource = path.join(tempDir, 'zsxq.md')
  const branchSource = path.join(tempDir, 'branch.md')
  fs.writeFileSync(xSource, '# 内部标题\n\n## 主帖\n\n公开 X 正文。\n\n## 发布核验\n\n不要发布这一段。\n')
  fs.writeFileSync(zsxqSource, '# 内部标题\n\n## 标题\n\n公开星球标题\n\n## 正文\n\n公开星球正文。\n\n## 回复模板\n\n不要发布。\n')
  fs.writeFileSync(branchSource, '# 复盘\n\n## 公开复盘稿\n\n### 有反馈\n\n版本一\n\n### 无反馈\n\n版本二\n')
  const calendarFile = path.join(tempDir, 'calendar.json')
  fs.writeFileSync(calendarFile, `${JSON.stringify({
    campaignId: 'ai-native-generation-30d',
    entries: [
      { id: 'test-x', platform: 'x', title: 'X 测试', status: 'draft_ready', assets: [xSource] },
      { id: 'test-zsxq', platform: 'zsxq', title: '旧标题', status: 'draft_ready', assets: [zsxqSource] },
      { id: 'test-branch', platform: 'zsxq', title: '复盘', status: 'draft_ready', assets: [branchSource] },
    ],
  }, null, 2)}\n`)

  const appliedX = run(['--calendar', calendarFile, '--calendar-entry', 'test-x', '--apply', '--json'])
  assert.equal(appliedX.writesPerformed, true)
  assert.equal(fs.readFileSync(path.join(tempDir, 'x-publish.txt'), 'utf8'), '公开 X 正文。\n')
  const appliedZsxq = run(['--calendar', calendarFile, '--calendar-entry', 'test-zsxq', '--apply', '--json'])
  assert.equal(appliedZsxq.writesPerformed, true)
  assert.equal(fs.readFileSync(path.join(tempDir, 'zsxq-publish.txt'), 'utf8'), '公开星球标题\n\n公开星球正文。\n')
  const updatedCalendar = JSON.parse(fs.readFileSync(calendarFile, 'utf8'))
  assert.equal(updatedCalendar.entries.find((item) => item.id === 'test-zsxq').title, '公开星球标题')
  assert.ok(updatedCalendar.entries.find((item) => item.id === 'test-x').assets[0].endsWith('x-publish.txt'))
  assert.equal(run(['--calendar', calendarFile, '--calendar-entry', 'test-x', '--apply', '--json']).writesPerformed, false)

  const branch = spawnSync(process.execPath, [
    script,
    '--calendar', calendarFile,
    '--calendar-entry', 'test-branch',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(branch.status, 1)
  assert.match(branch.stderr, /包含数据分支/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign publish payload tests passed')

function run(values) {
  return JSON.parse(execFileSync(process.execPath, [script, ...values], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}
