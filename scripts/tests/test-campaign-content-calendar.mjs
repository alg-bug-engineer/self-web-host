import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'audit-campaign-content-calendar.mjs')
const zsxqPublishPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-start-here-publish.txt',
), 'utf8')
const xPublishPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
), 'utf8')
const xAugust13PublishPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-13-x-l01-publish.txt',
), 'utf8')
const zsxqAugust13PublishPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-publish.txt',
), 'utf8')
const xAugust14PublishPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-14-x-parent-question-publish.txt',
), 'utf8')
const zsxqAugust14PublishPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-14-zsxq-parent-question-publish.txt',
), 'utf8')
const wechatPublishArticle = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-12-wechat-article.md',
), 'utf8')
const week1Calendar = JSON.parse(fs.readFileSync(path.join(
  projectDir,
  'ops/campaigns/ai-native-generation-30d-week1-content-calendar.json',
), 'utf8'))
const report = JSON.parse(execFileSync(process.execPath, [script, '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))

assert.equal(report.state, 'blocked')
assert.equal(report.entries, 23)
assert.deepEqual(report.missingAssets, [])
assert.deepEqual(report.invalidEntries, [])
assert.equal(platform(report, 'website').ready, 1)
assert.equal(platform(report, 'website').gap, 0)
assert.equal(platform(report, 'website').blocked, 1)
assert.equal(platform(report, 'wechat').ready, 2)
assert.equal(report.wechatDraftChecks.length, 2)
assert.ok(report.wechatDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0 && item.hasDisclosure))
assert.equal(report.longformDraftChecks.length, 4)
assert.ok(report.longformDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0))
for (const id of ['w1-csdn-01', 'w1-toutiao-01']) {
  assert.ok(week1Calendar.entries.find((item) => item.id === id).assets
    .includes('content/campaigns/ai-native-generation-30d/2026-08-12-scheduled-longform-source-audit.md'))
}
assert.equal(report.directPayloadChecks.length, 12)
assert.equal(report.directPayloadChecks.filter((item) => item.ready).length, 10)
assert.equal(report.directPayloadChecks.filter((item) => item.requiresMetricsDecision).length, 2)
assert.equal(platform(report, 'csdn').ready, 1)
assert.equal(platform(report, 'x').ready, 5)
assert.equal(platform(report, 'toutiao').ready, 3)
assert.equal(platform(report, 'zsxq').ready, 7)
assert.equal(platform(report, 'video').ready, 3)
assert.ok(report.childDataSafetyChecks.length > 0)
assert.ok(report.childDataSafetyChecks.every((item) => item.ready))
assert.equal(
  report.childDataSafetyChecks.find((item) => item.id === 'w1-zsxq-start').asksForFamilyContribution,
  true,
)
assert.ok(report.blockers.some((item) => item.id === 'w1-website-course'))
assert.ok(wechatPublishArticle.startsWith('# 孩子问 AI 一个问题，得到的真的是“答案”吗？\n'))
assert.ok(wechatPublishArticle.includes('封面为即梦生成式插画，不代表真实学员或课程效果。'))
assert.ok(wechatPublishArticle.includes('儿童AI内测'))
assert.ok(wechatPublishArticle.includes('参与偏好：异步任务 / 集中答疑 / 两者都可'))
assert.ok(wechatPublishArticle.includes('当前只登记意向，不代表录取，也不收费。'))
assert.ok(!wechatPublishArticle.includes('## 公众号发布设置'))
assert.ok(!wechatPublishArticle.includes('建议发布时间'))
assert.ok(zsxqPublishPayload.startsWith('从这里开始｜10 分钟完成第一步，不需要补历史内容\n'))
assert.ok(zsxqPublishPayload.includes('场景｜给 AI 的输入类型｜AI 的输出类型｜最可能出错处｜最后谁检查'))
assert.ok([...zsxqPublishPayload].length <= 750)
assert.ok(zsxqPublishPayload.indexOf('今天不要补完') < 100)
assert.ok(zsxqPublishPayload.indexOf('场景｜给 AI 的输入类型') < 150)
assert.ok(zsxqPublishPayload.indexOf('可以直接复制') < 350)
assert.ok(zsxqPublishPayload.indexOf('不要写孩子姓名') < zsxqPublishPayload.indexOf('它不是提示词资料库'))
assert.ok(zsxqPublishPayload.includes('可以直接复制下面这行，把括号里的提示换掉'))
assert.ok(zsxqPublishPayload.includes('（使用场景）｜（只写输入类型）｜（只写输出类型）｜（一个可能错误）｜（孩子、家长或老师谁检查）'))
assert.ok(!zsxqPublishPayload.includes('运营动作'))
assert.ok(!zsxqPublishPayload.includes('首帖 24 小时执行卡'))
assert.ok(week1Calendar.entries.find((item) => item.id === 'w1-zsxq-start').assets
  .includes('content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-course-intake-bridge.md'))
const startCourseBridge = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-course-intake-bridge.md',
), 'utf8')
assert.ok(startCourseBridge.includes('只有监护人在起点主题中主动询问'))
assert.ok(startCourseBridge.includes('儿童AI内测-星球'))
assert.ok(startCourseBridge.includes('当前只登记意向，不代表录取，也不收费'))
assert.ok(startCourseBridge.includes('不在知识星球公开评论中追问或收集'))
assert.ok(!zsxqPublishPayload.includes('儿童AI内测-星球'))
assert.ok(xPublishPayload.startsWith('儿童 AI 素养不是提示词熟练度。'))
assert.ok(xPublishPayload.includes('一行家庭 AI 足迹'))
assert.ok(xPublishPayload.includes('https://wx.zsxq.com/group/88888881284242'))
assert.ok(!xPublishPayload.includes('建议发布时间'))
assert.ok(!xPublishPayload.includes('可选首评'))
assert.ok(!xPublishPayload.includes('发布核验'))
assert.ok(xAugust13PublishPayload.startsWith('今天先别教孩子背提示词。'))
assert.ok(!xAugust13PublishPayload.includes('发布核验'))
assert.ok(zsxqAugust13PublishPayload.startsWith('L01｜先不学提示词：找出今天替你做预测的 3 个 AI\n'))
assert.ok(zsxqAugust13PublishPayload.includes('如果你还没做昨天的“五格起点”，这条就是第一步'))
assert.ok(zsxqAugust13PublishPayload.includes('如果已经做过，请换一个不同场景，不要复制昨天那一行'))
assert.ok(zsxqAugust13PublishPayload.includes('视频里的完整练习会建议找 5 个；首轮试运行先找 3 个、评论只交 1 个'))
assert.ok(!zsxqAugust13PublishPayload.includes('星主首评'))
assert.ok(!zsxqAugust13PublishPayload.includes('激活指标'))
assert.ok(!zsxqAugust13PublishPayload.includes('计数口径'))
assert.ok(!zsxqAugust13PublishPayload.includes('回复模板'))
assert.ok(xAugust14PublishPayload.startsWith('家长谈孩子用 AI'))
assert.ok(!xAugust14PublishPayload.includes('可选首评'))
assert.ok(!xAugust14PublishPayload.includes('发布核验'))
assert.ok(zsxqAugust14PublishPayload.startsWith('第一周只问家长一个问题'))
assert.ok(!zsxqAugust14PublishPayload.includes('星主回复'))
assert.ok(!zsxqAugust14PublishPayload.includes('## 指标'))
assert.equal(report.xDraftChecks.length, 7)
assert.ok(report.xDraftChecks.every((item) => item.weightedLength <= item.limit))
assert.ok(xCheck(report, 'w1-x-01').weightedLength <= 280)
assert.equal(
  report.xDraftChecks.find((item) => item.asset.endsWith('2026-08-12-x-post-video-publish.txt')).weightedLength,
  251,
)
assert.deepEqual(report.mediaAttachmentChecks, [{
  id: 'w1-x-01',
  platform: 'x',
  status: 'local_ready',
  mediaType: 'public_preview_teaser',
  videoAsset: 'public/videos/campaigns/ai-native-generation-30d/2026-08-12-l01-x-teaser.mp4',
  successPublishAsset: 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-video-publish.txt',
  fallbackPublishAsset: 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
  topicMarker: '一行家庭 AI 足迹',
  assetsIncluded: true,
  hasSyntheticDisclosure: true,
  fallbackClaimsVideo: false,
  successHasTopic: true,
  fallbackHasTopic: true,
  hardSubtitles: false,
  muteFallbackStatus: 'key_points_only',
  accessibilityCheckAsset: 'content/campaigns/ai-native-generation-30d/2026-08-12-x-teaser-media-check.md',
  accessibilityBounded: true,
}])
assert.equal(report.trackingStatus, 'hold_until_course_page_public')
assert.deepEqual(report.heldTrackingLinks, [])

