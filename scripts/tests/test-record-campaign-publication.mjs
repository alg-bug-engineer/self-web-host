import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'record-campaign-publication.mjs')
const operatorScript = path.join(projectDir, 'scripts', 'generate-campaign-operator-pack.mjs')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-publication-'))
const xVideoAsset = 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-video-publish.txt'
const xVideoHash = '67bd1660e86dc9d334d7e65ca7c487b36abb7e2c14cc465a44184a4c804065d0'
const zsxqStartAsset = 'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-start-here-publish.txt'
const zsxqStartHash = '86f5f533145f854ce9e5bd667d7596b3e63ef73bbf8826d9d31932f4bd1fe7f0'
const zsxqL01Asset = 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-publish.txt'
const zsxqL01Hash = '4fd0141b48cdfe524ebb57e50a07f568b6af0c650b598f5d3f6cdb62d0526946'
const csdnSourceAsset = 'content/campaigns/ai-native-generation-30d/2026-08-12-csdn-verification-pipeline.md'
const csdnSourceHash = '90f85fc61460809fbc829e734573af53f5656299337607465ce7a8bb51f70401'
const toutiaoSourceAsset = 'content/campaigns/ai-native-generation-30d/2026-08-12-toutiao-three-prompts.md'
const toutiaoSourceHash = '80b5ba79388904bdcf906b2987e42452bf6b8558d123dd8a9b20cc3039f43ca0'

const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
assert.match(help, /省略时只做 dry-run/)
assert.match(help, /看不到的指标直接省略/)
assert.match(help, /--media-verified/)
assert.match(help, /--subtitle-verified/)
assert.match(help, /--alt-text-verified/)
assert.match(help, /--content-sha256/)
assert.match(help, /--content-file/)
assert.match(help, /--crosslink-destination/)
assert.match(help, /--source-file/)
assert.match(help, /不声称平台最终渲染逐字一致/)

