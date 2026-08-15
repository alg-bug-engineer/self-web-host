import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'select-campaign-topics-from-ai-news.mjs')
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'campaign-topic-radar-'))
const feedFile = path.join(tempDir, 'feed.json')

try {
  const feed = {
    generated_at: '2026-08-11T00:00:00Z',
    items: [
      {
        title_zh: 'AI 时代学生为什么需要数据素养：一份家长与教育工作者调查',
        url: 'https://www.unesco.org/example/data-literacy',
        source: 'UNESCO',
        published_at: '2026-08-11T08:00:00Z',
      },
      {
        title_zh: '研究人员讨论 AI 视频对孩子的安全风险',
        url: 'https://example.org/children-ai-video',
        source: 'Example News',
        published_at: '2026-08-11T07:00:00Z',
      },
      {
        title_zh: '新调查显示：AI 时代下，超八成家长和老师认为学生应具备更强的数据素养',
        url: 'https://www.ithome.com/0/988/056.htm',
        source: 'IT之家',
        published_at: '2026-08-10T15:21:19Z',
      },
      {
        title_zh: '最新调查显示：家长和教育工作者认为，人工智能的兴起要求学生培养更强的数据处理能力',
        url: 'https://phys.org/news/2026-08-survey-parents-ai-requires-students.html',
        source: 'Phys.org',
        published_at: '2026-08-10T15:07:25Z',
      },
      {
        title_zh: '我发现大学学生在考试中利用人工智能作弊',
        url: 'https://www.nature.com/articles/example-university-ai-cheating',
        source: 'Nature',
        published_at: '2026-08-10T09:50:05Z',
      },
      {
        title_zh: '刚刚曝光：学生家长教育数据素养 AI 碾压一切，传下周发布',
        url: 'https://rumor.example/clickbait',
        source: 'Rumor',
        published_at: '2026-08-11T09:00:00Z',
      },
      {
        title_zh: '芯片公司季度财报',
        url: 'https://finance.example/earnings',
        source: 'Finance',
        published_at: '2026-08-11T06:00:00Z',
      },
    ],
  }
  await fs.writeFile(feedFile, `${JSON.stringify(feed, null, 2)}\n`, 'utf8')
  const report = JSON.parse(execFileSync(process.execPath, [
    script,
    '--date', '2026-08-12',
    '--as-of', '2026-08-12T06:00:00+08:00',
    '--file', feedFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))

  assert.equal(report.inCampaign, true)
  assert.equal(report.week, 1)
  assert.equal(report.feedIsEvidence, false)
  assert.equal(report.feedFreshness.status, 'fresh')
  assert.equal(report.feedFreshness.candidateSelectionAllowed, true)
  assert.equal(report.externalWritesPerformed, false)
  assert.match(report.campaignTopic, /家庭 AI 足迹/)
  assert.equal(report.candidates[0].source, 'UNESCO')
  assert.equal(report.candidates[0].evidenceStatus, 'possible_primary_source_needs_opening')
  assert.equal(report.candidates[0].primaryVerificationRequired, true)
  assert.ok(report.candidates[0].aiContextSignals.includes('AI'))
  assert.ok(report.candidates[0].audienceGateSignals.includes('学生'))
  assert.ok(report.candidates.every((item) => item.title !== '芯片公司季度财报'))
  assert.ok(report.candidates.every((item) => !item.title.includes('大学学生在考试中')))
  const verifiedSurvey = report.candidates.find((item) => item.url === 'https://www.ithome.com/0/988/056.htm')
  assert.equal(verifiedSurvey.evidenceStatus, 'primary_verified_with_limits')
  assert.equal(verifiedSurvey.primaryVerificationRequired, false)
  assert.equal(verifiedSurvey.verifiedTopicId, '2026-08-us-three-state-data-ai-literacy-survey')
  assert.equal(
    verifiedSurvey.primarySourceUrl,
    'https://www.mathematica.org/publications/what-students-need-to-thrive-in-a-data-and-ai-driven-world',
  )
  assert.match(verifiedSurvey.evidenceAsset, /2026-08-11-research-data-literacy-survey\.md$/)
  assert.ok(verifiedSurvey.scopeLimits.some((item) => item.includes('不具美国全国代表性')))
  assert.match(verifiedSurvey.recommendedUse, /不得改写当天唯一任务/)
  assert.equal(verifiedSurvey.draftEligibility, 'bounded_support_only')
  assert.equal(
    report.candidates.filter((item) => item.verifiedTopicId === verifiedSurvey.verifiedTopicId).length,
    1,
  )
  const sensitive = report.candidates.find((item) => item.source === 'Example News')
  assert.ok(sensitive.sensitiveChildSafetySignals.includes('风险'))
  assert.equal(sensitive.draftEligibility, 'research_only_no_public_draft')
  const rumor = report.candidates.find((item) => item.source === 'Rumor')
  assert.ok(rumor)
  assert.deepEqual(rumor.penaltySignals.sort(), ['传', '刚刚', '曝光', '碾压'].sort())

  const outside = JSON.parse(execFileSync(process.execPath, [
    script,
    '--date', '2026-09-11',
    '--as-of', '2026-08-12T06:00:00+08:00',
    '--file', feedFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(outside.inCampaign, false)
  assert.deepEqual(outside.candidates, [])

  const stale = JSON.parse(execFileSync(process.execPath, [
    script,
    '--date', '2026-08-12',
    '--as-of', '2026-08-13T13:00:00Z',
    '--file', feedFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(stale.feedFreshness.status, 'stale')
  assert.equal(stale.feedFreshness.candidateSelectionAllowed, false)
  assert.deepEqual(stale.candidates, [])

  const unknownFeed = { ...feed }
  delete unknownFeed.generated_at
  await fs.writeFile(feedFile, `${JSON.stringify(unknownFeed, null, 2)}\n`, 'utf8')
  const unknown = JSON.parse(execFileSync(process.execPath, [
    script,
    '--date', '2026-08-12',
    '--as-of', '2026-08-12T06:00:00+08:00',
    '--file', feedFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(unknown.feedFreshness.status, 'unknown')
  assert.deepEqual(unknown.candidates, [])
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('campaign topic radar tests passed')