const week2 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-08-22', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(week2.period.startsOn, '2026-08-19')
assert.equal(week2.period.endsOn, '2026-08-25')
assert.equal(week2.state, 'blocked')
assert.equal(week2.entries, 23)
assert.deepEqual(week2.missingAssets, [])
assert.deepEqual(week2.invalidEntries, [])
assert.equal(platform(week2, 'website').ready, 1)
assert.equal(platform(week2, 'website').gap, 0)
assert.equal(platform(week2, 'website').blocked, 1)
assert.equal(platform(week2, 'wechat').ready, 2)
assert.ok(week2.wechatDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0 && item.hasDisclosure))
assert.equal(week2.longformDraftChecks.length, 4)
assert.ok(week2.longformDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0))
assert.equal(week2.directPayloadChecks.length, 12)
assert.equal(week2.directPayloadChecks.filter((item) => item.ready).length, 10)
assert.equal(week2.directPayloadChecks.filter((item) => item.requiresMetricsDecision).length, 2)
assert.equal(platform(week2, 'csdn').ready, 1)
assert.equal(platform(week2, 'x').ready, 5)
assert.equal(platform(week2, 'toutiao').ready, 3)
assert.equal(platform(week2, 'zsxq').ready, 7)
assert.equal(platform(week2, 'video').ready, 3)
assert.ok(week2.childDataSafetyChecks.length > 0)
assert.ok(week2.childDataSafetyChecks.every((item) => item.ready))

