import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'generate-campaign-operator-pack.mjs')
const operatorFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-operator-fixture-'))
const fixtureCalendarsDir = path.join(operatorFixtureDir, 'calendars')
fs.mkdirSync(fixtureCalendarsDir)
for (const name of fs.readdirSync(path.join(projectDir, 'ops/campaigns')).filter((item) =>
  /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(item),
)) {
  const calendar = JSON.parse(fs.readFileSync(path.join(projectDir, 'ops/campaigns', name), 'utf8'))
  for (const entry of calendar.entries || []) {
    if (entry.id === 'w1-zsxq-start' || entry.id === 'w1-x-01') {
      entry.status = 'draft_ready'
      delete entry.externalUrl
      delete entry.publishedAt
    }
  }
  fs.writeFileSync(path.join(fixtureCalendarsDir, name), JSON.stringify(calendar))
}
const liveLog = JSON.parse(fs.readFileSync(path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-log.json'), 'utf8'))
const prepublishLog = structuredClone(liveLog)
const prepublishRun = prepublishLog.dailyRuns.find((item) => item.date === '2026-08-12')
prepublishRun.externalPublishes = (prepublishRun.externalPublishes || []).filter((item) =>
  !['w1-zsxq-start', 'w1-x-01'].includes(item.calendarEntryId),
)
prepublishRun.externalPublishAttempts = (prepublishRun.externalPublishAttempts || []).filter((item) =>
  !['w1-zsxq-start', 'w1-x-01'].includes(item.calendarEntryId),
)
const prepublishLogFile = path.join(operatorFixtureDir, 'prepublish-log.json')
fs.writeFileSync(prepublishLogFile, JSON.stringify(prepublishLog))

const august12 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-08-12', '--log', prepublishLogFile, '--calendars-dir', fixtureCalendarsDir, '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(august12.inCampaign, true)
assert.equal(august12.day.primaryChannel, 'zsxq')
assert.equal(august12.tracking.status, 'hold_until_course_page_public')
assert.equal(august12.notebooklm.status, 'browser_operational_cli_pending')
assert.equal(august12.notebooklm.sourceCount, 7)
assert.equal(august12.notebooklm.savedResearchNotes, 5)
assert.equal(august12.notebooklm.cliAuth, 'pending')
assert.equal(august12.ownerDecisions.state, 'no_owner_action_now')
assert.deepEqual(august12.ownerDecisions.surfaced, [])
assert.equal(august12.notebooklm.profile, 'ai-native-generation')
assert.equal(august12.notebooklm.cliVersion, '0.8.0')
assert.ok(august12.operatorChecks.some((item) =>
  item.includes('notebooklm -p ai-native-generation login --browser chrome')
  && item.includes('不得使用 --browser-cookies')
))
assert.deepEqual(august12.notebooklm.researchQueue, {
  queueFile: 'ops/campaigns/ai-native-generation-30d-research-queue.json',
  reportCommand: 'node scripts/report-campaign-research-queue.mjs --as-of 2026-08-12 --json',
  nextReportCommand: 'node scripts/report-campaign-research-queue.mjs --as-of 2026-08-13 --json',
  tasks: 6,
  completed: 1,
  due: 0,
  dueTaskIds: [],
  dueExecutionPacks: [],
  dueRecordCommands: [],
  nextTaskId: 'R01',
  nextDueOn: '2026-08-13',
  executionMode: 'wait_until_due',
})
assert.ok(august12.operatorChecks.some((item) =>
  item.includes('下一研究任务 R01 到期 2026-08-13')
  && item.includes('不提前制造研究结论')
  && item.includes('--as-of 2026-08-13')
))
assert.equal(august12.runSlot.allowedActions[0].calendarEntryId, 'w1-zsxq-start')
assert.equal(august12.runSlot.allowedActions[0].recordWith, 'node scripts/record-campaign-publication.mjs --apply')
assert.match(august12.runSlot.allowedActions[0].recordFailureCommandTemplate, /record-campaign-publication-attempt\.mjs/)
assert.match(august12.runSlot.allowedActions[0].recordFailureCommandTemplate, /--action 'publish'/)
assert.match(august12.runSlot.allowedActions[0].recordCommandTemplate, /--calendar-entry 'w1-zsxq-start'/)
assert.match(august12.runSlot.allowedActions[0].recordCommandTemplate, /--title '从这里开始｜10 分钟完成第一步，不需要补历史内容'/)
assert.match(august12.runSlot.allowedActions[0].recordCommandTemplate, /--content-sha256 '86f5f533145f854ce9e5bd667d7596b3e63ef73bbf8826d9d31932f4bd1fe7f0'/)
assert.match(august12.runSlot.allowedActions[0].recordCommandTemplate, /--content-file 'content\/campaigns\/ai-native-generation-30d\/2026-08-12-zsxq-start-here-publish\.txt'/)
assert.doesNotMatch(august12.runSlot.allowedActions[0].recordCommandTemplate, /--pinned/)
assert.ok(august12.runSlot.allowedActions[0].requiredEvidence.includes('publicUrl'))
assert.ok(august12.runSlot.allowedActions[0].requiredEvidence.includes('contentSha256'))
assert.deepEqual(august12.runSlot.allowedActions[0].payloadManifest.assetIds, ['zsxq-start'])
assert.equal(august12.externalWritesPerformed, false)
assert.equal(august12.runSlot.id, 'daily')
assert.ok(august12.runSlot.allowedActions.some((item) => item.type === 'publish' && item.platform === 'zsxq'))
assert.equal(august12.scheduledPublishes.length, 2)
assert.equal(august12.dueContentActions.length, 6)
assert.ok(august12.scheduledPublishes.some((item) => item.platform === 'csdn'))
assert.ok(august12.scheduledPublishes.some((item) => item.platform === 'toutiao'))
assert.ok(august12.dueContentActions.some((item) => item.platform === 'x' && item.status === 'draft_ready'))
assert.ok(august12.dueContentActions.some((item) => item.platform === 'website' && item.status === 'blocked'))
assert.equal(august12.dueContentActions.find((item) => item.id === 'w1-website-course').publishAsset, null)
assert.ok(august12.dueContentActions.some((item) =>
  item.id === 'w1-website-article-01'
  && item.status === 'draft_ready'
  && item.publishAsset === 'content/posts/daily-2026-08-12-child-ai-three-questions.mdx'
))
assert.equal(
  august12.dueContentActions.find((item) => item.platform === 'x').publishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
)
assert.equal(august12.dueContentActions.find((item) => item.platform === 'x').payloadReady, true)
assert.equal(
  august12.dueContentActions.find((item) => item.platform === 'x').publishAssetSha256,
  '6c3002901d83c27478460ba142e2f058312bac9630e25b0003f339f6f6e4f49e',
)
assert.equal(
  august12.dueContentActions.find((item) => item.platform === 'zsxq').publishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-start-here-publish.txt',
)
assert.equal(august12.dueContentActions.find((item) => item.platform === 'zsxq').payloadReady, true)
assert.ok(august12.datedAssets.includes('2026-08-12-x-post.md'))
assert.ok(august12.datedAssets.includes('2026-08-12-x-post-publish.txt'))
assert.ok(august12.datedAssets.includes('2026-08-12-zsxq-first-24h-playbook.md'))
assert.ok(august12.datedAssets.includes('2026-08-12-zsxq-start-here-publish.txt'))
assert.ok(august12.operatorChecks.some((item) => item.includes('10:15')))
assert.ok(august12.operatorChecks.some((item) => item.includes('19:40')))
assert.ok(august12.operatorChecks.some((item) =>
  item.includes('scheduled-longform-source-audit.md') && item.includes('不自动改稿、删除或重发')
))
assert.equal(august12.operatorChecks.filter((item) => item.includes('scheduled-longform-source-audit.md')).length, 1)
assert.ok(august12.operatorChecks.some((item) => item.includes('不要把') && item.includes('UTM')))
assert.ok(august12.operatorChecks.some((item) => item.includes('场景、输入、输出、错误和检查者')))
assert.ok(august12.operatorChecks.some((item) =>
  item.includes('媒体上传权限仍为阻断')
  && item.includes('文字回退版')
  && item.includes('视频或附件上线')
))
assert.ok(august12.operatorChecks.some((item) => item.includes('今日主平台只使用') && item.includes('zsxq-start-here-publish.txt')))
assert.ok(august12.operatorChecks.some((item) => item.includes('保持阻断') && item.includes('website')))
assert.ok(august12.operatorChecks.some((item) => item.includes('网站母文已就绪') && item.includes('不改 published')))
assert.ok(august12.operatorChecks.some((item) => item.includes('NotebookLM') && item.includes('不导入或读取 Chrome Cookie')))
assert.equal(august12.latestMetrics.thirtyDayPreviewVisitors, 15)
assert.equal(august12.latestMetrics.startedWeek1Families, 0)
assert.equal(august12.latestMetrics.validWeek1Families, 0)
assert.equal(august12.latestMetrics.zsxqCourseInquiryFamilies, 0)
assert.equal(august12.latestMetrics.zsxqCourseRedirectedFamilies, 0)
assert.equal(august12.latestMetrics.challengeCompletedFamilies, 0)
assert.equal(august12.latestMetrics.defenseCompletedFamilies, 0)
assert.equal(august12.latestMetrics.courseStartedFamilies, 0)
assert.equal(august12.latestMetrics.courseCompletedFamilies, 0)
assert.equal(august12.courseProgress.status, 'not_started')
assert.equal(august12.courseProgress.explicitOptIns, 0)
assert.match(august12.courseProgress.recordCommandTemplate, /record-campaign-course-progress\.mjs/)
assert.ok(august12.operatorChecks.some((item) =>
  item.includes('确认后新任务') && item.includes('不计课程开始')
))
assert.equal(august12.paidPilot.status, 'intake_only')
assert.equal(august12.paidPilot.missingRequiredFields.length, 7)
assert.equal(august12.paidPilot.missingComplianceFields.length, 8)
assert.equal(august12.paidPilot.proposedOffer.priceCny, 299)
assert.equal(august12.platformExecution.length, 5)
assert.equal(execution(august12, 'zsxq').executionMode, 'browser_visible_ui')
assert.equal(execution(august12, 'csdn').executionMode, 'browser_visible_ui')
assert.equal(execution(august12, 'toutiao').executionMode, 'browser_visible_ui')
assert.equal(execution(august12, 'x').executionMode, 'browser_visible_ui')
assert.equal(execution(august12, 'website').executionMode, 'git_and_deploy_script')

const august12At09 = slotReport('2026-08-12', '09')
assert.deepEqual(
  august12At09.runSlot.allowedActions.filter((item) => item.type === 'publish').map((item) => item.platform).sort(),
  ['x', 'zsxq'],
)
assert.deepEqual(
  august12At09.runSlot.allowedActions.slice(0, 2).map((item) => `${item.type}:${item.platform}`),
  ['publish:zsxq', 'publish:x'],
)
assert.ok(!august12At09.runSlot.allowedActions.some((item) => item.type === 'verify_scheduled'))
assert.ok(august12At09.runSlot.checks.some((item) => item.includes('recordCommandTemplate') && item.includes('不临场重写')))
assert.ok(august12At09.runSlot.checks.some((item) =>
  item.includes('prePublishDuplicateGuard') && item.includes('unknown_state')
))
const august12Zsxq = august12At09.runSlot.allowedActions.find((item) =>
  item.type === 'publish' && item.platform === 'zsxq'
)
assert.deepEqual(august12Zsxq.prePublishDuplicateGuard, {
  required: true,
  visibleSurface: 'current_group_recent_topics',
  marker: '从这里开始｜10 分钟完成第一步，不需要补历史内容',
  notBefore: '2026-08-12T09:00:00+08:00',
  exactMatchAction: '不要再次点击发布；打开该公开内容取得 URL 和可见发布时间，并使用 recordCommandTemplate 补登记真实发布证据。',
  ambiguousMatchAction: '停止发布；不猜测是否成功，使用 recordFailureCommandTemplate 以 unknown_state 登记可见证据和下一安全动作。',
  noMatchAction: '只继续一次当前发布动作。',
})
assert.deepEqual(august12Zsxq.courseIntakeBridge, {
  asset: 'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-course-intake-bridge.md',
  publicationAllowed: false,
  trigger: 'guardian_explicitly_asks_about_course_beta_registration_or_participation',
  ordinaryAssignmentReplyAction: 'use_assignment_reply_matrix_only',
  responseMode: 'one_manual_reply_after_visible_trigger',
  referralCode: '儿童AI内测-星球',
  collectionChannel: '公众号可见私信人工核验',
  recordAggregateWith: 'node scripts/record-guardian-intake-summary.mjs --apply',
  rule: '不主动附加招生话术，不在公开评论收集家庭字段；只有监护人主动询问时使用卡内唯一回复，三项齐全后才由作者人工登记聚合意向。',
})
assert.equal(august12Zsxq.courseIntakeBridge.publicationAllowed, false)
assert.equal(
  august12Zsxq.prepareBrowserInputCommand,
  "node scripts/prepare-campaign-browser-input.mjs --calendar-entry 'w1-zsxq-start' --variant 'default' --json",
)
assert.match(august12Zsxq.browserInputRule, /title 与 body 分开/)
const august12X = august12At09.runSlot.allowedActions.find((item) =>
  item.type === 'publish' && item.platform === 'x'
)
for (const slot of ['11', '20']) {
  const observation = slotReport('2026-08-12', slot).runSlot.allowedActions
    .find((item) => item.type === 'observe_zsxq')
  assert.deepEqual(observation.courseIntakeBridge, august12Zsxq.courseIntakeBridge)
  assert.equal(observation.courseIntakeBridge.ordinaryAssignmentReplyAction, 'use_assignment_reply_matrix_only')
}
assert.equal(august12X.prePublishDuplicateGuard.visibleSurface, 'current_account_recent_posts')
assert.equal(august12X.prePublishDuplicateGuard.marker, '儿童 AI 素养不是提示词熟练度。')
assert.equal(august12X.prePublishDuplicateGuard.notBefore, '2026-08-12T09:00:00+08:00')
assert.match(august12X.prePublishDuplicateGuard.exactMatchAction, /不要再次点击发布/)
assert.ok(august12X.requiredEvidence.includes('contentSha256'))
assert.deepEqual(august12X.payloadManifest.assetIds, ['x-text-fallback', 'x-video-success', 'x-teaser-video'])
assert.equal(august12X.payloadManifest.verifyCommand, 'node scripts/verify-campaign-publish-manifest.mjs --json')
assert.equal(august12X.mediaAttachment.mediaType, 'public_preview_teaser')
assert.equal(august12X.mediaAttachment.durationSeconds, 58)
assert.equal(august12X.mediaAttachment.hardSubtitles, false)
assert.equal(august12X.mediaAttachment.muteFallbackStatus, 'key_points_only')
assert.match(august12X.recordCommandTemplate, /--content-sha256 '6c3002901d83c27478460ba142e2f058312bac9630e25b0003f339f6f6e4f49e'/)
assert.match(august12X.recordCommandTemplate, /--content-file 'content\/campaigns\/ai-native-generation-30d\/2026-08-12-x-post-publish\.txt'/)
assert.match(august12X.recordMediaCommandTemplate, /--media-verified/)
assert.doesNotMatch(august12X.recordMediaCommandTemplate, /--alt-text-verified/)
assert.match(august12X.recordAccessibleMediaCommandTemplate, /--media-verified/)
assert.match(august12X.recordAccessibleMediaCommandTemplate, /--alt-text-verified/)
assert.match(august12X.recordMediaCommandTemplate, /--content-sha256 '67bd1660e86dc9d334d7e65ca7c487b36abb7e2c14cc465a44184a4c804065d0'/)
assert.match(august12X.recordMediaCommandTemplate, /--content-file 'content\/campaigns\/ai-native-generation-30d\/2026-08-12-x-post-video-publish\.txt'/)
assert.equal(
  august12X.prepareBrowserInputCommand,
  "node scripts/prepare-campaign-browser-input.mjs --calendar-entry 'w1-x-01' --variant 'default' --json",
)
assert.equal(august12X.prepareMediaBrowserInputCommand, undefined)
assert.equal(august12X.mediaUploadPreflight.status, 'blocked_extension_file_url_permission')
assert.equal(august12X.mediaUploadPreflight.mediaPublicationAllowed, false)
assert.match(august12X.browserInputRule, /altText/)
assert.match(august12X.mediaAttachment.altText, /今天谁替你做了预测/)
assert.equal(august12X.mediaAttachment.altTextSha256, 'ff289ea6a4fe3a3ba1ba0cf08ab51748d8937e22a1d6aad6b0a7eef10bec94d6')
assert.equal(august12X.mediaAttachment.altTextAvailability, 'verify_after_platform_upload')
assert.equal(
  august12X.mediaAttachment.accessibilityCheckAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-teaser-media-check.md',
)
assert.equal(
  august12X.mediaAttachment.successPublishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-video-publish.txt',
)
assert.equal(
  august12X.mediaAttachment.fallbackPublishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
)
assert.equal(august12X.crosslink.sourceCalendarEntryId, 'w1-zsxq-start')
assert.equal(august12X.crosslink.preferredDestinationType, 'verified_topic_share_or_detail')
assert.equal(august12X.crosslink.fallbackDestination, 'https://wx.zsxq.com/group/88888881284242')
assert.match(august12X.crosslink.shareQrDecoderCommandTemplate, /campaign:zsxq:share-qr/)
assert.equal(
  august12X.crosslink.refreshAfterSourcePublicationCommand,
  'node scripts/generate-campaign-operator-pack.mjs --date 2026-08-12 --slot 09 --json',
)
assert.equal(august12X.crosslink.status, 'pending_previous_action')
assert.equal(august12X.crosslink.resolvedDestination, null)
assert.equal(august12X.crosslink.sourcePublicationEvidence, null)
assert.equal(august12X.crosslink.prepareVideoCommand, null)
assert.equal(august12X.crosslink.prepareFallbackCommand, null)
assert.match(august12X.crosslink.prepareVideoCommandTemplate, /2026-08-12-x-post-video-publish\.txt/)
assert.match(august12X.crosslink.prepareFallbackCommandTemplate, /2026-08-12-x-post-publish\.txt/)
assert.match(august12X.crosslink.usageRule, /重新生成同一时段运营包/)
assert.match(august12X.crosslink.usageRule, /group_fallback.*继续使用原始纯载荷/)

const crosslinkTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-operator-crosslink-'))
const baseLog = structuredClone(prepublishLog)
const publication = {
  platform: 'zsxq',
  calendarEntryId: 'w1-zsxq-start',
  title: '从这里开始｜10 分钟完成第一步，不需要补历史内容',
  publishedAt: '2026-08-12T09:00:00+08:00',
  url: 'https://wx.zsxq.com/topic_detail/885588221144',
  verification: '可见页面显示完整正文、发布时间和主题详情地址',
}
const topicLog = structuredClone(baseLog)
topicLog.dailyRuns.find((item) => item.date === '2026-08-12').externalPublishes.push(publication)
const topicLogFile = path.join(crosslinkTempDir, 'topic-log.json')
fs.writeFileSync(topicLogFile, JSON.stringify(topicLog))
const resolvedReport = slotReport('2026-08-12', '09', topicLogFile)
assert.deepEqual(
  resolvedReport.runSlot.allowedActions.map((item) => `${item.type}:${item.platform}`),
  ['publish:x'],
)
assert.ok(resolvedReport.operatorChecks.some((item) =>
  item.includes('zsxq｜从这里开始')
  && item.includes('刷新运营包时不得重复发布')
))
const resolvedX = resolvedReport.runSlot.allowedActions.find((item) => item.platform === 'x')
assert.equal(resolvedX.crosslink.status, 'resolved_topic_detail')
assert.equal(resolvedX.crosslink.resolvedDestination, publication.url)
assert.equal(resolvedX.crosslink.sourcePublicationEvidence.calendarEntryId, 'w1-zsxq-start')
assert.match(resolvedX.crosslink.prepareVideoCommand, new RegExp(publication.url))
assert.match(resolvedX.crosslink.prepareFallbackCommand, new RegExp(publication.url))
assert.match(resolvedX.recordCommandTemplate, /--crosslink-destination 'https:\/\/wx\.zsxq\.com\/topic_detail\/885588221144'/)
assert.match(resolvedX.recordMediaCommandTemplate, /--crosslink-destination 'https:\/\/wx\.zsxq\.com\/topic_detail\/885588221144'/)
assert.match(resolvedX.prepareBrowserInputCommand, /--crosslink-destination 'https:\/\/wx\.zsxq\.com\/topic_detail\/885588221144'/)
assert.equal(resolvedX.prepareMediaBrowserInputCommand, undefined)
assert.match(resolvedX.recordCommandTemplate, /--content-sha256 'b780fc1498fdf60f81452fbcf9902eab819e46385c000ab7479d6f916ce8ee3e'/)
assert.match(resolvedX.recordMediaCommandTemplate, /--content-sha256 '8e95ce8ab04b7f07bff4904d9c2e68b59f9582304e0851145fdea0a85c61d7d3'/)
assert.doesNotMatch(resolvedX.recordCommandTemplate, /CONTENT_SHA256/)
assert.doesNotMatch(resolvedX.recordMediaCommandTemplate, /CONTENT_SHA256/)

const topicShareLog = structuredClone(baseLog)
topicShareLog.dailyRuns.find((item) => item.date === '2026-08-12').externalPublishes.push({
  ...publication,
  url: 'https://t.zsxq.com/1uK2r',
})
const topicShareLogFile = path.join(crosslinkTempDir, 'topic-share-log.json')
fs.writeFileSync(topicShareLogFile, JSON.stringify(topicShareLog))
const topicShareX = slotReport('2026-08-12', '09', topicShareLogFile).runSlot.allowedActions
  .find((item) => item.platform === 'x')
assert.equal(topicShareX.crosslink.status, 'resolved_topic_share_shortlink')
assert.equal(topicShareX.crosslink.resolvedDestination, 'https://t.zsxq.com/1uK2r')
assert.match(topicShareX.crosslink.prepareVideoCommand, /https:\/\/t\.zsxq\.com\/1uK2r/)
assert.match(topicShareX.crosslink.prepareFallbackCommand, /https:\/\/t\.zsxq\.com\/1uK2r/)
assert.match(topicShareX.recordCommandTemplate, /--crosslink-destination 'https:\/\/t\.zsxq\.com\/1uK2r'/)
assert.match(topicShareX.recordCommandTemplate, /--content-sha256 'c82b120cc8183d8331d8620e84fbc2da522dceb565ef508d191f13a3cd3fe267'/)

const groupLog = structuredClone(baseLog)
groupLog.dailyRuns.find((item) => item.date === '2026-08-12').externalPublishes.push({
  ...publication,
  url: 'https://wx.zsxq.com/group/88888881284242',
})
const groupLogFile = path.join(crosslinkTempDir, 'group-log.json')
fs.writeFileSync(groupLogFile, JSON.stringify(groupLog))
const fallbackX = slotReport('2026-08-12', '09', groupLogFile).runSlot.allowedActions.find((item) => item.platform === 'x')
assert.equal(fallbackX.crosslink.status, 'group_fallback')
assert.equal(fallbackX.crosslink.resolvedDestination, 'https://wx.zsxq.com/group/88888881284242')
assert.equal(fallbackX.crosslink.prepareVideoCommand, null)
assert.equal(fallbackX.crosslink.prepareFallbackCommand, null)

const completedLog = structuredClone(topicLog)
completedLog.dailyRuns.find((item) => item.date === '2026-08-12').externalPublishes.push({
  platform: 'x',
  calendarEntryId: 'w1-x-01',
  title: '一行家庭 AI 足迹：输入、输出、错误和检查责任',
  publishedAt: '2026-08-12T09:05:00+08:00',
  url: 'https://x.com/QilaiZ13578/status/2088000000000000000',
  verification: 'X 时间线显示完整正文与公开状态地址',
})
const completedLogFile = path.join(crosslinkTempDir, 'completed-log.json')
fs.writeFileSync(completedLogFile, JSON.stringify(completedLog))
const completedReport = slotReport('2026-08-12', '09', completedLogFile)
assert.deepEqual(completedReport.runSlot.allowedActions, [])
assert.ok(completedReport.operatorChecks.some((item) =>
  item.includes('x｜一行家庭 AI 足迹') && item.includes('不得重复发布')
))
const captureReport = slotReport('2026-08-12', '20', completedLogFile)
const captureActions = captureReport.runSlot.allowedActions
  .filter((item) => item.type === 'capture_cross_platform_metrics')
assert.deepEqual(captureActions.map((item) => item.calendarEntryId).sort(), ['w1-x-01', 'w1-zsxq-start'])
const xCapture = captureActions.find((item) => item.platform === 'x')
assert.equal(xCapture.capturePhase, 'publication_day_20h')
assert.ok(xCapture.metricFields.includes('linkClicks'))
assert.match(xCapture.recordCommandTemplate, /--linkClicks <LINK_CLICKS_OR_UNKNOWN>/)
assert.match(xCapture.recordCommandTemplate, /--calendar-entry 'w1-x-01'/)
assert.match(xCapture.rule, /不由 views、互动或知识星球阅读反推/)
const nextDayCapture = slotReport('2026-08-13', '20', completedLogFile).runSlot.allowedActions
  .filter((item) => item.type === 'capture_cross_platform_metrics')
assert.deepEqual(nextDayCapture.map((item) => item.capturePhase), ['next_day_20h', 'next_day_20h'])

const capturedMetrics = JSON.parse(fs.readFileSync(
  path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-cross-platform-metrics.json'),
  'utf8',
))
capturedMetrics.snapshots = captureActions.map((item) => ({
  calendarEntryId: item.calendarEntryId,
  platform: item.platform,
  title: item.title,
  url: item.url,
  publishedAt: completedLog.dailyRuns.find((run) => run.date === '2026-08-12').externalPublishes
    .find((publicationItem) => publicationItem.calendarEntryId === item.calendarEntryId).publishedAt,
  capturedAt: '2026-08-12T20:00:00+08:00',
  evidence: 'visible_public_page',
  metrics: Object.fromEntries(item.metricFields.map((field) => [field, null])),
  privacy: { containsMemberIdentity: false, containsChildData: false, credentialsAccessed: false },
}))
const capturedMetricsFile = path.join(crosslinkTempDir, 'captured-cross-platform.json')
fs.writeFileSync(capturedMetricsFile, JSON.stringify(capturedMetrics))
assert.deepEqual(
  slotReport('2026-08-12', '20', completedLogFile, '', capturedMetricsFile).runSlot.allowedActions
    .filter((item) => item.type === 'capture_cross_platform_metrics'),
  [],
)

const staleTitleLog = structuredClone(baseLog)
staleTitleLog.dailyRuns.find((item) => item.date === '2026-08-11').externalPublishes.push({
  platform: 'zsxq',
  title: '从这里开始｜10 分钟完成第一步，不需要补历史内容',
  publishedAt: '2026-08-11T09:00:00+08:00',
  url: 'https://wx.zsxq.com/group/88888881284242',
  verification: '历史同标题主题，只用于验证跨日期不误匹配',
})
const staleTitleLogFile = path.join(crosslinkTempDir, 'stale-title-log.json')
fs.writeFileSync(staleTitleLogFile, JSON.stringify(staleTitleLog))
assert.ok(slotReport('2026-08-12', '09', staleTitleLogFile).runSlot.allowedActions.some((item) =>
  item.platform === 'zsxq' && item.calendarEntryId === 'w1-zsxq-start'
))
fs.rmSync(crosslinkTempDir, { recursive: true, force: true })
assert.ok(august12At09.operatorChecks.some((item) =>
  item.includes('媒体上传权限仍为阻断')
  && item.includes('文字回退版')
  && item.includes('不再次打开文件选择器试探')
))
assert.ok(august12At09.operatorChecks.some((item) =>
  item.includes('2026-08-12-x-teaser-media-check.md')
  && item.includes('不得声称逐字硬字幕或全程无声完整可理解')
  && item.includes('recordAccessibleMediaCommandTemplate')
  && item.includes('不虚报 ALT')
))
assert.ok(august12At09.operatorChecks.some((item) =>
  item.includes('t.zsxq.com 主题短链')
  && item.includes('topic_detail 主题详情 URL')
  && item.includes('不得猜测主题 ID')
  && item.includes('读取剪贴板旧内容')
  && item.includes('覆盖已审校的 -publish.txt')
))
assert.ok(!august12At09.runSlot.allowedActions.some((item) =>
  item.type === 'pin_after_publish_if_no_displacement'
))
assert.ok(august12At09.operatorChecks.some((item) =>
  item.includes('已有置顶内容（百度网盘学习资料入口）')
  && item.includes('默认只发布起点主题并跳过置顶')
))

const august12At11 = slotReport('2026-08-12', '11')
assert.ok(august12At11.runSlot.allowedActions.some((item) => item.type === 'verify_scheduled' && item.platform === 'csdn'))
const august12CsdnVerification = august12At11.runSlot.allowedActions.find((item) =>
  item.type === 'verify_scheduled' && item.platform === 'csdn'
)
assert.match(august12CsdnVerification.recordFailureCommandTemplate, /--action 'verify_scheduled'/)
assert.equal(august12CsdnVerification.calendarEntryId, 'w1-csdn-01')
assert.equal(
  august12CsdnVerification.refreshAfterRecordCommand,
  'node scripts/generate-campaign-operator-pack.mjs --date 2026-08-12 --slot 11 --json',
)
assert.equal(august12CsdnVerification.recordWith, 'node scripts/record-campaign-publication.mjs --apply')
assert.match(august12CsdnVerification.recordCommandTemplate, /--calendar-entry 'w1-csdn-01'/)
assert.match(august12CsdnVerification.recordCommandTemplate, /--platform 'csdn'/)
assert.doesNotMatch(august12CsdnVerification.recordCommandTemplate, /--content-sha256/)
assert.match(august12CsdnVerification.recordCommandTemplate, /--source-file 'content\/campaigns\/ai-native-generation-30d\/2026-08-12-csdn-verification-pipeline\.md'/)
assert.match(august12CsdnVerification.recordCommandTemplate, /--source-sha256 '90f85fc61460809fbc829e734573af53f5656299337607465ce7a8bb51f70401'/)
assert.ok(august12CsdnVerification.requiredEvidence.includes('publicUrl'))
assert.ok(august12At11.runSlot.checks.some((item) => item.includes('recordCommandTemplate') && item.includes('没有公开 URL')))
assert.ok(august12At11.runSlot.allowedActions.some((item) => item.type === 'observe_zsxq'))
const august12At11Observation = august12At11.runSlot.allowedActions.find((item) => item.type === 'observe_zsxq')
assert.ok(august12At11Observation.captureFields.includes('week1MissingFieldCounts.error'))
assert.ok(august12At11Observation.captureFields.includes('startedWeek1Families'))
assert.ok(august12At11Observation.captureFields.includes('zsxqCourseInquiryFamilies'))
assert.ok(august12At11Observation.captureFields.includes('zsxqCourseRedirectedFamilies'))
assert.match(august12At11Observation.privacy, /不得复制回复原文/)
assert.match(august12At11Observation.metricsRecorder, /report-zsxq-metrics\.mjs/)
assert.equal(august12At11Observation.metricsContentCalendarEntryId, 'w1-zsxq-start')
assert.match(august12At11Observation.metricsRecorderTemplate, /--content-calendar-entry 'w1-zsxq-start'/)
assert.match(august12At11Observation.metricsRecorderTemplate, /--content-valid-assignments <VALID_ASSIGNMENTS>/)
assert.match(august12At11Observation.metricsRecorderTemplate, /--set startedWeek1Families=<STARTED_WEEK1_FAMILIES>/)
assert.match(august12At11Observation.metricsRecorderTemplate, /--set zsxqCourseInquiryFamilies=<COURSE_INQUIRY_FAMILIES>/)
assert.match(august12At11Observation.metricsRecorderTemplate, /--set zsxqCourseRedirectedFamilies=<COURSE_REDIRECTED_FAMILIES>/)
assert.equal(
  august12At11Observation.replyDecisionAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-first-24h-playbook.md',
)
assert.match(august12At11Observation.replyMatrix.complete, /怎样检查这处最可能的错误/)
assert.match(august12At11Observation.replyMatrix.missingOne, /场景\/输入\/输出\/错误\/检查者之一/)
assert.match(august12At11Observation.replyMatrix.abstractError, /能观察到的错误/)
assert.match(august12At11Observation.replyMatrix.invalidChecker, /不交给 AI 自查/)
assert.match(august12At11Observation.replyMatrix.acknowledgementOnly, /场景｜输入｜输出｜最可能出错处｜最后谁检查/)
assert.match(august12At11Observation.replyMatrix.duplicateFamily, /不增加家庭数/)
assert.match(august12At11Observation.replyRule, /每个家庭本轮最多回复一次/)
assert.match(august12At11Observation.replyRule, /儿童资料/)
assert.equal(
  august12At11Observation.decisionCommand,
  'node scripts/report-zsxq-activation.mjs --as-of 2026-08-12 --json',
)
assert.ok(august12At11Observation.requiredDecisionFields.includes('primaryAction.execution.mode'))
assert.ok(august12At11Observation.requiredDecisionFields.includes('primaryAction.execution.publishNewTopic'))
assert.ok(august12At11Observation.requiredDecisionFields.includes('primaryAction.successEvidence'))
assert.match(august12At11Observation.decisionRule, /人工确认后的聚合数字追加真实快照/)
assert.match(august12At11Observation.decisionRule, /绝不再次发布起点主题/)
assert.match(august12At11Observation.decisionRule, /不自行补造载荷或回复模板/)
assert.ok(!august12At11.runSlot.allowedActions.some((item) => item.type === 'publish'))
assert.ok(!august12At11.runSlot.allowedActions.some((item) => item.platform === 'toutiao'))

const august12At20 = slotReport('2026-08-12', '20')
assert.deepEqual(august12At20.ownerDecisions.surfaced.map((item) => item.id), ['website-deployment-authorization'])
assert.ok(august12At20.operatorChecks.some((item) => item.includes('作者决定到期提醒') && item.includes('课程页与活动网站部署授权')))
assert.ok(august12At20.runSlot.allowedActions.some((item) => item.type === 'verify_scheduled' && item.platform === 'csdn'))
assert.ok(august12At20.runSlot.allowedActions.some((item) => item.type === 'verify_scheduled' && item.platform === 'toutiao'))
const august12ToutiaoVerification = august12At20.runSlot.allowedActions.find((item) =>
  item.type === 'verify_scheduled' && item.platform === 'toutiao'
)
assert.match(august12ToutiaoVerification.recordCommandTemplate, /--source-file 'content\/campaigns\/ai-native-generation-30d\/2026-08-12-toutiao-three-prompts\.md'/)
assert.match(august12ToutiaoVerification.recordCommandTemplate, /--source-sha256 '80b5ba79388904bdcf906b2987e42452bf6b8558d123dd8a9b20cc3039f43ca0'/)
assert.ok(august12At20.runSlot.allowedActions.some((item) => item.type === 'observe_zsxq'))
assert.ok(!august12At20.runSlot.allowedActions.some((item) => item.type === 'publish'))
assert.ok(august12At20.runSlot.checks.some((item) =>
  item.includes('cross-platform') && item.includes('unknown')
))
assert.ok(august12At20.operatorChecks.some((item) =>
  item.includes('campaign:cross-platform:record') && item.includes('同 URL')
))
assert.ok(august12At20.runSlot.checks.some((item) => item.includes('不得重发当天任何')))

const august14At09 = slotReport('2026-08-14', '09')
assert.ok(august14At09.runSlot.allowedActions.some((item) =>
  item.type === 'prepare_manual_preview' && item.platform === 'wechat'
))
assert.ok(!august14At09.runSlot.allowedActions.some((item) =>
  item.type === 'publish' && item.platform === 'wechat'
))
assert.deepEqual(
  august14At09.runSlot.allowedActions.filter((item) => item.type === 'publish').map((item) => item.platform).sort(),
  ['x', 'zsxq'],
)
assert.ok(august14At09.runSlot.checks.some((item) => item.includes('没有作者确认') && item.includes('不得群发')))

const weeklyReviewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-operator-weekly-review-'))
const august18At09 = slotReport('2026-08-18', '09', '', weeklyReviewDir)
assert.ok(!august18At09.runSlot.allowedActions.some((item) =>
  ['prepare_publish_payload', 'prepare_weekly_review_payloads'].includes(item.type)
))
assert.ok(!august18At09.runSlot.allowedActions.some((item) =>
  item.type === 'publish' && ['x', 'zsxq'].includes(item.platform)
))
assert.ok(august18At09.operatorChecks.some((item) =>
  item.includes('周复盘母稿保持未发布') && item.includes('09:00 不提取或发布')
))
assert.ok(august18At09.operatorChecks.some((item) =>
  item.includes('campaign:cross-platform:report') && item.includes('--as-of 2026-08-18')
))
assert.equal(august18At09.weeklyExperiment.week, 1)
assert.equal(august18At09.weeklyExperiment.status, 'collecting')
assert.equal(august18At09.weeklyExperiment.decisionAt, '2026-08-18T20:00:00+08:00')
assert.match(august18At09.weeklyExperiment.reportCommand, /campaign:weekly-experiment:report/)
assert.ok(august18At09.operatorChecks.some((item) =>
  item.includes('decisionAllowed=false') && item.includes('evidence_incomplete')
))
assert.ok(august18At09.operatorChecks.some((item) =>
  item.includes('campaign:weekly-review:prepare') && item.includes('20:00')
))
const august18At20 = slotReport('2026-08-18', '20', '', weeklyReviewDir)
const august18ReviewPreparation = august18At20.runSlot.allowedActions.find((item) =>
  item.type === 'prepare_weekly_review_payloads'
)
assert.equal(august18ReviewPreparation.week, 1)
assert.deepEqual(august18ReviewPreparation.calendarEntryIds.sort(), ['w1-x-05', 'w1-zsxq-06'])
assert.match(august18ReviewPreparation.reportCommand, /2026-08-18T20:00:00\+08:00/)
assert.match(august18ReviewPreparation.command, /campaign:weekly-review:prepare/)
assert.match(august18ReviewPreparation.command, /--week 1/)
assert.match(august18ReviewPreparation.refreshCommand, /--slot 20/)
assert.match(august18ReviewPreparation.rule, /先完成 observe_zsxq/)
assert.ok(!august18At20.runSlot.allowedActions.some((item) =>
  item.type === 'publish' && ['w1-x-05', 'w1-zsxq-06'].includes(item.calendarEntryId)
))
execFileSync(process.execPath, [
  path.join(projectDir, 'scripts', 'prepare-campaign-weekly-review-payloads.mjs'),
  '--week', '1',
  '--as-of', '2026-08-18T20:00:00+08:00',
  '--output-dir', weeklyReviewDir,
  '--apply',
  '--json',
], { cwd: projectDir, encoding: 'utf8' })
const august18RefreshedAt20 = slotReport('2026-08-18', '20', '', weeklyReviewDir)
assert.ok(!august18RefreshedAt20.runSlot.allowedActions.some((item) =>
  item.type === 'prepare_weekly_review_payloads'
))
assert.deepEqual(
  august18RefreshedAt20.runSlot.allowedActions
    .filter((item) => item.type === 'publish')
    .map((item) => item.calendarEntryId)
    .sort(),
  ['w1-x-05', 'w1-zsxq-06'],
)
for (const action of august18RefreshedAt20.runSlot.allowedActions.filter((item) => item.type === 'publish')) {
  assert.match(action.generatedWeeklyReview.contentSha256, /^[a-f0-9]{64}$/)
  assert.ok(action.requiredEvidence.includes('contentSha256'))
  assert.match(action.recordCommandTemplate, new RegExp(`--content-sha256 '${action.generatedWeeklyReview.contentSha256}'`))
  assert.match(action.recordCommandTemplate, /--content-file '.*-publish\.txt'/)
}
const august18RefreshedAt09 = slotReport('2026-08-18', '09', '', weeklyReviewDir)
assert.ok(!august18RefreshedAt09.runSlot.allowedActions.some((item) =>
  item.type === 'publish' && ['w1-x-05', 'w1-zsxq-06'].includes(item.calendarEntryId)
))
fs.rmSync(weeklyReviewDir, { recursive: true, force: true })

const august16At09 = slotReport('2026-08-16', '09')
assert.ok(august16At09.runSlot.allowedActions.some((item) =>
  item.type === 'schedule_publish'
  && item.platform === 'toutiao'
  && item.scheduledFor === '2026-08-16T19:40:00+08:00'
))
assert.ok(august16At09.operatorChecks.some((item) => item.includes('设置为 19:40 定时')))
const august16At11 = slotReport('2026-08-16', '11')
assert.ok(!august16At11.runSlot.allowedActions.some((item) => item.type === 'schedule_publish'))

const august19At09 = slotReport('2026-08-19', '09')
assert.ok(august19At09.runSlot.allowedActions.some((item) =>
  item.type === 'schedule_publish'
  && item.platform === 'csdn'
  && item.scheduledFor === '2026-08-19T10:15:00+08:00'
))
assert.ok(august19At09.runSlot.allowedActions.some((item) =>
  item.type === 'schedule_publish'
  && item.platform === 'toutiao'
  && item.scheduledFor === '2026-08-19T19:40:00+08:00'
))
assert.ok(august19At09.operatorChecks.some((item) =>
  item.includes('2026-08-19-scheduled-longform-source-audit.md')
  && item.includes('不自动改稿、删除或重发')
))
assert.equal(
  august19At09.operatorChecks.filter((item) =>
    item.includes('2026-08-19-scheduled-longform-source-audit.md')
  ).length,
  1,
)

const august13At09 = slotReport('2026-08-13', '09')
assert.ok(august13At09.ownerDecisions.surfaced.some((item) => item.id === 'wechat-author-preview-2026-08-14'))
assert.ok(august13At09.operatorChecks.some((item) => item.includes('公众号 8 月 14 日首篇作者预览确认')))
assert.equal(august13At09.notebooklm.researchQueue.executionMode, 'visible_browser_only')
assert.deepEqual(august13At09.notebooklm.researchQueue.dueTaskIds, ['R01'])
assert.deepEqual(
  august13At09.notebooklm.researchQueue.dueExecutionPacks,
  ['content/campaigns/ai-native-generation-30d/2026-08-13-notebooklm-r01-execution-pack.md'],
)
assert.equal(august13At09.notebooklm.researchQueue.dueRecordCommands.length, 1)
assert.match(august13At09.notebooklm.researchQueue.dueRecordCommands[0], /--task R01/)
assert.ok(august13At09.operatorChecks.some((item) =>
  item.includes('研究队列到期 1 项（R01）')
  && item.includes('2026-08-13-notebooklm-r01-execution-pack.md')
  && item.includes('record-campaign-research-task.mjs')
  && item.includes('公开断言仍回到官方或一手原文')
))
assert.deepEqual(
  august13At09.runSlot.allowedActions.filter((item) => item.type === 'publish').map((item) => item.platform).sort(),
  ['x', 'zsxq'],
)
assert.deepEqual(
  august13At09.runSlot.allowedActions.slice(0, 2).map((item) => `${item.type}:${item.platform}`),
  ['publish:zsxq', 'publish:x'],
)
assert.ok(!august13At09.runSlot.allowedActions.some((item) => item.type === 'prepare_publish_payload'))

const august14WechatPreview = august14At09.runSlot.allowedActions.find((item) =>
  item.type === 'prepare_manual_preview' && item.platform === 'wechat'
)
assert.equal(august14WechatPreview.publicationAllowed, false)
assert.equal(august14WechatPreview.manifestAsset, 'content/wechat/2026-08-14-child-ai-three-questions.json')
assert.equal(
  august14WechatPreview.checklistAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-14-wechat-manual-publish-checklist.md',
)
assert.match(august14WechatPreview.recordAuthorApprovalWith, /record-wechat-author-approval\.mjs/)
assert.match(august14WechatPreview.recordAuthorApprovalWith, /--approved-at <ISO> --apply/)
const august13Zsxq = august13At09.runSlot.allowedActions.find((item) =>
  item.type === 'publish' && item.platform === 'zsxq'
)
assert.equal(august13Zsxq.mediaAttachment.lessonId, 'L01')
assert.equal(
  august13Zsxq.mediaAttachment.successPublishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-video-publish.txt',
)
assert.equal(
  august13Zsxq.mediaAttachment.fallbackPublishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-publish.txt',
)
assert.equal(august13Zsxq.mediaAttachment.attachmentAssetId, 'l01-video')
assert.equal(august13Zsxq.mediaAttachment.worksheetAttachmentAssetId, 'l01-family-ai-footprint-card')
assert.match(august13Zsxq.mediaAttachment.recordWorksheetVisibleWith, /record-campaign-worksheet-delivery\.mjs/)
assert.match(august13Zsxq.mediaAttachment.recordWorksheetVisibleWith, /<PDF_ATTACHMENT_VISIBLE_EVIDENCE>/)
assert.match(august13Zsxq.recordCommandTemplate, /--calendar-entry 'w1-zsxq-01'/)
assert.match(august13Zsxq.recordCommandTemplate, /--content-sha256 '4fd0141b48cdfe524ebb57e50a07f568b6af0c650b598f5d3f6cdb62d0526946'/)
assert.equal(august13Zsxq.recordMediaCommandTemplate, undefined)
assert.equal(august13Zsxq.prepareMediaBrowserInputCommand, undefined)
assert.equal(august13Zsxq.mediaUploadPreflight.status, 'blocked_extension_file_url_permission')
assert.equal(august13Zsxq.mediaUploadPreflight.mediaPublicationAllowed, false)
assert.equal(august13Zsxq.mediaUploadPreflight.defaultUntilVerified, 'text_fallback_only')
assert.match(august13Zsxq.mediaUploadPreflight.rule, /文字回退版/)
assert.match(august13Zsxq.mediaAttachment.recordPlayableWith, /record-campaign-course-delivery\.mjs/)
assert.doesNotMatch(august13Zsxq.mediaAttachment.recordPlayableWith, /--subtitle-verified/)
assert.match(august13Zsxq.mediaAttachment.recordPlayableAndSubtitleWith, /--subtitle-verified/)
assert.ok(august13Zsxq.requiredEvidence.includes('contentSha256'))
assert.deepEqual(august13Zsxq.courseIntakeBridge, {
  asset: 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-course-intake-bridge.md',
  publicationAllowed: false,
  trigger: 'guardian_explicitly_asks_about_course_beta_registration_or_participation',
  ordinaryAssignmentReplyAction: 'use_assignment_reply_matrix_only',
  responseMode: 'one_manual_reply_after_visible_trigger',
  referralCode: '儿童AI内测-星球',
  collectionChannel: '公众号可见私信人工核验',
  recordAggregateWith: 'node scripts/record-guardian-intake-summary.mjs --apply',
  rule: '不主动附加招生话术，不在公开评论收集家庭字段；只有监护人主动询问时使用卡内唯一回复，三项齐全后才由作者人工登记聚合意向。',
})
assert.ok(august13At09.operatorChecks.some((item) =>
  item.includes('2026-08-13-zsxq-course-intake-bridge.md')
  && item.includes('不得作为主帖、首评或普通作业回复发布')
  && item.includes('监护人')
))
const august13At11Observation = slotReport('2026-08-13', '11').runSlot.allowedActions
  .find((item) => item.type === 'observe_zsxq')
const august13At20Observation = slotReport('2026-08-13', '20').runSlot.allowedActions
  .find((item) => item.type === 'observe_zsxq')
assert.deepEqual(august13At11Observation.courseIntakeBridge, august13Zsxq.courseIntakeBridge)
assert.deepEqual(august13At20Observation.courseIntakeBridge, august13Zsxq.courseIntakeBridge)
assert.equal(august13At11Observation.courseIntakeBridge.publicationAllowed, false)
assert.equal(august13At11Observation.courseIntakeBridge.ordinaryAssignmentReplyAction, 'use_assignment_reply_matrix_only')
assert.deepEqual(
  august13Zsxq.payloadManifest.assetIds,
  ['zsxq-l01-text-fallback', 'zsxq-l01-video-success', 'l01-video', 'l01-family-ai-footprint-card'],
)
assert.match(august13Zsxq.payloadManifest.verifyCommand, /2026-08-13\.json/)
const august13X = august13At09.runSlot.allowedActions.find((item) =>
  item.type === 'publish' && item.platform === 'x'
)
assert.ok(august13X.requiredEvidence.includes('contentSha256'))
assert.deepEqual(august13X.payloadManifest.assetIds, ['x-l01'])
assert.equal(
  august13At09.dueCourseMedia[0].evidenceMap,
  'ops/campaigns/ai-native-generation-30d-course-evidence-map.json',
)
assert.ok(august13At09.operatorChecks.some((item) =>
  item.includes('course-evidence-map.json') && item.includes('不得把课程卡片写成官方标准')
))
assert.equal(
  august13Zsxq.mediaAttachment.videoAsset,
  'public/videos/courses/ai-native-generation/L01-ai-is-prediction-v1.mp4',
)
assert.equal(
  august13Zsxq.mediaAttachment.worksheetAsset,
  'output/pdf/ai-native-generation-l01-family-ai-footprint-card.pdf',
)
assert.equal(august13Zsxq.mediaAttachment.worksheetStatus, 'local_ready')
assert.equal(
  august13Zsxq.mediaAttachment.ageScaffoldingGuide,
  'content/courses/ai-native-generation/age-scaffolding-facilitator-guide.md',
)
assert.equal(
  august13Zsxq.mediaAttachment.successAppendText,
  '本帖所附公开试听含生成式视觉与合成配音，不代表真实儿童或课程效果。',
)
assert.equal(august13At09.dueCourseMedia.length, 1)
assert.equal(august13At09.dueCourseMedia[0].companionEntryId, 'w1-zsxq-01')
assert.ok(august13At09.operatorChecks.some((item) =>
  item.includes('课程媒体上传权限仍为阻断')
  && item.includes('Not allowed')
  && item.includes('文字回退版')
))
assert.ok(august13At09.operatorChecks.some((item) =>
  item.includes('分龄支架只用于课程内测带领') && item.includes('不依据年龄评价能力')
))
assert.ok(august13At09.operatorChecks.some((item) =>
  item.includes('家庭练习卡为可选附件')
  && item.includes('失败不阻断')
  && item.includes('record-campaign-worksheet-delivery.mjs')
  && item.includes('星球首页不能作为附件证据')
  && item.includes('不收集儿童个人信息或原始作业')
))

const august13 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-08-13', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(august13.overdueScheduledPublishes.length, 2)
assert.ok(august13.operatorChecks.some((item) => item.includes('逾期核验')))
assert.deepEqual(
  august13.overdueScheduledPublishes.map((item) => item.calendarEntry?.id).sort(),
  ['w1-csdn-01', 'w1-toutiao-01'],
)
const august13OverdueActions = august13At09.runSlot.allowedActions.filter((item) => item.type === 'verify_overdue')
assert.deepEqual(
  august13OverdueActions.map((item) => item.calendarEntryId).sort(),
  ['w1-csdn-01', 'w1-toutiao-01'],
)
for (const action of august13OverdueActions) {
  assert.match(action.recordCommandTemplate, /record-campaign-publication\.mjs/)
  assert.match(action.recordCommandTemplate, new RegExp(`--calendar-entry '${action.calendarEntryId}'`))
  assert.match(action.recordFailureCommandTemplate, /record-campaign-publication-attempt\.mjs/)
  assert.match(action.recordFailureCommandTemplate, /--action 'verify_overdue'/)
  assert.match(action.recordCommandTemplate, /--source-file 'content\/campaigns\/ai-native-generation-30d\/2026-08-12-(?:csdn-verification-pipeline|toutiao-three-prompts)\.md'/)
  assert.match(action.recordCommandTemplate, /--source-sha256 '(?:90f85fc61460809fbc829e734573af53f5656299337607465ce7a8bb51f70401|80b5ba79388904bdcf906b2987e42452bf6b8558d123dd8a9b20cc3039f43ca0)'/)
}

const terminalOverdueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-terminal-overdue-'))
const terminalOverdueLog = structuredClone(baseLog)
terminalOverdueLog.dailyRuns.push({
  date: '2026-08-13',
  phase: 'execution',
  status: 'in_progress',
  outputs: [],
  externalPublishes: [],
  externalPublishAttempts: [{
    platform: 'csdn',
    calendarEntryId: 'w1-csdn-01',
    title: '别只教孩子写提示词：把 AI 回答拆成一条可验证的流水线',
    action: 'verify_overdue',
    attemptedAt: '2026-08-13T09:10:00+08:00',
    outcome: 'scheduled_not_public',
    terminal: true,
    evidence: '测试夹具：公开页在逾期核验时仍不可见',
    safeNextAction: '保留本地稿和排期证据，不自动重发。',
    externalPublicationVerified: false,
  }],
  scheduledPublishes: [],
  metricSnapshots: [],
  blockers: [],
  notes: [],
})
const terminalOverdueLogFile = path.join(terminalOverdueDir, 'terminal-log.json')
fs.writeFileSync(terminalOverdueLogFile, JSON.stringify(terminalOverdueLog))
const terminalOverdueReport = slotReport('2026-08-13', '09', terminalOverdueLogFile)
assert.deepEqual(terminalOverdueReport.terminalScheduledFailures.map((item) => item.calendarEntryId), ['w1-csdn-01'])
assert.equal(terminalOverdueReport.terminalScheduledFailures[0].retryAllowed, false)
assert.deepEqual(terminalOverdueReport.overdueScheduledPublishes.map((item) => item.calendarEntry?.id), ['w1-toutiao-01'])
assert.ok(!terminalOverdueReport.runSlot.allowedActions.some((item) =>
  item.type === 'verify_overdue' && item.calendarEntryId === 'w1-csdn-01'
))
assert.ok(terminalOverdueReport.operatorChecks.some((item) =>
  item.includes('终局失败保留审计') && item.includes('不再自动生成 verify_overdue')
))

terminalOverdueLog.dailyRuns.at(-1).externalPublishAttempts[0].terminal = false
terminalOverdueLog.dailyRuns.at(-1).externalPublishAttempts[0].outcome = 'risk_control'
const retryableOverdueLogFile = path.join(terminalOverdueDir, 'retryable-log.json')
fs.writeFileSync(retryableOverdueLogFile, JSON.stringify(terminalOverdueLog))
const retryableOverdueReport = slotReport('2026-08-13', '09', retryableOverdueLogFile)
assert.deepEqual(retryableOverdueReport.terminalScheduledFailures, [])
assert.deepEqual(
  retryableOverdueReport.overdueScheduledPublishes.map((item) => item.calendarEntry?.id).sort(),
  ['w1-csdn-01', 'w1-toutiao-01'],
)
fs.rmSync(terminalOverdueDir, { recursive: true, force: true })

const august14 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-08-14', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(august14.day.primaryChannel, 'wechat')
assert.ok(august14.datedAssets.includes('2026-08-14-wechat-manual-publish-checklist.md'))
assert.ok(august14.operatorChecks.some((item) => item.includes('人工发布清单')))

const september10 = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-09-10', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(september10.reviewMode, 'monthly_final')
assert.ok(september10.operatorChecks.some((item) => item.includes('月末终检')))
assert.ok(september10.operatorChecks.some((item) =>
  item.includes('campaign:monthly-review:article')
  && item.includes('finalizationState=final_ready')
  && item.includes('published=false')
))
assert.ok(september10.operatorChecks.some((item) => item.includes('只收监护人意向，不收费')))
assert.ok(september10.operatorChecks.some((item) => item.includes('合规预检缺少 8 项')))

const outside = JSON.parse(execFileSync(process.execPath, [script, '--date', '2026-09-11', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))
assert.equal(outside.inCampaign, false)
assert.deepEqual(outside.operatorChecks, ['当天不在 30 天活动周期内；不生成或发布活动内容。'])

console.log('campaign operator pack tests passed')

function execution(report, id) {
  return report.platformExecution.find((item) => item.platform === id)
}

function slotReport(date, slot, log = '', weeklyReviewDir = '', crossPlatformMetrics = '') {
  const args = [script, '--date', date, '--slot', slot, '--calendars-dir', fixtureCalendarsDir, '--json']
  args.push('--log', log || prepublishLogFile)
  if (weeklyReviewDir) args.push('--weekly-review-dir', weeklyReviewDir)
  if (crossPlatformMetrics) args.push('--cross-platform-metrics', crossPlatformMetrics)
  return JSON.parse(execFileSync(process.execPath, args, {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

process.on('exit', () => fs.rmSync(operatorFixtureDir, { recursive: true, force: true }))