try {
  const logFile = copy('ops/campaigns/ai-native-generation-30d-log.json', 'log.json')
  const calendarFile = copy('ops/campaigns/ai-native-generation-30d-week1-content-calendar.json', 'calendar.json')
  const fixtureEntryIds = new Set([
    'w1-csdn-01',
    'w1-x-01',
    'w1-zsxq-start',
    'w1-zsxq-01',
    'w1-toutiao-01',
  ])
  const fixtureLog = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  for (const dailyRun of fixtureLog.dailyRuns || []) {
    dailyRun.externalPublishes = (dailyRun.externalPublishes || [])
      .filter((item) => !fixtureEntryIds.has(item.calendarEntryId))
  }
  fs.writeFileSync(logFile, `${JSON.stringify(fixtureLog, null, 2)}\n`)

  const fixtureCalendar = JSON.parse(fs.readFileSync(calendarFile, 'utf8'))
  for (const entry of fixtureCalendar.entries || []) {
    if (entry.id === 'w1-x-01') entry.status = 'media_ready'
    if (entry.id === 'w1-zsxq-start') entry.status = 'draft_ready'
    if (entry.id === 'w1-x-01' || entry.id === 'w1-zsxq-start') {
      delete entry.externalUrl
      delete entry.publishedAt
      delete entry.pinned
    }
  }
  fs.writeFileSync(calendarFile, `${JSON.stringify(fixtureCalendar, null, 2)}\n`)
  const common = [
    '--platform', 'csdn',
    '--title', '别只教孩子写提示词：把 AI 回答拆成一条可验证的流水线',
    '--published-at', '2026-08-12T10:15:30+08:00',
    '--url', 'https://blog.csdn.net/example/article/details/163672964',
    '--external-id', '163672964',
    '--verification', '公开页显示标题、正文、发布时间和公开状态一致',
    '--source-file', csdnSourceAsset,
    '--source-sha256', csdnSourceHash,
    '--calendar-entry', 'w1-csdn-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--recorded-at', '2026-08-12T10:18:00+08:00',
    '--json',
  ]
  const before = fs.readFileSync(logFile, 'utf8')
  const initialLog = JSON.parse(before)
  const initialDayPublishCount = initialLog.dailyRuns
    .find((item) => item.date === '2026-08-12')
    ?.externalPublishes?.length || 0
  const initialSharedZsxqCount = initialLog.dailyRuns
    .flatMap((item) => item.externalPublishes || [])
    .filter((item) => item.platform === 'zsxq' && item.sharedGroupUrl)
    .length
  const dryRun = run(common)
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(dryRun.publication.initialMetricsStatus, 'not_obtained')
  assert.deepEqual(dryRun.publication.sourceIntegrity, {
    status: 'verified_reviewed_source',
    file: csdnSourceAsset,
    sha256: csdnSourceHash,
    bytes: 6253,
    scope: 'reviewed_source_not_final_platform_render',
  })
  assert.equal(fs.readFileSync(logFile, 'utf8'), before)

  const wrongSourceHash = spawnSync(process.execPath, [script,
    ...common.map((item) => item === csdnSourceHash ? 'a'.repeat(64) : item),
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(wrongSourceHash.status, 1)
  assert.match(wrongSourceHash.stderr, /与已审校源稿不一致/)

  const previewUrl = spawnSync(process.execPath, [script, ...common.map((item) =>
    item === 'https://blog.csdn.net/example/article/details/163672964'
      ? 'https://mp.toutiao.com/profile_v4/graphic/preview?pgc_id=7672708790810165812'
      : item
  )], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(previewUrl.status, 1)
  assert.match(previewUrl.stderr, /不是 csdn 可核验的公开内容地址/)

  const invalidMetric = spawnSync(process.execPath, [script, ...common, '--reads', '-1'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(invalidMetric.status, 1)
  assert.match(invalidMetric.stderr, /--reads 必须是非负整数/)

  const invalidPinnedPlatform = spawnSync(process.execPath, [script, ...common, '--pinned'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(invalidPinnedPlatform.status, 1)
  assert.match(invalidPinnedPlatform.stderr, /--pinned 只适用于知识星球/)

  const invalidMediaEntry = spawnSync(process.execPath, [script, ...common, '--media-verified'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(invalidMediaEntry.status, 1)
  assert.match(invalidMediaEntry.stderr, /mediaAttachment/)

  const invalidSubtitleOnly = spawnSync(process.execPath, [script, ...common, '--subtitle-verified'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(invalidSubtitleOnly.status, 1)
  assert.match(invalidSubtitleOnly.stderr, /同时使用 --media-verified/)

  const invalidAltTextOnly = spawnSync(process.execPath, [script, ...common, '--alt-text-verified'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(invalidAltTextOnly.status, 1)
  assert.match(invalidAltTextOnly.stderr, /同时使用 --media-verified/)

  const invalidContentHash = spawnSync(process.execPath, [script, ...common, '--content-sha256', 'ABC'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(invalidContentHash.status, 1)
  assert.match(invalidContentHash.stderr, /64 位小写十六进制/)

  const websiteHomepage = spawnSync(process.execPath, [script,
    '--platform', 'website',
    '--title', 'AI 原生一代：儿童 AI 素养课程页',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://ai-knowledgepoints.cn/',
    '--verification', '网站首页返回 200，但课程页路径尚未公开，不能作为上线证据',
    '--calendar-entry', 'w1-website-course',
    '--log', logFile,
    '--calendar', calendarFile,
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(websiteHomepage.status, 1)
  assert.match(websiteHomepage.stderr, /不是 website 可核验的公开内容地址/)

  const wechatLegacyShare = run([
    '--platform', 'wechat',
    '--title', '孩子问 AI 一个问题，得到的真的是“答案”吗？',
    '--published-at', '2026-08-14T09:00:00+08:00',
    '--url', 'https://mp.weixin.qq.com/s?__biz=test&mid=1',
    '--verification', '公众号公开文章页显示标题、作者、正文和发布时间一致',
    '--calendar-entry', 'w1-wechat-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--reads', '10',
    '--likes', '0',
    '--json',
  ])
  assert.equal(wechatLegacyShare.mode, 'dry_run')
  assert.equal(wechatLegacyShare.publication.initialMetricsStatus, 'captured')

  const applied = run([...common, '--apply'])
  assert.equal(applied.mode, 'apply')
  assert.equal(applied.writesPerformed, true)
  const log = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  const runForDay = log.dailyRuns.find((item) => item.date === '2026-08-12')
  assert.equal(runForDay.externalPublishes.length, initialDayPublishCount + 1)
  assert.equal(runForDay.externalPublishes.at(-1).externalId, '163672964')
  const calendar = JSON.parse(fs.readFileSync(calendarFile, 'utf8'))
  const entry = calendar.entries.find((item) => item.id === 'w1-csdn-01')
  assert.equal(entry.status, 'published')
  assert.equal(entry.externalUrl, 'https://blog.csdn.net/example/article/details/163672964')
  const sameDayAfterCsdn = JSON.parse(execFileSync(process.execPath, [
    operatorScript,
    '--date', '2026-08-12',
    '--log', logFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  const verifiedCsdn = sameDayAfterCsdn.scheduledPublishes.find((item) => item.platform === 'csdn')
  assert.equal(verifiedCsdn.status, 'published_verified')
  assert.equal(verifiedCsdn.publicUrl, 'https://blog.csdn.net/example/article/details/163672964')
  assert.equal(
    sameDayAfterCsdn.dueContentActions.find((item) => item.platform === 'csdn').status,
    'published',
  )
  assert.ok(sameDayAfterCsdn.operatorChecks.some((item) => item.includes('csdn 定时稿已取得公开发布证据')))

  const wrongBoundHash = spawnSync(process.execPath, [script,
    '--platform', 'x',
    '--title', '一行家庭 AI 足迹：输入、输出、错误和检查责任',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://x.com/QilaiZ13578/status/2087999999999999998',
    '--verification', 'X 公开状态页显示完整正文和发布时间，可见内容已人工核对',
    '--content-file', xVideoAsset,
    '--content-sha256', 'a'.repeat(64),
    '--calendar-entry', 'w1-x-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(wrongBoundHash.status, 1)
  assert.match(wrongBoundHash.stderr, /与最终正文不一致/)

  const crosslinkDestination = 'https://t.zsxq.com/1uK2r'
  const crosslinkSource = fs.readFileSync(path.join(projectDir, xVideoAsset), 'utf8')
  const crosslinkPayload = crosslinkSource.replace(
    'https://wx.zsxq.com/group/88888881284242',
    crosslinkDestination,
  )
  const crosslinkHash = crypto.createHash('sha256').update(crosslinkPayload).digest('hex')
  const xCrosslinkDryRun = run([
    '--platform', 'x',
    '--title', '一行家庭 AI 足迹：输入、输出、错误和检查责任',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://x.com/QilaiZ13578/status/2087999999999999999',
    '--verification', 'X 公开状态页显示完整直链正文、发布时间和公开状态一致',
    '--content-file', xVideoAsset,
    '--content-sha256', crosslinkHash,
    '--crosslink-destination', crosslinkDestination,
    '--calendar-entry', 'w1-x-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ])
  assert.equal(xCrosslinkDryRun.publication.contentIntegrity.status, 'verified_runtime_crosslink')
  assert.equal(xCrosslinkDryRun.publication.contentIntegrity.crosslinkDestination, crosslinkDestination)

  const altTextWithoutEvidence = spawnSync(process.execPath, [script,
    '--platform', 'x',
    '--title', '一行家庭 AI 足迹：输入、输出、错误和检查责任',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://x.com/QilaiZ13578/status/2087999999999999997',
    '--verification', 'X 时间线显示完整视频版正文，附加视频可播放但没有核验替代文本',
    '--content-file', xVideoAsset,
    '--content-sha256', xVideoHash,
    '--media-verified',
    '--alt-text-verified',
    '--calendar-entry', 'w1-x-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(altTextWithoutEvidence.status, 1)
  assert.match(altTextWithoutEvidence.stderr, /替代文本已设置或可用/)

  const xVideo = run([
    '--platform', 'x',
    '--title', '一行家庭 AI 足迹：输入、输出、错误和检查责任',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://x.com/QilaiZ13578/status/2088000000000000000',
    '--verification', 'X 时间线显示完整视频版正文，附加视频可播放；媒体详情显示替代文本已设置并可用；字幕状态未核验',
    '--content-file', xVideoAsset,
    '--content-sha256', xVideoHash,
    '--media-verified',
    '--alt-text-verified',
    '--calendar-entry', 'w1-x-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--recorded-at', '2026-08-12T09:03:00+08:00',
    '--json',
    '--apply',
  ])
  assert.equal(xVideo.publication.media.playable, true)
  assert.equal(xVideo.publication.media.sha256, '9aead46a0c35daf8fa01411609e90c6934ce123d92d4033472497a52218b34d9')
  assert.equal(xVideo.publication.media.bytes, 3213342)
  assert.equal(xVideo.publication.calendarEntryId, 'w1-x-01')
  assert.equal(xVideo.publication.contentSha256, xVideoHash)
  assert.equal(xVideo.publication.contentIntegrity.status, 'verified_local_file')
  assert.equal(xVideo.publication.contentIntegrity.file, xVideoAsset)
  assert.equal(xVideo.publication.media.subtitleStatus, 'not_verified')
  assert.equal(xVideo.publication.media.altTextStatus, 'verified_available')
  assert.deepEqual(xVideo.publication.media.altText, {
    sha256: 'ff289ea6a4fe3a3ba1ba0cf08ab51748d8937e22a1d6aad6b0a7eef10bec94d6',
    characters: 107,
  })
  const xEntry = JSON.parse(fs.readFileSync(calendarFile, 'utf8')).entries
    .find((item) => item.id === 'w1-x-01')
  assert.equal(xEntry.mediaAttachment.status, 'published')
  assert.equal(xEntry.mediaAttachment.sha256, '9aead46a0c35daf8fa01411609e90c6934ce123d92d4033472497a52218b34d9')
  assert.equal(xEntry.mediaAttachment.subtitleAvailability, 'not_verified_after_platform_upload')
  assert.equal(xEntry.mediaAttachment.altTextAvailability, 'verified_available')

  const preGate = spawnSync(process.execPath, [script,
    '--platform', 'zsxq',
    '--title', '从这里开始｜10 分钟完成第一步，不需要补历史内容',
    '--published-at', '2026-08-12T08:45:00+08:00',
    '--url', 'https://t.zsxq.com/1uK2r',
    '--verification', '星球可见分享面板生成主题二维码，解析得到该公开主题短链',
    '--content-sha256', zsxqStartHash,
    '--calendar-entry', 'w1-zsxq-start',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(preGate.status, 1)
  assert.match(preGate.stderr, /公开时间早于活动门禁 2026-08-12T09:00:00\+08:00/)

  const zsxqTopicShareDryRun = run([
    '--platform', 'zsxq',
    '--title', '从这里开始｜10 分钟完成第一步，不需要补历史内容',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://t.zsxq.com/1uK2r',
    '--verification', '星球可见分享面板生成主题二维码，解析得到该公开主题短链',
    '--content-file', zsxqStartAsset,
    '--content-sha256', zsxqStartHash,
    '--calendar-entry', 'w1-zsxq-start',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ])
  assert.equal(zsxqTopicShareDryRun.publication.url, 'https://t.zsxq.com/1uK2r')
  assert.equal(zsxqTopicShareDryRun.publication.sharedGroupUrl, undefined)
  assert.equal(zsxqTopicShareDryRun.publicationNotBefore, '2026-08-12T09:00:00+08:00')
  assert.equal(zsxqTopicShareDryRun.publication.contentIntegrity.status, 'verified_local_file')

  const weeklyReviewPreGate = spawnSync(process.execPath, [script,
    '--platform', 'x',
    '--title', '第一周复盘',
    '--published-at', '2026-08-18T19:59:59+08:00',
    '--url', 'https://x.com/QilaiZ13578/status/2088000000000000001',
    '--verification', 'X 公开状态页显示第一周复盘完整正文和发布时间',
    '--content-sha256', '0'.repeat(64),
    '--calendar-entry', 'w1-x-05',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(weeklyReviewPreGate.status, 1)
  assert.match(weeklyReviewPreGate.stderr, /公开时间早于活动门禁 2026-08-18T20:00:00\+08:00/)

  const weeklyReviewFile = path.join(tempDir, '2026-08-18-x-week1-review-publish.txt')
  const weeklyReviewText = '第一周公开复盘：只报告去标识化汇总。\n'
  fs.writeFileSync(weeklyReviewFile, weeklyReviewText)
  const weeklyReviewHash = crypto.createHash('sha256').update(weeklyReviewText).digest('hex')
  const weeklyReviewAtGate = run([
    '--platform', 'x',
    '--title', '第一周复盘',
    '--published-at', '2026-08-18T20:00:00+08:00',
    '--url', 'https://x.com/QilaiZ13578/status/2088000000000000001',
    '--verification', 'X 公开状态页显示第一周复盘完整正文和发布时间',
    '--content-file', weeklyReviewFile,
    '--content-sha256', weeklyReviewHash,
    '--calendar-entry', 'w1-x-05',
    '--log', logFile,
    '--calendar', calendarFile,
    '--json',
  ])
  assert.equal(weeklyReviewAtGate.publicationNotBefore, '2026-08-18T20:00:00+08:00')
  assert.equal(weeklyReviewAtGate.publication.contentIntegrity.status, 'verified_local_file')

  const zsxqStart = run([
    '--platform', 'zsxq',
    '--title', '从这里开始｜10 分钟完成第一步，不需要补历史内容',
    '--published-at', '2026-08-12T09:00:00+08:00',
    '--url', 'https://wx.zsxq.com/group/88888881284242',
    '--verification', '星球最新动态显示完整正文、发布时间、阅读数和可见置顶状态',
    '--content-file', zsxqStartAsset,
    '--content-sha256', zsxqStartHash,
    '--pinned',
    '--reads', '1',
    '--comments', '0',
    '--likes', '0',
    '--calendar-entry', 'w1-zsxq-start',
    '--log', logFile,
    '--calendar', calendarFile,
    '--recorded-at', '2026-08-12T09:02:00+08:00',
    '--json',
    '--apply',
  ])
  assert.equal(zsxqStart.publication.sharedGroupUrl, true)
  assert.equal(zsxqStart.publication.calendarEntryId, 'w1-zsxq-start')
  assert.equal(zsxqStart.publication.pinned, true)
  assert.equal(zsxqStart.publication.initialMetricsStatus, 'captured')
  assert.deepEqual(zsxqStart.publication.initialMetrics, { reads: 1, likes: 0, comments: 0 })
  assert.equal(
    JSON.parse(fs.readFileSync(calendarFile, 'utf8')).entries.find((item) => item.id === 'w1-zsxq-start').pinned,
    true,
  )

  const zsxqL01 = run([
    '--platform', 'zsxq',
    '--title', 'L01｜先不学提示词：找出今天替你做预测的 3 个 AI',
    '--published-at', '2026-08-13T09:00:00+08:00',
    '--url', 'https://wx.zsxq.com/group/88888881284242',
    '--verification', '星球最新动态显示 L01 完整正文、发布时间和阅读数',
    '--content-file', zsxqL01Asset,
    '--content-sha256', zsxqL01Hash,
    '--calendar-entry', 'w1-zsxq-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--recorded-at', '2026-08-13T09:02:00+08:00',
    '--json',
    '--apply',
  ])
  assert.equal(zsxqL01.publication.sharedGroupUrl, true)
  const zsxqPublishes = JSON.parse(fs.readFileSync(logFile, 'utf8')).dailyRuns
    .flatMap((item) => item.externalPublishes || [])
    .filter((item) => item.platform === 'zsxq' && item.sharedGroupUrl)
  assert.equal(zsxqPublishes.length, initialSharedZsxqCount + 2)

  const duplicate = spawnSync(process.execPath, [script, ...common, '--apply'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /已登记为 published/)

  const operator = JSON.parse(execFileSync(process.execPath, [
    operatorScript,
    '--date', '2026-08-13',
    '--log', logFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(operator.overdueScheduledPublishes.length, 1)
  assert.equal(operator.overdueScheduledPublishes[0].platform, 'toutiao')

  const toutiaoPreview = spawnSync(process.execPath, [script,
    '--platform', 'toutiao',
    '--title', '同一问题问AI三次，差别比提示词更重要',
    '--published-at', '2026-08-12T19:40:30+08:00',
    '--url', 'https://mp.toutiao.com/profile_v4/graphic/preview?pgc_id=7672708790810165812',
    '--verification', '后台预览页显示定时稿，但尚未形成公开文章页面',
    '--calendar-entry', 'w1-toutiao-01',
    '--log', logFile,
    '--calendar', calendarFile,
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(toutiaoPreview.status, 1)
  assert.match(toutiaoPreview.stderr, /不是 toutiao 可核验的公开内容地址/)

  const toutiao = run([
    '--platform', 'toutiao',
    '--title', '同一问题问AI三次，差别比提示词更重要',
    '--published-at', '2026-08-12T19:40:30+08:00',
    '--url', 'https://www.toutiao.com/item/7672708790810165812/',
    '--external-id', '7672708790810165812',
    '--verification', '公开页显示标题、正文、作者、发布时间和创作声明一致',
    '--source-file', toutiaoSourceAsset,
    '--source-sha256', toutiaoSourceHash,
    '--impressions', '4',
    '--reads', '0',
    '--likes', '0',
    '--comments', '0',
    '--calendar-entry', 'w1-toutiao-01',
    '--log', logFile,
    '--calendar', calendarFile,
    '--recorded-at', '2026-08-12T19:43:00+08:00',
    '--json',
    '--apply',
  ])
  assert.equal(toutiao.writesPerformed, true)
  assert.equal(toutiao.publication.sourceIntegrity.sha256, toutiaoSourceHash)
  assert.equal(toutiao.publication.sourceIntegrity.scope, 'reviewed_source_not_final_platform_render')
  assert.equal(toutiao.publication.initialMetricsStatus, 'captured')
  assert.deepEqual(toutiao.publication.initialMetrics, {
    impressions: 4,
    reads: 0,
    likes: 0,
    comments: 0,
  })
  const sameDayAfterToutiao = JSON.parse(execFileSync(process.execPath, [
    operatorScript,
    '--date', '2026-08-12',
    '--log', logFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(
    sameDayAfterToutiao.scheduledPublishes.find((item) => item.platform === 'toutiao').status,
    'published_verified',
  )
  assert.equal(
    sameDayAfterToutiao.dueContentActions.find((item) => item.platform === 'toutiao').status,
    'published',
  )
  const afterToutiao = JSON.parse(execFileSync(process.execPath, [
    operatorScript,
    '--date', '2026-08-13',
    '--log', logFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.deepEqual(afterToutiao.overdueScheduledPublishes, [])
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign publication ledger tests passed')

function copy(source, target) {
  const filename = path.join(tempDir, target)
  fs.copyFileSync(path.join(projectDir, source), filename)
  return filename
}

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}