const week3 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-08-28', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(week3.period.startsOn, '2026-08-26')
assert.equal(week3.period.endsOn, '2026-09-01')
assert.equal(week3.state, 'blocked')
assert.equal(week3.entries, 23)
assert.deepEqual(week3.missingAssets, [])
assert.deepEqual(week3.invalidEntries, [])
assert.equal(platform(week3, 'website').ready, 1)
assert.equal(platform(week3, 'website').gap, 0)
assert.equal(platform(week3, 'website').blocked, 1)
assert.equal(platform(week3, 'wechat').ready, 2)
assert.ok(week3.wechatDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0 && item.hasDisclosure))
assert.equal(week3.longformDraftChecks.length, 4)
assert.ok(week3.longformDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0))
assert.equal(week3.directPayloadChecks.length, 12)
assert.equal(week3.directPayloadChecks.filter((item) => item.ready).length, 12)
assert.equal(platform(week3, 'csdn').ready, 1)
assert.equal(platform(week3, 'x').ready, 5)
assert.equal(platform(week3, 'toutiao').ready, 3)
assert.equal(platform(week3, 'zsxq').ready, 7)
assert.equal(platform(week3, 'video').ready, 3)
assert.ok(week3.childDataSafetyChecks.length > 0)
assert.ok(week3.childDataSafetyChecks.every((item) => item.ready))
assert.equal(week3.childDataSafetyChecks.find((item) => item.id === 'w3-zsxq-01').asksForFamilyContribution, true)
assert.equal(week3.childDataSafetyChecks.find((item) => item.id === 'w3-zsxq-07').asksForFamilyContribution, true)
assert.equal(week3.childDataSafetyChecks.find((item) => item.id === 'w3-zsxq-06').asksForFamilyContribution, true)
const betaPayload = fs.readFileSync(path.join(
  projectDir,
  'content/campaigns/ai-native-generation-30d/2026-08-31-course-beta-recruitment-publish.txt',
), 'utf8')
assert.ok(betaPayload.includes('## 为什么现在不开放付款'))
assert.ok(!betaPayload.includes('## 计量口径'))
assert.ok(!betaPayload.includes('qualifiedGuardianInterests'))
assert.ok(!betaPayload.includes('paidPilotFamilies'))
assert.equal(week3.courseBetaBoundaryChecks.length, 4)
assert.ok(week3.courseBetaBoundaryChecks.every((item) => item.ready))
assert.deepEqual(
  week3.courseBetaBoundaryChecks.map((item) => item.id).sort(),
  ['w3-website-review', 'w3-wechat-02', 'w3-x-04', 'w3-zsxq-06'],
)
assert.ok(week3.courseBetaBoundaryChecks.every((item) =>
  Object.values(item.requiredBoundaries).every(Boolean)
))

const week4 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-09-05', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(week4.period.startsOn, '2026-09-02')
assert.equal(week4.period.endsOn, '2026-09-08')
assert.equal(week4.state, 'blocked')
assert.equal(week4.entries, 23)
assert.deepEqual(week4.missingAssets, [])
assert.deepEqual(week4.invalidEntries, [])
assert.equal(platform(week4, 'website').ready, 1)
assert.equal(platform(week4, 'website').gap, 0)
assert.equal(platform(week4, 'website').blocked, 1)
assert.equal(platform(week4, 'wechat').ready, 2)
assert.ok(week4.wechatDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0 && item.hasDisclosure))
assert.equal(week4.longformDraftChecks.length, 4)
assert.ok(week4.longformDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0))
assert.equal(week4.directPayloadChecks.length, 12)
assert.equal(week4.directPayloadChecks.filter((item) => item.ready).length, 11)
assert.equal(week4.directPayloadChecks.filter((item) => item.requiresMetricsDecision).length, 1)
assert.equal(platform(week4, 'csdn').ready, 1)
assert.equal(platform(week4, 'x').ready, 5)
assert.equal(platform(week4, 'toutiao').ready, 3)
assert.equal(platform(week4, 'zsxq').ready, 7)
assert.equal(platform(week4, 'video').ready, 3)
assert.ok(week4.childDataSafetyChecks.length > 0)
assert.ok(week4.childDataSafetyChecks.every((item) => item.ready))
assert.equal(week4.childDataSafetyChecks.find((item) => item.id === 'w4-zsxq-04').asksForFamilyContribution, true)

const week5 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-09-10', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(week5.period.startsOn, '2026-09-09')
assert.equal(week5.period.endsOn, '2026-09-10')
assert.equal(week5.state, 'blocked')
assert.equal(week5.entries, 8)
assert.deepEqual(week5.missingAssets, [])
assert.deepEqual(week5.invalidEntries, [])
assert.equal(platform(week5, 'website').gap, 1)
assert.equal(platform(week5, 'wechat').ready, 1)
assert.ok(week5.wechatDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0 && item.hasDisclosure))
assert.equal(week5.longformDraftChecks.length, 2)
assert.ok(week5.longformDraftChecks.every((item) => item.titleMatches && item.internalMarkers.length === 0))
assert.equal(week5.directPayloadChecks.length, 4)
assert.equal(week5.directPayloadChecks.filter((item) => item.ready).length, 4)
assert.equal(platform(week5, 'csdn').ready, 1)
assert.equal(platform(week5, 'x').ready, 2)
assert.equal(platform(week5, 'toutiao').ready, 1)
assert.equal(platform(week5, 'zsxq').ready, 2)
assert.ok(week5.childDataSafetyChecks.length > 0)
assert.ok(week5.childDataSafetyChecks.every((item) => item.ready))
assert.equal(week5.childDataSafetyChecks.find((item) => item.id === 'w5-zsxq-01').asksForFamilyContribution, false)
assert.equal(week5.childDataSafetyChecks.find((item) => item.id === 'w5-zsxq-02').asksForFamilyContribution, true)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-calendar-x-'))
try {
  const oversizedDraft = path.join(tempDir, 'oversized-x-publish.txt')
  const fixtureCalendar = path.join(tempDir, 'calendar.json')
  fs.writeFileSync(oversizedDraft, `# X 超长夹具\n\n${'儿'.repeat(141)}\n`)
  fs.writeFileSync(fixtureCalendar, `${JSON.stringify({
    version: 1,
    campaignId: 'ai-native-generation-30d',
    period: { startsOn: '2026-08-12', endsOn: '2026-08-12', timezone: 'Asia/Shanghai' },
    cadenceTargets: { x: { minimum: 1, label: 'X' } },
    statusDefinitions: { draft_ready: 'ready' },
    entries: [{
      id: 'oversized-x',
      date: '2026-08-12',
      platform: 'x',
      title: 'oversized',
      status: 'draft_ready',
      assets: [oversizedDraft],
    }],
  }, null, 2)}\n`)
  const oversized = JSON.parse(execFileSync(process.execPath, [script, '--file', fixtureCalendar, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
  assert.equal(oversized.state, 'blocked')
  assert.ok(oversized.invalidEntries.some((item) => /加权长度 \d+ 超过 280/.test(item)))

  fs.writeFileSync(oversizedDraft, '# X 断链夹具\n\n课程：https://ai-knowledgepoints.cn/ai-native-generation\n')
  const heldLink = JSON.parse(execFileSync(process.execPath, [script, '--file', fixtureCalendar, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
  assert.equal(heldLink.heldTrackingLinks.length, 1)
  assert.ok(heldLink.invalidEntries.some((item) => item.includes('外发稿不得包含')))

  const activeTracking = path.join(tempDir, 'tracking.json')
  fs.writeFileSync(activeTracking, `${JSON.stringify({
    status: 'active',
    destination: 'https://ai-knowledgepoints.cn/ai-native-generation',
  }, null, 2)}\n`)
  const allowedLink = JSON.parse(execFileSync(process.execPath, [
    script,
    '--file', fixtureCalendar,
    '--tracking', activeTracking,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.deepEqual(allowedLink.heldTrackingLinks, [])
  assert.deepEqual(allowedLink.invalidEntries, [])

  const unsafeZsxqPayload = path.join(tempDir, 'unsafe-zsxq-publish.txt')
  const unsafeZsxqCalendar = path.join(tempDir, 'unsafe-zsxq-calendar.json')
  fs.writeFileSync(unsafeZsxqPayload, '请提交孩子的照片和学校\n\n## 计量口径\n\n`qualifiedGuardianInterests`\n')
  fs.writeFileSync(unsafeZsxqCalendar, `${JSON.stringify({
    version: 1,
    campaignId: 'ai-native-generation-30d',
    period: { startsOn: '2026-08-12', endsOn: '2026-08-12', timezone: 'Asia/Shanghai' },
    cadenceTargets: { zsxq: { minimum: 1, label: '知识星球' } },
    statusDefinitions: { draft_ready: 'ready' },
    entries: [{
      id: 'unsafe-zsxq',
      date: '2026-08-12',
      platform: 'zsxq',
      title: '请提交孩子的照片和学校',
      status: 'draft_ready',
      assets: [unsafeZsxqPayload],
    }],
  }, null, 2)}\n`)
  const unsafeZsxq = JSON.parse(execFileSync(process.execPath, [
    script,
    '--file', unsafeZsxqCalendar,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(unsafeZsxq.childDataSafetyChecks[0].ready, false)
  assert.ok(unsafeZsxq.invalidEntries.some((item) => item.includes('缺少儿童数据最小化提示')))
  assert.ok(unsafeZsxq.invalidEntries.some((item) => item.includes('纯发布载荷仍含内部字段')))
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign content calendar tests passed')

function platform(report, id) {
  return report.platforms.find((item) => item.platform === id)
}

function xCheck(report, id) {
  return report.xDraftChecks.find((item) => item.id === id)
}
