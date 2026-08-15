import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveGuardianIntake } from './lib/guardian-intake.mjs'
import { resolveCourseProgress } from './lib/course-progress.mjs'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const dateKey = args.date || shanghaiDateKey()
const campaignFile = path.resolve(projectDir, args.campaign || 'ops/campaigns/ai-native-generation-30d.json')
const logFile = path.resolve(projectDir, args.log || 'ops/campaigns/ai-native-generation-30d-log.json')
const metricsFile = path.resolve(
  projectDir,
  args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json',
)
const crossPlatformMetricsFile = path.resolve(
  projectDir,
  args.crossPlatformMetrics || 'ops/campaigns/ai-native-generation-30d-cross-platform-metrics.json',
)
const trackingFile = path.resolve(
  projectDir,
  args.tracking || 'ops/campaigns/ai-native-generation-30d-tracking-links.json',
)
const paidPilotFile = path.resolve(
  projectDir,
  args.paidPilot || 'ops/campaigns/ai-native-generation-30d-paid-pilot.json',
)
const platformFile = path.resolve(
  projectDir,
  args.platforms || 'ops/campaigns/ai-native-generation-30d-platform-execution.json',
)
const courseDeliveryFile = path.resolve(
  projectDir,
  args.courseDelivery || 'ops/campaigns/ai-native-generation-30d-course-delivery.json',
)
const guardianIntakeFile = path.resolve(
  projectDir,
  args.guardianIntake || 'ops/campaigns/ai-native-generation-30d-guardian-intake.json',
)
const courseProgressFile = path.resolve(
  projectDir,
  args.courseProgress || 'ops/campaigns/ai-native-generation-30d-course-progress.json',
)
const researchQueueFile = path.resolve(
  projectDir,
  args.researchQueue || 'ops/campaigns/ai-native-generation-30d-research-queue.json',
)
const weeklyExperimentsFile = path.resolve(
  projectDir,
  args.weeklyExperiments || 'ops/campaigns/ai-native-generation-30d-weekly-experiments.json',
)
const ownerDecisionsFile = path.resolve(
  projectDir,
  args.ownerDecisions || 'ops/campaigns/ai-native-generation-30d-owner-decisions.json',
)
const campaignOpsDir = path.resolve(projectDir, args.calendarsDir || 'ops/campaigns')
const assetDir = path.resolve(projectDir, 'content/campaigns/ai-native-generation-30d')

const [campaign, log, metrics, crossPlatformMetrics, tracking, paidPilot, platformRegistry, courseDelivery, guardianIntakeConfig, courseProgressConfig, researchQueue, weeklyExperiments, ownerDecisionsRegistry, campaignOpsFiles] = await Promise.all([
  fs.readFile(campaignFile, 'utf8').then(JSON.parse),
  fs.readFile(logFile, 'utf8').then(JSON.parse),
  fs.readFile(metricsFile, 'utf8').then(JSON.parse),
  fs.readFile(crossPlatformMetricsFile, 'utf8').then(JSON.parse),
  fs.readFile(trackingFile, 'utf8').then(JSON.parse),
  fs.readFile(paidPilotFile, 'utf8').then(JSON.parse),
  fs.readFile(platformFile, 'utf8').then(JSON.parse),
  fs.readFile(courseDeliveryFile, 'utf8').then(JSON.parse),
  fs.readFile(guardianIntakeFile, 'utf8').then(JSON.parse),
  fs.readFile(courseProgressFile, 'utf8').then(JSON.parse),
  fs.readFile(researchQueueFile, 'utf8').then(JSON.parse),
  fs.readFile(weeklyExperimentsFile, 'utf8').then(JSON.parse),
  fs.readFile(ownerDecisionsFile, 'utf8').then(JSON.parse),
  fs.readdir(campaignOpsDir),
])
const contentCalendars = await Promise.all(
  campaignOpsFiles
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
    .sort()
    .map((name) => fs.readFile(path.join(campaignOpsDir, name), 'utf8').then(JSON.parse)),
)
await enrichScheduledLongformSources(contentCalendars)
const day = campaign.days.find((item) => item.date === dateKey) || null
const datedAssets = (await fs.readdir(assetDir))
  .filter((name) => name.startsWith(`${dateKey}-`))
  .sort()
const scheduledPublishes = collectScheduledPublishes(log, dateKey)
const terminalScheduledFailures = collectTerminalScheduledFailures(log, dateKey, contentCalendars)
const overdueScheduledPublishes = collectOverdueScheduledPublishes(log, dateKey, contentCalendars, terminalScheduledFailures)
const dueContentActions = reconcileDueContentActions(
  await collectDueContentActions(contentCalendars, dateKey, log),
  scheduledPublishes,
  log,
)
const dueCourseMedia = (courseDelivery.lessons || [])
  .filter((item) => item.date === dateKey)
  .map((item) => ({
    ...item,
    ageScaffoldingGuide: courseDelivery.deliveryPolicy?.ageScaffoldingGuide || null,
    evidenceMap: courseDelivery.deliveryPolicy?.evidenceMap || null,
    successDisclosure: courseDelivery.deliveryPolicy?.successDisclosure || null,
  }))
const runSlot = buildRunSlot(
  args.slot,
  dateKey,
  dueContentActions,
  scheduledPublishes,
  overdueScheduledPublishes,
  platformRegistry,
  dueCourseMedia,
  log,
  crossPlatformMetrics,
)
const latestMetricsRaw = metrics.snapshots.at(-1)
const guardianIntake = {
  ...resolveGuardianIntake(latestMetricsRaw.qualifiedGuardianInterests, guardianIntakeConfig),
  recordCommandTemplate: 'node scripts/record-guardian-intake-summary.mjs --captured-at <CAPTURED_AT_ISO> --new-qualified <COUNT> --incomplete <COUNT> --duplicate <COUNT> --ineligible <COUNT> --withdrawn <COUNT> --age-8-10 <COUNT> --age-11-12 <COUNT> --age-13-14 <COUNT> --time-under-30 <COUNT> --time-30-60 <COUNT> --time-60-90 <COUNT> --pref-async <COUNT> --pref-office-hours <COUNT> --pref-both <COUNT> --origin-zsxq <COUNT> --origin-wechat <COUNT> --origin-x <COUNT> --origin-csdn <COUNT> --origin-toutiao <COUNT> --origin-website <COUNT> --origin-unattributed <COUNT> --json --apply',
}
const courseProgress = {
  ...resolveCourseProgress(
    latestMetricsRaw.courseStartedFamilies,
    latestMetricsRaw.courseCompletedFamilies,
    courseProgressConfig,
  ),
  participationCard: courseProgressConfig.participationCard,
  recordCommandTemplate: 'node scripts/record-campaign-course-progress.mjs --captured-at <CAPTURED_AT_ISO> --new-invited <COUNT> --new-opt-ins <COUNT> --new-started <COUNT> --new-completed <COUNT> --withdrawn-before-start <COUNT> --withdrawn-after-start <COUNT> --json --apply',
}
const latestMetrics = {
  ...latestMetricsRaw,
  courseStartedFamilies: courseProgress.courseStartedFamilies,
  courseCompletedFamilies: courseProgress.courseCompletedFamilies,
}
const reviewMode = determineReviewMode(dateKey)
const weeklyExperiment = summarizeWeeklyExperiment(weeklyExperiments, dateKey)
const ownerDecisions = summarizeOwnerDecisions(ownerDecisionsRegistry, dateKey, args.slot)
const researchQueueSummary = summarizeResearchQueue(researchQueue, dateKey, log.notebooklm || {})
const missingPaidPilotFields = (paidPilot.requiredBeforePayment || [])
  .filter((field) => paidPilot.offer?.[field] == null)
const missingPaidPilotComplianceFields = (paidPilot.requiredComplianceBeforePayment || [])
  .filter((field) => {
    const value = paidPilot.complianceGate?.[field]
    return value !== true && !(typeof value === 'string' && value.trim().length > 0)
  })

const pack = {
  campaignId: campaign.id,
  date: dateKey,
  inCampaign: day !== null,
  day,
  datedAssets,
  dueContentActions,
  dueCourseMedia,
  scheduledPublishes,
  terminalScheduledFailures,
  overdueScheduledPublishes,
  runSlot,
  reviewMode,
  weeklyExperiment,
  ownerDecisions,
  platformExecution: selectPlatformExecution(
    day,
    dueContentActions,
    scheduledPublishes,
    overdueScheduledPublishes,
    platformRegistry,
  ),
  tracking: {
    status: tracking.status,
    destination: tracking.destination,
  },
  notebooklm: {
    status: log.notebooklm?.status || 'unknown',
    notebookId: log.notebooklm?.notebookId || null,
    sourceCount: log.notebooklm?.sourceCount ?? null,
    savedResearchNotes: log.notebooklm?.savedResearchNotes ?? null,
    cliAuth: log.notebooklm?.cliAuth || 'unknown',
    profile: log.notebooklm?.profile || null,
    cliVersion: log.notebooklm?.cliVersion || null,
    researchQueue: researchQueueSummary,
  },
  latestMetrics: {
    capturedAt: latestMetrics.capturedAt,
    unexpiredMembers: latestMetrics.unexpiredMembers,
    sevenDayActiveMembers: latestMetrics.sevenDayActiveMembers,
    thirtyDayPreviewVisitors: latestMetrics.thirtyDayPreviewVisitors,
    thirtyDayJoinClickers: latestMetrics.thirtyDayJoinClickers,
    thirtyDayPaidJoins: latestMetrics.thirtyDayPaidJoins,
    startedWeek1Families: latestMetrics.startedWeek1Families,
    validWeek1Families: latestMetrics.validWeek1Families,
    challengeStartedFamilies: latestMetrics.challengeStartedFamilies,
    challengeCompletedFamilies: latestMetrics.challengeCompletedFamilies,
    researchProjectStartedFamilies: latestMetrics.researchProjectStartedFamilies,
    researchProjectCompletedFamilies: latestMetrics.researchProjectCompletedFamilies,
    safetyCheckpointFamilies: latestMetrics.safetyCheckpointFamilies,
    familyAgreementFamilies: latestMetrics.familyAgreementFamilies,
    defenseCompletedFamilies: latestMetrics.defenseCompletedFamilies,
    zsxqCourseInquiryFamilies: latestMetrics.zsxqCourseInquiryFamilies,
    zsxqCourseRedirectedFamilies: latestMetrics.zsxqCourseRedirectedFamilies,
    campaignPaidPageVisitors: latestMetrics.campaignPaidPageVisitors,
    campaignJoinClickers: latestMetrics.campaignJoinClickers,
    newPaidFamilies: latestMetrics.newPaidFamilies,
    qualifiedGuardianInterests: guardianIntake.activeQualifiedInterests,
    paidPilotFamilies: latestMetrics.paidPilotFamilies,
    courseStartedFamilies: latestMetrics.courseStartedFamilies,
    courseCompletedFamilies: latestMetrics.courseCompletedFamilies,
    authorizedFeedbackCount: latestMetrics.authorizedFeedbackCount,
  },
  guardianIntake,
  courseProgress,
  paidPilot: {
    status: paidPilot.status,
    paymentEnabled: paidPilot.paymentEnabled,
    missingRequiredFields: missingPaidPilotFields,
    proposedOffer: paidPilot.proposedOffer,
    missingComplianceFields: missingPaidPilotComplianceFields,
  },
  operatorChecks: buildOperatorChecks({
    day,
    dateKey,
    scheduledPublishes,
    terminalScheduledFailures,
    overdueScheduledPublishes,
    dueContentActions,
    datedAssets,
    tracking,
    paidPilot,
    missingPaidPilotFields,
    missingPaidPilotComplianceFields,
    reviewMode,
    weeklyExperiment,
    notebooklm: { ...(log.notebooklm || {}), researchQueue: researchQueueSummary },
    dueCourseMedia,
    platformRegistry,
    guardianIntake,
    courseProgress,
    ownerDecisions,
  }),
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`)
else process.stdout.write(renderMarkdown(pack))

function parseArgs(values) {
  const parsed = { calendarsDir: '', campaign: '', courseDelivery: '', courseProgress: '', crossPlatformMetrics: '', date: '', guardianIntake: '', json: false, log: '', metrics: '', ownerDecisions: '', paidPilot: '', platforms: '', researchQueue: '', slot: 'daily', tracking: '', weeklyExperiments: '', weeklyReviewDir: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--calendars-dir') parsed.calendarsDir = values[++index] || ''
    else if (value === '--campaign') parsed.campaign = values[++index] || ''
    else if (value === '--course-delivery') parsed.courseDelivery = values[++index] || ''
    else if (value === '--course-progress') parsed.courseProgress = values[++index] || ''
    else if (value === '--cross-platform-metrics') parsed.crossPlatformMetrics = values[++index] || ''
    else if (value === '--date') parsed.date = values[++index] || ''
    else if (value === '--guardian-intake') parsed.guardianIntake = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--owner-decisions') parsed.ownerDecisions = values[++index] || ''
    else if (value === '--paid-pilot') parsed.paidPilot = values[++index] || ''
    else if (value === '--platforms') parsed.platforms = values[++index] || ''
    else if (value === '--research-queue') parsed.researchQueue = values[++index] || ''
    else if (value === '--slot') parsed.slot = values[++index] || ''
    else if (value === '--tracking') parsed.tracking = values[++index] || ''
    else if (value === '--weekly-experiments') parsed.weeklyExperiments = values[++index] || ''
    else if (value === '--weekly-review-dir') parsed.weeklyReviewDir = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) throw new Error('--date 必须是 YYYY-MM-DD。')
  if (!new Set(['daily', '09', '11', '20']).has(parsed.slot)) throw new Error('--slot 必须是 daily、09、11 或 20。')
  return parsed
}

function buildRunSlot(slot, dateKey, dueActions, scheduled, overdue, registry, dueCourseMedia, log, crossPlatformMetrics) {
  const dueActionByKey = new Map(dueActions.map((item) => [`${item.platform}:${item.title}`, item]))
  const readyDrafts = dueActions.filter((item) => item.status === 'draft_ready')
  const publishable = readyDrafts.filter((item) =>
    registry.platforms?.[item.platform]?.externalWriteStatus === 'browser_publish_verified'
    && item.payloadReady
  )
  const needsPayloadPreparation = readyDrafts.filter((item) =>
    registry.platforms?.[item.platform]?.externalWriteStatus === 'browser_publish_verified'
    && !item.payloadReady
    && !weeklyReviewSpecFor(item.id)
  )
  const previewOnly = readyDrafts.filter((item) =>
    registry.platforms?.[item.platform]?.externalWriteStatus === 'draft_only_manual_preview'
    && item.payloadReady
  )
  const schedulable = readyDrafts.filter((item) =>
    registry.platforms?.[item.platform]?.externalWriteStatus === 'scheduled_flow_verified'
    && item.payloadReady
  )
  const needsLongformPreparation = readyDrafts.filter((item) =>
    ['draft_only_manual_preview', 'scheduled_flow_verified'].includes(
      registry.platforms?.[item.platform]?.externalWriteStatus,
    ) && !item.payloadReady
  )
  const scheduledUnverified = scheduled.filter((item) => item.status !== 'published_verified')
  const verifyBefore = (time) => scheduledUnverified.filter((item) => item.scheduledFor.slice(11, 16) <= time)
  const verificationActions = (items) => items.map((item) => {
    const dueAction = dueActionByKey.get(`${item.platform}:${item.title}`)
    return {
      type: 'verify_scheduled',
      platform: item.platform,
      title: item.title,
      scheduledFor: item.scheduledFor,
      calendarEntryId: dueAction?.id || null,
      recordWith: 'node scripts/record-campaign-publication.mjs --apply',
      ...(dueAction ? { recordCommandTemplate: publicationRecordCommandTemplate(dueAction, null) } : {}),
      ...(dueAction ? { recordFailureCommandTemplate: publicationAttemptRecordCommandTemplate(dueAction, 'verify_scheduled') } : {}),
      refreshAfterRecordCommand: `node scripts/generate-campaign-operator-pack.mjs --date ${dateKey} --slot ${slot} --json`,
      requiredEvidence: ['publicUrl', 'publishedAt', 'visible title/body/status verification'],
      failureEvidence: ['attemptedAt', 'outcome', 'visible failure evidence', 'safe next action'],
    }
  })
  const overdueActions = overdue.map((item) => {
    const dueAction = dueActionByKey.get(`${item.platform}:${item.title}`) || item.calendarEntry
    return {
      type: 'verify_overdue',
      platform: item.platform,
      title: item.title,
      scheduledFor: item.scheduledFor,
      calendarEntryId: dueAction?.id || null,
      recordWith: 'node scripts/record-campaign-publication.mjs --apply',
      ...(dueAction ? { recordCommandTemplate: publicationRecordCommandTemplate(dueAction, null) } : {}),
      ...(dueAction ? { recordFailureCommandTemplate: publicationAttemptRecordCommandTemplate(dueAction, 'verify_overdue') } : {}),
      refreshAfterRecordCommand: `node scripts/generate-campaign-operator-pack.mjs --date ${dateKey} --slot ${slot} --json`,
      requiredEvidence: ['publicUrl', 'publishedAt', 'visible title/body/status verification'],
      failureEvidence: ['attemptedAt', 'outcome', 'visible failure evidence', 'safe next action'],
    }
  })
  const courseMediaByCompanion = new Map(
    dueCourseMedia
      .filter((item) => item.status === 'local_ready')
      .map((item) => [item.companionEntryId, item]),
  )
  const zsxqStartPublication = (log.dailyRuns || [])
    .filter((run) => run.date === dateKey)
    .flatMap((run) => run.externalPublishes || [])
    .find((item) =>
      item.platform === 'zsxq'
      && (item.calendarEntryId === 'w1-zsxq-start'
        || item.title === '从这里开始｜10 分钟完成第一步，不需要补历史内容')
    )
  const zsxqStartUrl = resolveZsxqCrosslinkUrl(zsxqStartPublication?.url)
  const publicationActions = publishable.map((item) => {
    const courseIntakeBridge = buildCourseIntakeBridge(item)
    const courseMedia = courseMediaByCompanion.get(item.id)
    const mediaAttachment = item.mediaAttachment?.status === 'local_ready'
      ? item.mediaAttachment
      : courseMedia && courseMedia.platform === item.platform
        ? {
            lessonId: courseMedia.lessonId,
            mediaType: 'public_preview',
            videoAsset: courseMedia.videoAsset,
            subtitleAsset: courseMedia.subtitleAsset,
            worksheetAsset: courseMedia.worksheetAsset || null,
            worksheetStatus: courseMedia.worksheetStatus || null,
            ageScaffoldingGuide: courseMedia.ageScaffoldingGuide,
            successAppendText: courseMedia.successDisclosure,
            ...(item.id === 'w1-zsxq-01'
              ? {
                  successPublishAsset: 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-video-publish.txt',
                  fallbackPublishAsset: 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-publish.txt',
                  attachmentAssetId: 'l01-video',
                  worksheetAttachmentAssetId: courseMedia.worksheetAttachmentAssetId,
                  recordWorksheetVisibleWith: `node scripts/record-campaign-worksheet-delivery.mjs --lesson '${courseMedia.lessonId}' --verified-at '<WORKSHEET_VISIBLE_AT_ISO>' --url '<PUBLIC_ZSXQ_TOPIC_URL>' --verification '<PDF_ATTACHMENT_VISIBLE_EVIDENCE>' --json --apply`,
                  recordPlayableWith: courseDeliveryRecordCommandTemplate(courseMedia.lessonId, false),
                  recordPlayableAndSubtitleWith: courseDeliveryRecordCommandTemplate(courseMedia.lessonId, true),
                }
              : {}),
            fallback: 'publish_text_without_video_claim',
          }
        : null
    const mediaUploadCapability = mediaAttachment
      ? registry.platforms?.[item.platform]?.mediaUploadCapability || null
      : null
    const mediaUploadBlocked = mediaUploadCapability?.status === 'blocked_extension_file_url_permission'
    const crosslink = item.id === 'w1-x-01' && item.platform === 'x'
      ? {
          sourceCalendarEntryId: 'w1-zsxq-start',
          preferredDestinationType: 'verified_topic_share_or_detail',
          fallbackDestination: 'https://wx.zsxq.com/group/88888881284242',
          shareQrDecoderCommandTemplate: 'npm run campaign:zsxq:share-qr -- --input <TEMP_SHARE_QR_PNG> --json',
          refreshAfterSourcePublicationCommand: `node scripts/generate-campaign-operator-pack.mjs --date ${dateKey} --slot ${slot} --json`,
          status: zsxqStartUrl.status,
          resolvedDestination: zsxqStartUrl.destination,
          sourcePublicationEvidence: zsxqStartPublication
            ? {
                calendarEntryId: zsxqStartPublication.calendarEntryId || null,
                publishedAt: zsxqStartPublication.publishedAt,
                url: zsxqStartPublication.url,
              }
            : null,
          prepareVideoCommand: isResolvedZsxqCrosslink(zsxqStartUrl.status)
            ? `node scripts/prepare-campaign-crosslink-payload.mjs --input ${item.mediaAttachment?.successPublishAsset} --destination-url ${zsxqStartUrl.destination} --json`
            : null,
          prepareFallbackCommand: isResolvedZsxqCrosslink(zsxqStartUrl.status)
            ? `node scripts/prepare-campaign-crosslink-payload.mjs --input ${item.mediaAttachment?.fallbackPublishAsset || item.publishAsset} --destination-url ${zsxqStartUrl.destination} --json`
            : null,
          prepareVideoCommandTemplate: `node scripts/prepare-campaign-crosslink-payload.mjs --input ${item.mediaAttachment?.successPublishAsset} --destination-url <VERIFIED_ZSXQ_TOPIC_URL> --json`,
          prepareFallbackCommandTemplate: `node scripts/prepare-campaign-crosslink-payload.mjs --input ${item.mediaAttachment?.fallbackPublishAsset || item.publishAsset} --destination-url <VERIFIED_ZSXQ_TOPIC_URL> --json`,
          usageRule: '前一项知识星球发布证据登记后，先重新生成同一时段运营包；刷新后的 crosslink.status 为 resolved_topic_share_shortlink 或 resolved_topic_detail 才使用精确命令生成直链载荷。group_fallback、pending_previous_action 或无法确认时继续使用原始纯载荷。',
        }
      : null
    const payloadManifest = publicationManifestFor(item.id)
    const contentHashEvidence = payloadManifest
      || item.generatedWeeklyReview
      || (new Set(['x', 'zsxq']).has(item.platform) ? { file: item.publishAsset } : null)
    const crosslinkDestination = crosslink && isResolvedZsxqCrosslink(crosslink.status)
      ? crosslink.resolvedDestination
      : null
    return {
      type: 'publish',
      platform: item.platform,
      title: item.title,
      calendarEntryId: item.id,
      publishAsset: item.publishAsset,
      prepareBrowserInputCommand: browserInputCommand(item, false, crosslinkDestination),
      ...(mediaAttachment?.successPublishAsset && !mediaUploadBlocked
        ? { prepareMediaBrowserInputCommand: browserInputCommand(
            item,
            true,
            crosslinkDestination,
            item.mediaAttachment?.successPublishAsset ? null : mediaAttachment.successPublishAsset,
          ) }
        : {}),
      browserInputRule: '只把命令输出的 editorFields 填入对应可见编辑器字段；知识星球 title 与 body 分开；X 文字版只填 text，视频版如编辑器提供 ALT/添加描述则同时填 altText。不得整份粘贴 JSON、母稿、执行卡或内部回复卡。',
      prePublishDuplicateGuard: {
        required: true,
        visibleSurface: item.platform === 'zsxq' ? 'current_group_recent_topics' : 'current_account_recent_posts',
        marker: item.payloadMarker || item.mediaAttachment?.topicMarker || item.title,
        notBefore: `${item.date}T09:00:00+08:00`,
        exactMatchAction: '不要再次点击发布；打开该公开内容取得 URL 和可见发布时间，并使用 recordCommandTemplate 补登记真实发布证据。',
        ambiguousMatchAction: '停止发布；不猜测是否成功，使用 recordFailureCommandTemplate 以 unknown_state 登记可见证据和下一安全动作。',
        noMatchAction: '只继续一次当前发布动作。',
      },
      recordWith: 'node scripts/record-campaign-publication.mjs --apply',
      recordCommandTemplate: publicationRecordCommandTemplate(item, contentHashEvidence, false, crosslinkDestination),
      recordFailureCommandTemplate: publicationAttemptRecordCommandTemplate(item, 'publish'),
      ...(item.mediaAttachment?.status === 'local_ready'
        ? { recordMediaCommandTemplate: publicationRecordCommandTemplate(item, contentHashEvidence, true, crosslinkDestination) }
        : {}),
      ...(item.mediaAttachment?.status === 'local_ready' && item.mediaAttachment.altText
        ? { recordAccessibleMediaCommandTemplate: publicationRecordCommandTemplate(item, contentHashEvidence, true, crosslinkDestination, true) }
        : {}),
      requiredEvidence: [
        'publicUrl',
        'publishedAt',
        'visible publication verification',
        ...(contentHashEvidence ? ['contentSha256'] : []),
      ],
      failureEvidence: ['attemptedAt', 'outcome', 'visible failure evidence', 'safe next action'],
      ...(courseIntakeBridge ? { courseIntakeBridge } : {}),
      ...(mediaAttachment ? { mediaAttachment } : {}),
      ...(mediaUploadCapability ? {
        mediaUploadPreflight: {
          ...mediaUploadCapability,
          mediaPublicationAllowed: !mediaUploadBlocked,
          rule: mediaUploadBlocked
            ? '权限状态未重新核验前直接使用自包含文字回退版；不得打开文件选择器反复试探，不得声称视频或附件上线。'
            : '进入发布编辑器前先确认浏览器本地文件传输能力；上传完成且发布后可播放时才使用媒体成功版。',
        },
      } : {}),
      ...(crosslink ? { crosslink } : {}),
      ...(payloadManifest ? { payloadManifest } : {}),
      ...(item.generatedWeeklyReview ? { generatedWeeklyReview: item.generatedWeeklyReview } : {}),
    }
  })
  const pinActions = publishable
    .filter((item) =>
      item.id === 'w1-zsxq-start'
      && item.platform === 'zsxq'
      && registry.platforms?.zsxq?.pinPolicy?.defaultAction !== 'skip_existing_pinned_topic'
    )
    .map((item) => ({
      type: 'pin_after_publish_if_no_displacement',
      platform: 'zsxq',
      title: item.title,
      calendarEntryId: item.id,
      condition: '目标主题已公开，且置顶不会替换或取消现有重要置顶内容',
    }))
  const publicationSequence = [...publicationActions]
    .sort((left, right) => publicationPriority(left.platform) - publicationPriority(right.platform))
    .flatMap((action) => [
      action,
      ...pinActions.filter((pin) => pin.platform === action.platform && pin.title === action.title),
    ])
  const regularPublicationSequence = publicationSequence.filter((action) => !weeklyReviewSpecFor(action.calendarEntryId))
  const weeklyReviewPublicationSequence = publicationSequence.filter((action) => weeklyReviewSpecFor(action.calendarEntryId))
  const previewActions = previewOnly.map((item) => {
    const manifestAsset = item.assets.find((asset) => /^content\/wechat\/.+\.json$/.test(asset)) || null
    const checklistAsset = item.assets.find((asset) => /wechat-manual-publish-checklist\.md$/.test(asset)) || null
    return {
      type: 'prepare_manual_preview',
      platform: item.platform,
      title: item.title,
      publishAsset: item.publishAsset,
      manifestAsset,
      checklistAsset,
      publicationAllowed: false,
      ...(manifestAsset ? {
        recordAuthorApprovalWith: `node scripts/record-wechat-author-approval.mjs --manifest ${manifestAsset} --approved-at <ISO> --apply`,
      } : {}),
    }
  })
  const payloadPreparationActions = needsPayloadPreparation.map((item) => ({
    type: 'prepare_publish_payload',
    platform: item.platform,
    title: item.title,
    sourceAsset: item.publishAsset,
  }))
  const weeklyReviewSpecs = [...new Map(
    readyDrafts
      .map((item) => weeklyReviewSpecFor(item.id))
      .filter(Boolean)
      .map((item) => [item.week, item]),
  ).values()]
  const weeklyReviewPreparationActions = weeklyReviewSpecs
    .filter((spec) => {
      const weekItems = dueActions.filter((item) => weeklyReviewSpecFor(item.id)?.week === spec.week)
      return weekItems.length > 0 && !weekItems.every((item) => item.generatedWeeklyReview?.week === spec.week)
    })
    .map((spec) => ({
      type: 'prepare_weekly_review_payloads',
      week: spec.week,
      decisionAt: `${dateKey}T20:00:00+08:00`,
      reportCommand: `npm run campaign:weekly-experiment:report -- --as-of ${dateKey}T20:00:00+08:00 --json`,
      command: `npm run campaign:weekly-review:prepare -- --week ${spec.week} --as-of ${dateKey}T20:00:00+08:00 --json --apply`,
      refreshCommand: `node scripts/generate-campaign-operator-pack.mjs --date ${dateKey} --slot 20 --json`,
      calendarEntryIds: dueActions.filter((item) => weeklyReviewSpecFor(item.id)?.week === spec.week).map((item) => item.id),
      rule: '先完成 observe_zsxq 并追加决策窗口内的已核验快照；decision_due 时先登记唯一分支再生成。证据不足时生成明确说明证据不足的公开载荷，不填写占位数字。刷新运营包后才允许发布。',
    }))
  const gatedWeeklyReviewPublicationSequence = weeklyReviewPreparationActions.length === 0
    ? weeklyReviewPublicationSequence
    : []
  const longformPreparationActions = needsLongformPreparation.map((item) => ({
    type: 'prepare_longform_body',
    platform: item.platform,
    title: item.title,
    sourceAsset: item.publishAsset,
  }))
  const scheduledTime = { csdn: '10:15', toutiao: '19:40' }
  const scheduleActions = schedulable.map((item) => ({
    type: 'schedule_publish',
    platform: item.platform,
    title: item.title,
    publishAsset: item.publishAsset,
    scheduledFor: `${item.date}T${scheduledTime[item.platform]}:00+08:00`,
  }))
  const observedZsxqEntry = dueActions.find((item) =>
    item.platform === 'zsxq' && item.assets.some((asset) => asset.endsWith('-course-intake-bridge.md'))
  )
  const observeCourseIntakeBridge = buildCourseIntakeBridge(observedZsxqEntry)
  const observeZsxq = {
    type: 'observe_zsxq',
    platform: 'zsxq',
    title: '采集可见聚合指标并按首帖 24 小时分支回复',
    captureFields: [
      'content.reads',
      'content.comments',
      'content.likes',
      'content.validAssignments',
      'startedWeek1Families',
      'validWeek1Families',
      'week1MissingFieldCounts.scene',
      'week1MissingFieldCounts.input',
      'week1MissingFieldCounts.output',
      'week1MissingFieldCounts.error',
      'week1MissingFieldCounts.checker',
      'zsxqCourseInquiryFamilies',
      'zsxqCourseRedirectedFamilies',
    ],
    privacy: '只记录人工确认后的聚合数字；不得复制回复原文、家庭标识或儿童资料',
    metricsRecorder: 'node scripts/report-zsxq-metrics.mjs --capture-at <ISO时间> --source <可见页面> ... --apply',
    ...(dueActions.find((item) => item.platform === 'zsxq') ? {
      metricsRecorderTemplate: `node scripts/report-zsxq-metrics.mjs --capture-at <CAPTURED_AT_ISO> --source <VISIBLE_AGGREGATE_EVIDENCE> --content-calendar-entry ${shellQuote(dueActions.find((item) => item.platform === 'zsxq').id)} --content-reads <READS> --content-comments <COMMENTS> --content-likes <LIKES> --content-valid-assignments <VALID_ASSIGNMENTS> --set startedWeek1Families=<STARTED_WEEK1_FAMILIES> --set validWeek1Families=<VALID_WEEK1_FAMILIES> --set zsxqCourseInquiryFamilies=<COURSE_INQUIRY_FAMILIES> --set zsxqCourseRedirectedFamilies=<COURSE_REDIRECTED_FAMILIES> --missing-scene <MISSING_SCENE> --missing-input <MISSING_INPUT> --missing-output <MISSING_OUTPUT> --missing-error <MISSING_ERROR> --missing-checker <MISSING_CHECKER> --json --apply`,
      metricsContentCalendarEntryId: dueActions.find((item) => item.platform === 'zsxq').id,
    } : {}),
    decisionCommand: `node scripts/report-zsxq-activation.mjs --as-of ${dateKey} --json`,
    replyDecisionAsset: 'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-first-24h-playbook.md',
    replyMatrix: {
      complete: '这一步已经完成。你找到了具体场景，也把最后的检查责任留给了真人。只再想一个问题：你准备怎样检查这处最可能的错误？不用补充孩子个人信息。',
      missingOne: '已经有四格了，只补“【场景/输入/输出/错误/检查者之一】”即可。继续用一行回复，不需要介绍孩子或家庭情况。',
      abstractError: '把“可能不准确”换成一个能观察到的错误就可以，例如“漏掉异常值”或“把玩具认成真实物体”。其他四格不用重写。',
      invalidChecker: '再改最后一格：谁能看到现实情况，并能对采用结果负责？这一步仍由真人完成，不交给 AI 自查。',
      acknowledgementOnly: '请直接补这一行：场景｜输入｜输出｜最可能出错处｜最后谁检查。不需要写姓名、学校、位置、照片或聊天内容。',
      duplicateFamily: '不增加家庭数；只按最新一条完整回复判断，且最多反馈一个点。',
    },
    replyRule: '先按可见回复状态选 replyMatrix 中唯一一条；missingOne 只能替换为实际缺失的一格。每个家庭本轮最多回复一次，不复制原文，不把星主示范或重复提交计数。若出现儿童资料，停止互动并交由作者在可见界面处理。',
    ...(observeCourseIntakeBridge ? { courseIntakeBridge: observeCourseIntakeBridge } : {}),
    requiredDecisionFields: [
      'primaryAction.id',
      'primaryAction.execution.mode',
      'primaryAction.execution.publishAsset',
      'primaryAction.execution.replyTemplate',
      'primaryAction.execution.firstValidReplyTemplate',
      'primaryAction.execution.publishNewTopic',
      'primaryAction.successEvidence',
      'primaryAction.stopCondition',
    ],
    decisionRule: '先按 replyMatrix 处理当次可见回复，再用人工确认后的聚合数字追加真实快照并运行诊断；正式起点已绑定到快照后，诊断只能在原主题观察、回复或核验入口，绝不再次发布起点主题；每次只采用 primaryAction；execution 中缺失的字段保持未执行，不自行补造载荷或回复模板，也不同时改多个变量',
  }
  const crossPlatformCaptureActions = buildCrossPlatformCaptureActions(dateKey, log, crossPlatformMetrics)
  const definitions = {
    daily: {
      label: '全天总览',
      allowedActions: [...regularPublicationSequence, ...gatedWeeklyReviewPublicationSequence, ...payloadPreparationActions, ...weeklyReviewPreparationActions, ...longformPreparationActions, ...previewActions, ...scheduleActions, ...verificationActions(scheduledUnverified), ...overdueActions],
      checks: [
        '全天总览只用于规划；执行外部动作前必须切换到 09、11 或 20 时段门禁。',
        'prepare_manual_preview 只允许准备草稿和作者预览，不代表公众号最终发布授权。',
        'prepare_publish_payload 只允许从母稿提取单平台纯载荷，不执行外部发布。',
        'schedule_publish 只允许通过可见 UI 设置当日定时并核验后台状态；定时成功不等于已经公开。',
      ],
    },
    '09': {
      label: '09:00 主发布',
      allowedActions: [...regularPublicationSequence, ...payloadPreparationActions, ...longformPreparationActions, ...previewActions, ...scheduleActions, ...overdueActions],
      checks: [
        '只发布本时段列出的 draft_ready 载荷；已排期稿只等待到点核验，不手动重发。',
        'X/知识星球没有 -publish.txt 时只准备纯载荷；不得把含主帖、首评、核验或回复模板的 .md 整文件粘贴到平台。',
        '公众号 prepare_manual_preview 只能进入草稿与作者预览；没有作者确认和公开 URL，不得群发或登记 published。',
        'CSDN/今日头条 schedule_publish 只设置并核验定时状态；到点取得公开 URL 后才登记 published。',
        '每个 publish 动作先执行 prePublishDuplicateGuard：只检查当前账号/星球的可见近期内容；若在 notBefore 之后发现精确 marker，补登记该公开内容而不是再发一条。状态含糊时停止并登记 unknown_state，不用重复发布试探。',
        '发布后立即登记真实公开 URL；若未取得公开证据，不把状态改成 published。',
        '动作提供 recordCommandTemplate 时只替换其中的可见证据占位符后执行，不临场重写标题、周历 ID、平台或摘要参数。',
      ],
    },
    '11': {
      label: '11:00 上午核验',
      allowedActions: [...verificationActions(verifyBefore('11:00')), ...overdueActions, observeZsxq],
      checks: [
        '不得重发 09:00 的知识星球或 X 内容，即使本地仍显示 draft_ready；只核验已到期定时稿。',
        '核验动作提供 recordCommandTemplate 时只替换可见证据占位符；没有公开 URL 或正文状态证据时不登记。',
        '知识星球只采集可见聚合数字和首帖状态，不新增第二任务。',
      ],
    },
    '20': {
      label: '20:00 晚间核验',
      allowedActions: [...verificationActions(verifyBefore('20:00')), ...overdueActions, observeZsxq, ...crossPlatformCaptureActions, ...weeklyReviewPreparationActions, ...gatedWeeklyReviewPublicationSequence],
      checks: [
        '除已通过周复盘生成门禁并在本时段明确列出的复盘载荷外，不得重发当天任何 draft_ready 内容；其余只核验截至 20:00 已到期定时稿和知识星球状态。',
        '核验动作提供 recordCommandTemplate 时只替换可见证据占位符；没有公开 URL 或正文状态证据时不登记。',
        '对已登记 calendarEntryId 与真实公开 URL 的内容，使用 cross-platform 快照工具记录同 URL 可见数字；每个平台全部字段都要提供，未知值显式写 unknown。',
        '有回复时只追问一个可修改点；涉及儿童数据、登录或风控立即停止外部写入。',
      ],
    },
  }
  return { id: slot, ...definitions[slot] }
}

function publicationPriority(platform) {
  return { zsxq: 0, x: 1 }[platform] ?? 10
}

function buildCrossPlatformCaptureActions(dateKey, log, store) {
  const previousDate = previousDateKey(dateKey)
  const cutoff = `${dateKey}T20:00:00+08:00`
  const captured = new Set((store.snapshots || [])
    .filter((item) => item.capturedAt >= cutoff)
    .map((item) => item.calendarEntryId))
  const publications = (log.dailyRuns || [])
    .flatMap((run) => run.externalPublishes || [])
    .filter((item) => {
      const publishedDate = String(item.publishedAt || '').slice(0, 10)
      return item.calendarEntryId
        && store.metricFields?.[item.platform]
        && publishedDate >= previousDate
        && publishedDate <= dateKey
        && !captured.has(item.calendarEntryId)
    })
  return [...new Map(publications.map((item) => [item.calendarEntryId, item])).values()]
    .map((item) => {
      const metricFields = store.metricFields[item.platform]
      const metricArgs = metricFields.flatMap((field) => [
        `--${field}`,
        `<${camelToUpperSnake(field)}_OR_UNKNOWN>`,
      ])
      return {
        type: 'capture_cross_platform_metrics',
        platform: item.platform,
        calendarEntryId: item.calendarEntryId,
        title: item.title,
        url: item.url,
        capturePhase: item.publishedAt.slice(0, 10) === dateKey
          ? 'publication_day_20h'
          : 'next_day_20h',
        metricFields,
        recordCommandTemplate: [
          'node scripts/record-campaign-cross-platform-snapshot.mjs',
          '--platform', shellQuote(item.platform),
          '--calendar-entry', shellQuote(item.calendarEntryId),
          '--url', shellQuote(item.url),
          '--captured-at', shellQuote('<CAPTURED_AT_ISO>'),
          '--evidence', shellQuote('<EVIDENCE_MODE>'),
          ...metricArgs,
          '--json',
          '--apply',
        ].join(' '),
        rule: item.platform === 'x'
          ? '公共状态页或当前账号分析界面看不到的字段必须写 unknown；linkClicks 只用可见原生数字，不由 views、互动或知识星球阅读反推，也不直接计入星球付费归因。'
          : '只记录同一公开 URL 当前可见的聚合数字；看不到的字段写 unknown，不跨内容或平台补数。',
      }
    })
}

function previousDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) - 86_400_000).toISOString().slice(0, 10)
}

function camelToUpperSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()
}

function weeklyReviewSpecFor(calendarEntryId) {
  const values = {
    'w1-x-05': { week: 1, filename: '2026-08-18-x-week1-review-publish.txt' },
    'w1-zsxq-06': { week: 1, filename: '2026-08-18-week1-review-publish.txt' },
    'w2-x-05': { week: 2, filename: '2026-08-25-x-week2-review-publish.txt' },
    'w2-zsxq-07': { week: 2, filename: '2026-08-25-week2-review-publish.txt' },
    'w4-x-05': { week: 4, filename: '2026-09-08-x-week4-review-publish.txt' },
    'w4-zsxq-07': { week: 4, filename: '2026-09-08-week4-review-publish.txt' },
  }
  const value = values[calendarEntryId]
  if (!value) return null
  const directory = args.weeklyReviewDir
    ? path.resolve(projectDir, args.weeklyReviewDir)
    : path.join('content', 'campaigns', 'ai-native-generation-30d')
  return { week: value.week, output: path.join(directory, value.filename) }
}

function buildCourseIntakeBridge(item) {
  const asset = item?.assets?.find((candidate) => candidate.endsWith('-course-intake-bridge.md')) || null
  if (!asset) return null
  return {
    asset,
    publicationAllowed: false,
    trigger: 'guardian_explicitly_asks_about_course_beta_registration_or_participation',
    ordinaryAssignmentReplyAction: 'use_assignment_reply_matrix_only',
    responseMode: 'one_manual_reply_after_visible_trigger',
    referralCode: '儿童AI内测-星球',
    collectionChannel: '公众号可见私信人工核验',
    recordAggregateWith: 'node scripts/record-guardian-intake-summary.mjs --apply',
    rule: '不主动附加招生话术，不在公开评论收集家庭字段；只有监护人主动询问时使用卡内唯一回复，三项齐全后才由作者人工登记聚合意向。',
  }
}

function publicationManifestFor(calendarEntryId) {
  const manifests = {
    'w1-zsxq-start': {
      file: 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-12.json',
      assetIds: ['zsxq-start'],
      verifyCommand: 'node scripts/verify-campaign-publish-manifest.mjs --json',
    },
    'w1-x-01': {
      file: 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-12.json',
      assetIds: ['x-text-fallback', 'x-video-success', 'x-teaser-video'],
      verifyCommand: 'node scripts/verify-campaign-publish-manifest.mjs --json',
    },
    'w1-zsxq-01': {
      file: 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-13.json',
      assetIds: ['zsxq-l01-text-fallback', 'zsxq-l01-video-success', 'l01-video', 'l01-family-ai-footprint-card'],
      verifyCommand: 'node scripts/verify-campaign-publish-manifest.mjs --manifest ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-13.json --json',
    },
    'w1-x-02': {
      file: 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-13.json',
      assetIds: ['x-l01'],
      verifyCommand: 'node scripts/verify-campaign-publish-manifest.mjs --manifest ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-13.json --json',
    },
  }
  return manifests[calendarEntryId] || null
}

function publicationRecordCommandTemplate(item, payloadManifest, mediaVerified = false, crosslinkDestination = null, altTextVerified = false) {
  const contentFile = mediaVerified
    ? item.mediaAttachment?.successPublishAsset || item.publishAsset
    : item.generatedWeeklyReview?.file
      || item.mediaAttachment?.fallbackPublishAsset
      || item.publishAsset
  const contentSha256 = crosslinkDestination
    ? item.runtimeCrosslinkHashes?.[contentFile]
    : mediaVerified
      ? item.mediaAttachment?.successPublishSha256
      : item.generatedWeeklyReview?.contentSha256
        || item.mediaAttachment?.fallbackPublishSha256
        || item.publishAssetSha256
  if (payloadManifest && !contentSha256) {
    throw new Error(`${item.id} 缺少可复算的最终正文 SHA-256，不能生成发布登记命令。`)
  }
  const parts = [
    'node scripts/record-campaign-publication.mjs',
    '--calendar-entry', shellQuote(item.id),
    '--platform', shellQuote(item.platform),
    '--title', shellQuote(item.title),
    '--published-at', shellQuote('<PUBLISHED_AT_ISO>'),
    '--url', shellQuote('<PUBLIC_URL>'),
    '--verification', shellQuote('<VISIBLE_PUBLICATION_EVIDENCE>'),
    ...(payloadManifest ? ['--content-file', shellQuote(contentFile), '--content-sha256', shellQuote(contentSha256)] : []),
    ...(crosslinkDestination ? ['--crosslink-destination', shellQuote(crosslinkDestination)] : []),
    ...(item.reviewedSourceAsset && item.reviewedSourceSha256
      ? [
          '--source-file', shellQuote(item.reviewedSourceAsset),
          '--source-sha256', shellQuote(item.reviewedSourceSha256),
        ]
      : []),
    ...(mediaVerified ? ['--media-verified'] : []),
    ...(altTextVerified ? ['--alt-text-verified'] : []),
    '--json',
    '--apply',
  ]
  return parts.join(' ')
}

function browserInputCommand(item, mediaVariant = false, crosslinkDestination = null, explicitAsset = null) {
  return [
    'node scripts/prepare-campaign-browser-input.mjs',
    '--calendar-entry', shellQuote(item.id),
    '--variant', shellQuote(mediaVariant ? 'media' : 'default'),
    ...(explicitAsset ? ['--asset', shellQuote(explicitAsset)] : []),
    ...(crosslinkDestination ? ['--crosslink-destination', shellQuote(crosslinkDestination)] : []),
    '--json',
  ].join(' ')
}

function publicationAttemptRecordCommandTemplate(item, action) {
  return [
    'node scripts/record-campaign-publication-attempt.mjs',
    '--calendar-entry', shellQuote(item.id),
    '--platform', shellQuote(item.platform),
    '--action', shellQuote(action),
    '--attempted-at', shellQuote('<ATTEMPTED_AT_ISO>'),
    '--outcome', shellQuote('<OUTCOME>'),
    '--evidence', shellQuote('<VISIBLE_FAILURE_EVIDENCE>'),
    '--safe-next-action', shellQuote('<SAFE_NEXT_ACTION>'),
    '--json',
    '--apply',
  ].join(' ')
}

function courseDeliveryRecordCommandTemplate(lessonId, subtitleVerified) {
  return [
    'node scripts/record-campaign-course-delivery.mjs',
    '--lesson', shellQuote(lessonId),
    '--published-at', shellQuote('<PUBLISHED_AT_ISO>'),
    '--url', shellQuote('<PUBLIC_ZSXQ_URL>'),
    '--verification', shellQuote('<VIDEO_PLAYABLE_VISIBLE_EVIDENCE>'),
    ...(subtitleVerified ? ['--subtitle-verified'] : []),
    '--json',
    '--apply',
  ].join(' ')
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`
}

function resolveZsxqCrosslinkUrl(value) {
  if (!value) return { status: 'pending_previous_action', destination: null }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.search || url.hash) {
      return { status: 'unusable_previous_url', destination: null }
    }
    if (url.hostname === 't.zsxq.com' && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)) {
      return { status: 'resolved_topic_share_shortlink', destination: url.toString() }
    }
    if (url.hostname !== 'wx.zsxq.com') return { status: 'unusable_previous_url', destination: null }
    if (url.pathname.includes('/topic_detail/')) {
      return { status: 'resolved_topic_detail', destination: url.toString() }
    }
    if (url.pathname.startsWith('/group/')) {
      return { status: 'group_fallback', destination: 'https://wx.zsxq.com/group/88888881284242' }
    }
  } catch {
    return { status: 'unusable_previous_url', destination: null }
  }
  return { status: 'unusable_previous_url', destination: null }
}

function isResolvedZsxqCrosslink(status) {
  return status === 'resolved_topic_share_shortlink' || status === 'resolved_topic_detail'
}

function collectScheduledPublishes(log, dateKey) {
  const published = (log.dailyRuns || []).flatMap((run) => run.externalPublishes || [])
  return (log.dailyRuns || [])
    .flatMap((run) => run.scheduledPublishes || [])
    .filter((item) => String(item.scheduledFor || '').startsWith(dateKey))
    .map((item) => {
      const verified = findMatchingPublication(item, published)
      return {
        platform: item.platform,
        account: item.account,
        title: item.title,
        scheduledFor: item.scheduledFor,
        status: verified ? 'published_verified' : item.status,
        previewUrl: item.previewUrl,
        ...(verified ? { publicUrl: verified.url, publishedAt: verified.publishedAt } : {}),
      }
    })
}

function findMatchingPublication(scheduled, published) {
  const scheduledIds = [scheduled.articleId, scheduled.pgcId, scheduled.externalId].filter(Boolean)
  return published.find((item) => {
    if (item.platform !== scheduled.platform) return false
    if (item.title === scheduled.title) return true
    const publicationIds = [item.externalId, item.articleId, item.itemId, item.statusId].filter(Boolean)
    return scheduledIds.some((id) => publicationIds.includes(id))
  })
}

async function collectDueContentActions(calendars, dateKey, log) {
  const purePayloadPlatforms = new Set(['x', 'zsxq'])
  const zsxqStartPublication = (log.dailyRuns || [])
    .filter((run) => run.date === dateKey)
    .flatMap((run) => run.externalPublishes || [])
    .find((item) => item.platform === 'zsxq' && item.calendarEntryId === 'w1-zsxq-start')
  const zsxqCrosslink = resolveZsxqCrosslinkUrl(zsxqStartPublication?.url)
  const items = calendars
    .flatMap((calendar) => calendar.entries || [])
    .filter((item) => item.date === dateKey)
  return Promise.all(items.map(async (item) => {
      const assets = item.assets || []
      const weeklyReviewSpec = weeklyReviewSpecFor(item.id)
      const generatedWeeklyReviewText = weeklyReviewSpec
        ? await fs.readFile(path.resolve(projectDir, weeklyReviewSpec.output), 'utf8').catch(() => '')
        : ''
      const publishAsset = item.status === 'blocked'
        ? null
        : generatedWeeklyReviewText
          ? weeklyReviewSpec.output
          : assets.find((asset) => asset.endsWith('-publish.txt')) || assets[0] || null
      let payloadReady = !purePayloadPlatforms.has(item.platform)
        || Boolean(publishAsset?.endsWith('-publish.txt'))
      let payloadMarker = null
      let publishAssetSha256 = null
      if (purePayloadPlatforms.has(item.platform) && publishAsset?.endsWith('-publish.txt')) {
        const publishText = await fs.readFile(path.resolve(projectDir, publishAsset), 'utf8').catch(() => '')
        payloadReady = publishText.trim().length > 0
        payloadMarker = publishText.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null
        publishAssetSha256 = publishText
          ? crypto.createHash('sha256').update(publishText).digest('hex')
          : null
      }
      if (['wechat', 'csdn', 'toutiao'].includes(item.platform) && publishAsset) {
        const publishText = await fs.readFile(path.resolve(projectDir, publishAsset), 'utf8').catch(() => '')
        payloadReady = isCleanLongformBody(publishText, item.title, item.platform)
      }
      const mediaAttachment = item.mediaAttachment
        ? await enrichMediaPublishHashes(item.mediaAttachment)
        : null
      const runtimeCrosslinkHashes = item.id === 'w1-x-01'
        && isResolvedZsxqCrosslink(zsxqCrosslink.status)
        ? await buildRuntimeCrosslinkHashes(
            [mediaAttachment?.fallbackPublishAsset || publishAsset, mediaAttachment?.successPublishAsset]
              .filter(Boolean),
            zsxqCrosslink.destination,
          )
        : null
      return {
        id: item.id,
        date: item.date,
        platform: item.platform,
        title: item.title,
        status: item.status,
        scheduledFor: item.scheduledFor || null,
        blocker: item.blocker || null,
        publishAsset,
        publishAssetSha256,
        payloadReady,
        payloadMarker,
        assets,
        reviewedSourceAsset: item.reviewedSourceAsset || null,
        reviewedSourceSha256: item.reviewedSourceSha256 || null,
        ...(generatedWeeklyReviewText ? {
          generatedWeeklyReview: {
            week: weeklyReviewSpec.week,
            file: weeklyReviewSpec.output,
            contentSha256: crypto.createHash('sha256').update(generatedWeeklyReviewText).digest('hex'),
          },
        } : {}),
        mediaAttachment,
        ...(runtimeCrosslinkHashes ? { runtimeCrosslinkHashes } : {}),
      }
    }))
}

async function enrichScheduledLongformSources(calendars) {
  const entries = calendars.flatMap((calendar) => calendar.entries || [])
    .filter((entry) => entry.scheduledFor && new Set(['csdn', 'toutiao']).has(entry.platform))
  await Promise.all(entries.map(async (entry) => {
    const sourceAsset = (entry.assets || []).find((asset) =>
      /^content\/.+\.(?:md|mdx)$/i.test(asset)
      && !/source-audit|checklist|evidence/i.test(asset)
    )
    if (!sourceAsset) return
    const content = await fs.readFile(path.resolve(projectDir, sourceAsset)).catch(() => null)
    if (!content?.byteLength) return
    entry.reviewedSourceAsset = sourceAsset
    entry.reviewedSourceSha256 = crypto.createHash('sha256').update(content).digest('hex')
  }))
}

async function enrichMediaPublishHashes(mediaAttachment) {
  const result = { ...mediaAttachment }
  for (const [fileField, hashField] of [
    ['successPublishAsset', 'successPublishSha256'],
    ['fallbackPublishAsset', 'fallbackPublishSha256'],
  ]) {
    const filename = mediaAttachment[fileField]
    if (!filename) continue
    const content = await fs.readFile(path.resolve(projectDir, filename), 'utf8').catch(() => '')
    if (content) result[hashField] = crypto.createHash('sha256').update(content).digest('hex')
  }
  return result
}

async function buildRuntimeCrosslinkHashes(files, destination) {
  const hashes = {}
  for (const filename of [...new Set(files)]) {
    const source = await fs.readFile(path.resolve(projectDir, filename), 'utf8').catch(() => '')
    const matches = [...source.matchAll(/https:\/\/wx\.zsxq\.com\/[^\s]+/g)]
    if (matches.length !== 1) continue
    const payload = source.replace(matches[0][0], destination)
    hashes[filename] = crypto.createHash('sha256').update(payload).digest('hex')
  }
  return hashes
}

function isCleanLongformBody(markdown, title, platform) {
  const h1 = markdown.match(/^# (.+)$/m)?.[1]?.trim() || ''
  if (h1 !== title) return false
  const internal = /^## (标题|建议标题|摘要|正文|发布设置|后台设置|发布核验|运营动作|配图建议)$|^(?:- )?(计划发布时间|建议发布时间|备选标题|发布后记录)[：:]/m
  if (internal.test(markdown)) return false
  if (platform === 'wechat' && !/生成式[^\n]*不代表真实学员或课程效果/.test(markdown)) return false
  return true
}

function reconcileDueContentActions(actions, scheduledPublishes, log) {
  const publications = (log.dailyRuns || []).flatMap((run) => run.externalPublishes || [])
  return actions.map((action) => {
    const direct = publications.find((item) =>
      item.platform === action.platform
      && (item.calendarEntryId === action.id
        || (!item.calendarEntryId
          && item.title === action.title
          && String(item.publishedAt || '').slice(0, 10) === action.date))
    )
    const scheduled = scheduledPublishes.find((item) =>
      item.platform === action.platform && item.title === action.title
    )
    const verified = direct || (scheduled?.status === 'published_verified' ? scheduled : null)
    if (!verified) return action
    return {
      ...action,
      status: 'published',
      publicUrl: verified.url || verified.publicUrl,
      publishedAt: verified.publishedAt,
    }
  })
}

function collectTerminalScheduledFailures(log, dateKey, calendars = []) {
  const scheduled = (log.dailyRuns || []).flatMap((run) => run.scheduledPublishes || [])
  const calendarEntries = calendars.flatMap((calendar) => calendar.entries || [])
  const matches = (log.dailyRuns || [])
    .flatMap((run) => run.externalPublishAttempts || [])
    .filter((attempt) => attempt.terminal === true && String(attempt.attemptedAt || '').slice(0, 10) <= dateKey)
    .map((attempt) => {
      const calendarEntry = calendarEntries.find((entry) => entry.id === attempt.calendarEntryId) || null
      const scheduledRecord = scheduled.find((item) =>
        item.platform === attempt.platform
        && item.title === attempt.title
        && (!calendarEntry || String(item.scheduledFor || '').slice(0, 10) === calendarEntry.date)
      ) || null
      if (!calendarEntry || !scheduledRecord || attempt.attemptedAt < scheduledRecord.scheduledFor) return null
      return {
        platform: attempt.platform,
        calendarEntryId: calendarEntry.id,
        title: attempt.title,
        scheduledFor: scheduledRecord.scheduledFor,
        attemptedAt: attempt.attemptedAt,
        outcome: attempt.outcome,
        safeNextAction: attempt.safeNextAction,
        retryAllowed: false,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.attemptedAt.localeCompare(right.attemptedAt))
  return [...new Map(matches.map((item) => [item.calendarEntryId, item])).values()]
}

function collectOverdueScheduledPublishes(log, dateKey, calendars = [], terminalFailures = []) {
  const published = (log.dailyRuns || []).flatMap((run) => run.externalPublishes || [])
  const calendarEntries = calendars.flatMap((calendar) => calendar.entries || [])
  const terminalCalendarEntries = new Set(terminalFailures.map((item) => item.calendarEntryId))
  const verifiedKeys = new Set(published.flatMap((item) => [
    `${item.platform}:${item.title || ''}`,
    item.articleId ? `${item.platform}:${item.articleId}` : '',
    item.itemId ? `${item.platform}:${item.itemId}` : '',
  ]).filter(Boolean))
  return (log.dailyRuns || [])
    .flatMap((run) => run.scheduledPublishes || [])
    .filter((item) => String(item.scheduledFor || '').slice(0, 10) < dateKey)
    .filter((item) => {
      const keys = [
        `${item.platform}:${item.title || ''}`,
        item.articleId ? `${item.platform}:${item.articleId}` : '',
        item.pgcId ? `${item.platform}:${item.pgcId}` : '',
      ].filter(Boolean)
      return !keys.some((key) => verifiedKeys.has(key))
    })
    .filter((item) => {
      const calendarEntry = calendarEntries.find((entry) =>
        entry.platform === item.platform
        && entry.title === item.title
        && entry.date === String(item.scheduledFor || '').slice(0, 10)
      )
      return !calendarEntry || !terminalCalendarEntries.has(calendarEntry.id)
    })
    .map((item) => {
      const calendarEntry = calendarEntries.find((entry) =>
        entry.platform === item.platform
        && entry.title === item.title
        && entry.date === String(item.scheduledFor || '').slice(0, 10)
      ) || null
      return {
        platform: item.platform,
        title: item.title,
        scheduledFor: item.scheduledFor,
        previewUrl: item.previewUrl,
        calendarEntry: calendarEntry ? {
          id: calendarEntry.id,
          date: calendarEntry.date,
          platform: calendarEntry.platform,
          title: calendarEntry.title,
          reviewedSourceAsset: calendarEntry.reviewedSourceAsset || null,
          reviewedSourceSha256: calendarEntry.reviewedSourceSha256 || null,
        } : null,
      }
    })
}

function determineReviewMode(dateKey) {
  if (dateKey === '2026-09-10') return 'monthly_final'
  if (dateKey === '2026-09-09') return 'monthly_preflight'
  if (new Set(['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08']).has(dateKey)) return 'weekly'
  return 'daily'
}

function summarizeWeeklyExperiment(registry, dateKey) {
  const experiment = (registry.experiments || []).find((item) => item.decisionAt.slice(0, 10) === dateKey)
    || (registry.experiments || []).find((item) => dateKey >= item.observationStartsAt.slice(0, 10)
      && dateKey <= item.observationEndsAt.slice(0, 10))
    || null
  if (!experiment) {
    return {
      week: null,
      status: 'outside_experiment_window',
      decisionAt: null,
      reportCommand: null,
    }
  }
  return {
    week: experiment.week,
    status: experiment.status,
    decisionAt: experiment.decisionAt,
    currentExperiment: experiment.currentExperiment,
    selectedBranch: experiment.selectedBranch,
    reportCommand: `npm run campaign:weekly-experiment:report -- --as-of ${experiment.decisionAt} --json`,
  }
}

function summarizeResearchQueue(queue, dateKey, notebooklm) {
  const tasks = [...(queue.tasks || [])]
  const incomplete = tasks
    .filter((task) => task.status !== 'completed_verified')
    .sort((left, right) => left.dueOn.localeCompare(right.dueOn) || left.id.localeCompare(right.id))
  const due = incomplete.filter((task) => task.dueOn <= dateKey)
  const next = incomplete[0] || null
  let executionMode = 'queue_complete'
  if (next && !due.length) executionMode = 'wait_until_due'
  else if (due.length && notebooklm.cliAuth === 'ready') executionMode = 'cli_or_visible_browser'
  else if (due.length && notebooklm.status === 'browser_operational_cli_pending') executionMode = 'visible_browser_only'
  else if (due.length) executionMode = 'blocked_auth'
  return {
    queueFile: 'ops/campaigns/ai-native-generation-30d-research-queue.json',
    reportCommand: `node scripts/report-campaign-research-queue.mjs --as-of ${dateKey} --json`,
    nextReportCommand: next
      ? `node scripts/report-campaign-research-queue.mjs --as-of ${next.dueOn} --json`
      : null,
    tasks: tasks.length,
    completed: tasks.filter((task) => task.status === 'completed_verified').length,
    due: due.length,
    dueTaskIds: due.map((task) => task.id),
    dueExecutionPacks: due.map((task) => task.executionPack).filter(Boolean),
    dueRecordCommands: due.map((task) => {
      const sources = (task.sourceIds || []).map((sourceId) => `--verified-source ${sourceId}`).join(' ')
      return `node scripts/record-campaign-research-task.mjs --task ${task.id} --completed-at <ISO> ${sources} --source-citations-verified --privacy-verified --apply`
    }),
    nextTaskId: next?.id || null,
    nextDueOn: next?.dueOn || null,
    executionMode,
  }
}

function selectPlatformExecution(day, dueContentActions, scheduled, overdue, registry) {
  if (!day) return []
  const ids = [...new Set([
    day.primaryChannel,
    ...dueContentActions.map((item) => item.platform),
    ...scheduled.map((item) => item.platform),
    ...overdue.map((item) => item.platform),
  ])]
  return ids.map((id) => {
    const value = registry.platforms?.[id]
    return {
      platform: id,
      executionMode: value?.executionMode || 'unknown',
      externalWriteStatus: value?.externalWriteStatus || 'unknown',
      confirmationEvidence: value?.confirmationEvidence || [],
      currentBlocker: value?.currentBlocker || '未登记',
    }
  })
}

function buildOperatorChecks({
  day,
  dateKey,
  scheduledPublishes,
  terminalScheduledFailures,
  overdueScheduledPublishes,
  dueContentActions,
  datedAssets,
  tracking,
  paidPilot,
  missingPaidPilotFields,
  missingPaidPilotComplianceFields,
  reviewMode,
  weeklyExperiment,
  notebooklm,
  dueCourseMedia,
  platformRegistry,
  guardianIntake,
  courseProgress,
  ownerDecisions,
}) {
  if (!day) return ['当天不在 30 天活动周期内；不生成或发布活动内容。']
  const checks = [
    `确认今日主目标：${day.focus}；唯一主转化动作：${day.cta}。`,
    '公开前检查儿童隐私、效果承诺、来源与生成内容声明。',
    '发布后记录真实 URL、时间和平台可见指标；没有数据时写“未获得”。',
    '公开证据登记后，20:00 使用 npm run campaign:cross-platform:record -- 追加同 URL 指标快照；未知值写 unknown，不把跨平台数字相加为独立人数或转化。',
    '读取知识星球后台可见数字后追加结构化快照，不读取或导出 cookies。',
  ]
  checks.push(`课程内测意向只在作者人工核验公众号私信后用聚合数字登记；七个来源字段之和必须等于新增有效意向。来源码明确时按 ${Object.keys(guardianIntake.referralCodes || {}).join(' / ')} 归因，无法确认时记 origin-unattributed，不依据账号、时间或措辞猜测。`)
  checks.push(`免费研究型试学进度只按 ${courseProgress.participationCard} 的明确参与、确认后新任务、四阶段证据与退出规则人工聚合；公开视频播放、阅读、点赞、旧作业和星主示范不计课程开始。使用 recordCommandTemplate 时不得传入账号、消息原文或儿童资料。`)
  for (const decision of ownerDecisions.surfaced) {
    checks.push(`作者决定到期提醒（${decision.state}）：${decision.label}，截止 ${decision.dueAt}。${decision.decisionPrompt} 未确认时执行安全回退：${decision.safeFallback}`)
  }
  if (datedAssets.length === 0) checks.push('当前没有同日期活动素材，发布前需要补齐或明确复用哪份母稿。')
  if (tracking.status !== 'active') {
    checks.push(`课程页渠道链接当前为 ${tracking.status}；不要把 ${tracking.destination} 或其 UTM 链接放入外部内容。`)
    if (day.primaryChannel === 'website') {
      checks.push('今日原计划以网站为主平台，但课程页尚未公开；本日降级为已登录平台核验与知识星球现有公开链接承接，不把网站任务标记为完成。')
    }
  }
  if (notebooklm.cliAuth !== 'ready') {
    checks.push(`NotebookLM 网页端状态为 ${notebooklm.status || 'unknown'}，已保存研究笔记 ${notebooklm.savedResearchNotes ?? '未获得'} 条；CLI ${notebooklm.cliVersion || 'unknown'} 的独立 profile ${notebooklm.profile || '未登记'} 认证仍为 ${notebooklm.cliAuth || 'unknown'}。如需启用，只能由作者运行 notebooklm -p ${notebooklm.profile || '<PROFILE>'} login --browser chrome 并在可见新窗口手动登录；不得使用 --browser-cookies，不导入或读取 Chrome Cookie。`)
  }
  const researchQueue = notebooklm.researchQueue
  if (researchQueue?.due > 0) {
    checks.push(`NotebookLM 研究队列到期 ${researchQueue.due} 项（${researchQueue.dueTaskIds.join('、')}）；先运行 ${researchQueue.reportCommand}。执行包：${researchQueue.dueExecutionPacks.join('、') || '未提供'}。执行模式为 ${researchQueue.executionMode}，只保存限定来源研究笔记，公开断言仍回到官方或一手原文。完成后只有逐条核验来源引用与隐私边界，才运行：${researchQueue.dueRecordCommands.join('；')}`)
  } else if (researchQueue?.nextTaskId) {
    checks.push(`NotebookLM 下一研究任务 ${researchQueue.nextTaskId} 到期 ${researchQueue.nextDueOn}；当前不提前制造研究结论，届时先运行 ${researchQueue.nextReportCommand}。`)
  }
  if (dueContentActions.some((item) => item.id === 'w1-zsxq-start' && item.status === 'draft_ready')) {
    const pinPolicy = platformRegistry.platforms?.zsxq?.pinPolicy
    if (pinPolicy?.defaultAction === 'skip_existing_pinned_topic') {
      checks.push(`知识星球在 ${pinPolicy.observedAt} 的可见页面已有置顶内容（${pinPolicy.existingPinnedTopicSummary}）；本次默认只发布起点主题并跳过置顶。${pinPolicy.overrideCondition}`)
    } else {
      checks.push('知识星球起点主题公开核验后再尝试置顶；只有不会替换或取消现有重要置顶时执行。出现单置顶限制、需要先取消旧置顶或无法确认目标时，保留已发布主题并停止置顶动作。')
    }
  }
  const sourceAudits = new Set()
  for (const item of dueContentActions) {
    const intakeBridgeAsset = item.assets.find((asset) => asset.endsWith('-course-intake-bridge.md'))
    if (intakeBridgeAsset) {
      checks.push(`课程内测承接只使用内部卡 ${intakeBridgeAsset}：该卡不得作为主帖、首评或普通作业回复发布。只有监护人在可见页面主动询问课程、内测、报名或参与方式时，才人工使用卡内唯一回复一次；不在知识星球评论收集家庭字段，三项齐全的公众号私信才进入聚合意向登记。`)
    }
    const sourceAudit = item.assets.find((asset) => asset.endsWith('-scheduled-longform-source-audit.md'))
    if (sourceAudit && !sourceAudits.has(sourceAudit)) {
      sourceAudits.add(sourceAudit)
      checks.push(`定时稿到点事实核验使用 ${sourceAudit}；该文件是内部证据映射，不粘贴到公开页，也不代表平台排期正文已经更新。发现事实冲突时只记录并交由作者决定，不自动改稿、删除或重发。`)
    }
    if (item.status === 'blocked') {
      checks.push(`保持阻断：${item.platform}｜${item.title}；${item.blocker || '阻断原因未登记'}。`)
    } else if (item.status === 'draft_ready') {
      if (item.mediaAttachment?.status === 'local_ready') {
        const mediaUploadCapability = platformRegistry.platforms?.[item.platform]?.mediaUploadCapability
        if (mediaUploadCapability?.status === 'blocked_extension_file_url_permission') {
          checks.push(`媒体上传权限仍为阻断：${item.platform} 在 ${mediaUploadCapability.observedAt} 的可见文件选择器证据为“${mediaUploadCapability.evidence}”。作者未授权修改扩展设置前，直接使用文字回退版，不再次打开文件选择器试探，不声称视频或附件上线。解除方式：${mediaUploadCapability.requiredOwnerAction}`)
        } else {
          checks.push(`同帖媒体条件发布：先在 ${item.platform} 可见编辑器上传 ${item.mediaAttachment.videoAsset}；确认上传完成时使用 ${item.mediaAttachment.successPublishAsset}，并在发布后核验视频可播放、记录真实 URL 与初始指标。上传或处理失败时只使用 ${item.mediaAttachment.fallbackPublishAsset}，不增加第二条帖子、不声称视频已上线；字幕轨是否保留必须发布后单独确认。`)
        }
        if (item.mediaAttachment.accessibilityCheckAsset) {
          checks.push(`媒体可访问性口径：先读取 ${item.mediaAttachment.accessibilityCheckAsset}；当前硬字幕=${item.mediaAttachment.hardSubtitles}、无声回退=${item.mediaAttachment.muteFallbackStatus}。只能声称画面含关键要点并由同帖正文承接完整任务，不得声称逐字硬字幕或全程无声完整可理解。视频版浏览器输入包含 altText；编辑器提供 ALT/添加描述时原样填写，发布后可见媒体详情确认替代文本已设置或可用时才使用 recordAccessibleMediaCommandTemplate，否则只用 recordMediaCommandTemplate，不虚报 ALT。`)
        }
      } else if (item.payloadReady === false && weeklyReviewSpecFor(item.id)) {
        checks.push(`周复盘母稿保持未发布：${item.platform}｜${item.title} 只作为证据化生成输入；09:00 不提取或发布，20:00 先完成知识星球观察、已核验快照和唯一变量决策，再使用 campaign:weekly-review:prepare 生成无占位符纯载荷。`)
      } else if (item.payloadReady === false && ['x', 'zsxq'].includes(item.platform)) {
        checks.push(`只准备纯载荷：从 ${item.publishAsset || '母稿'} 提取 ${item.platform}｜${item.title} 的单平台公开正文；不得整文件粘贴或在本时段发布。`)
      } else if (item.payloadReady === false) {
        checks.push(`只整理公开正文：${item.platform}｜${item.title} 的标题、正文或内部字段检查未通过；修复前不得进入预览或定时。`)
      } else if (item.platform === 'wechat') {
        checks.push(`只准备公众号草稿与作者预览：标题取 ${item.title}，正文取 ${item.publishAsset} 的 H1 以下部分；没有作者确认和公开 URL，不得群发或登记 published。`)
      } else if (['csdn', 'toutiao'].includes(item.platform)) {
        const time = item.platform === 'csdn' ? '10:15' : '19:40'
        checks.push(`按 ${item.publishAsset} 将 ${item.platform}｜${item.title} 设置为 ${time} 定时；先核验后台定时状态，到点取得公开 URL 后再登记 published。`)
      } else if (item.platform === 'website' && tracking.status !== 'active') {
        checks.push(`网站母文已就绪但保持本地草稿：${item.title}；课程页生产状态与部署授权门禁未解除前，不改 published、不提交、不部署，也不登记公开 URL。`)
      } else {
        const prefix = item.platform === day.primaryChannel ? '今日主平台只使用' : '按'
        checks.push(`${prefix} ${item.publishAsset || '已审稿素材'} 完成 ${item.platform}｜${item.title} 的可见 UI 发布；发布前复核正文，发布后记录真实 URL 和初始指标。`)
      }
      if (item.id === 'w1-x-01' && item.platform === 'x') {
        checks.push('知识星球起点公开后，优先使用可见“分享”面板生成的 t.zsxq.com 主题短链：只把当前面板二维码 PNG 暂存到系统临时目录，运行 npm run campaign:zsxq:share-qr -- --input <TEMP_SHARE_QR_PNG> --json，并在解析后删除临时图片。若页面直接提供 topic_detail 主题详情 URL 也可使用。先登记真实主题 URL，再用 prepare-campaign-crosslink-payload.mjs 生成只读 X 直链载荷；若只取得 group URL 或目标无法确认，保持原始星球首页链接。不得猜测主题 ID、读取剪贴板旧内容或覆盖已审校的 -publish.txt。')
      }
    } else if (item.status === 'media_ready') {
      const delivery = dueCourseMedia.find((media) => item.assets.includes(media.videoAsset))
      if (delivery?.status === 'local_ready') {
        const mediaUploadCapability = platformRegistry.platforms?.[delivery.platform]?.mediaUploadCapability
        if (mediaUploadCapability?.status === 'blocked_extension_file_url_permission') {
          checks.push(`课程媒体上传权限仍为阻断：${delivery.platform} 共用的 Chrome 扩展文件传输在 ${mediaUploadCapability.observedAt} 已返回 Not allowed。作者未授权并完成权限复测前，本课默认发布自包含文字回退版，视频与练习卡继续保持 local_ready。`)
        } else {
          const lockedSuccessPayload = delivery.lessonId === 'L01'
            ? 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-video-publish.txt'
            : null
          checks.push(lockedSuccessPayload
            ? `课程视频待同帖承接：${delivery.lessonId}｜${delivery.title} 使用 ${delivery.videoAsset}，在 ${delivery.companionEntryId} 的知识星球编辑器中先确认上传完成；成功时只使用已锁定正文 ${lockedSuccessPayload}，不得临时拼接披露。若上传失败或无法核验，只使用自包含文字回退载荷，不声明视频上线，视频继续保持 local_ready；确认可播放后再用课程视频交付登记器单独补证。`
            : `课程视频待同帖承接：${delivery.lessonId}｜${delivery.title} 使用 ${delivery.videoAsset}，在 ${delivery.companionEntryId} 的知识星球编辑器中先确认上传完成；成功时在正文末尾追加“${delivery.successDisclosure}”后发布。若上传失败或无法核验，原样发布自包含文字任务，不追加视频声明，视频继续保持 local_ready；确认可播放后再用课程视频交付登记器单独补证。`)
        }
        checks.push(`分龄支架只用于课程内测带领：${delivery.ageScaffoldingGuide}；公开任务不追问精确年龄，也不依据年龄评价能力。只有监护人已主动提供年龄段时，才选择对应的成人协助和表达方式。`)
        checks.push(`课程事实与教学支架边界使用 ${delivery.evidenceMap}；权威来源只支持课程原则，不得把课程卡片写成官方标准，也不得把公开视频播放写成已证实学习效果。`)
        if (delivery.worksheetAsset && delivery.worksheetStatus === 'local_ready') {
          checks.push(`家庭练习卡为可选附件：${delivery.worksheetAsset}。仅在同一主题编辑器中可见上传成功时附加；失败不阻断视频版或文字回退版，不得声称已提供。发布后只有具体主题中 PDF 附件可见或可下载时，才运行 record-campaign-worksheet-delivery.mjs 独立登记；星球首页不能作为附件证据。卡片无需整张上传，不收集儿童个人信息或原始作业。`)
        }
      } else if (delivery?.status === 'published') {
        checks.push(`课程视频已取得可播放证据：${delivery.lessonId}｜${delivery.title}；不要重复上传，只补充真实观看和课程完成指标。`)
      } else {
        checks.push(`媒体就绪待承接：${item.title}；只有出现可见平台状态或公开 URL 后才记为发布。`)
      }
    } else if (item.status === 'published') {
      checks.push(`${item.platform}｜${item.title} 已取得公开发布证据；刷新运营包时不得重复发布，只继续执行剩余动作并补充尚未获得的真实指标。`)
    }
  }
  for (const item of scheduledPublishes) {
    if (item.status === 'published_verified') {
      checks.push(`${item.platform} 定时稿已取得公开发布证据；不要重复发布，只补充尚未获得的真实指标。`)
    } else {
      checks.push(`${item.scheduledFor.slice(11, 16)} 后核验 ${item.platform} 定时稿是否公开，并记录公开 URL 与初始指标。`)
    }
  }
  for (const item of overdueScheduledPublishes) {
    checks.push(`逾期核验：${item.scheduledFor} 的 ${item.platform} 定时稿尚无已发布证据；先核验真实状态，不补写或猜测 URL。`)
  }
  for (const item of terminalScheduledFailures) {
    checks.push(`终局失败保留审计：${item.platform}｜${item.title} 在 ${item.attemptedAt} 登记 ${item.outcome}，不再自动生成 verify_overdue 或重复发布；下一安全动作：${item.safeNextAction}`)
  }
  if (day.primaryChannel === 'wechat') {
    checks.push('公众号仅按人工发布清单操作；最终发布前由作者在后台预览确认。')
  }
  if (dateKey >= '2026-08-31' && paidPilot.paymentEnabled !== true) {
    checks.push(`课程内测仍为 ${paidPilot.status}，正式要约缺少 ${missingPaidPilotFields.length} 项、合规预检缺少 ${missingPaidPilotComplianceFields.length} 项；只收监护人意向，不收费。`)
  }
  if (reviewMode === 'weekly') {
    checks.push(`今天完成七日跨平台复盘：先运行 npm run campaign:cross-platform:report -- --as-of ${dateKey} --json，核验真实发布与同 URL 指标，再追加知识星球快照，并只调整下一周一个主要变量。`)
    checks.push(`唯一变量决策只在 ${weeklyExperiment.decisionAt} 后执行：先运行 ${weeklyExperiment.reportCommand}；decisionAllowed=false 或 evidence_incomplete 时保持原计划，不填写自由发挥的第二个变量。`)
    checks.push(`周复盘纯载荷只在 20:00 观察与快照之后运行 campaign:weekly-review:prepare 生成；decision_due 必须先登记唯一分支，evidence_incomplete 只能发布明确的证据不足版本。刷新 20:00 运营包后才发布列出的复盘动作，09:00 不提前发布含未来指标的复盘。`)
  }
  if (reviewMode === 'monthly_preflight') {
    checks.push('月末预检：核对所有到期发布、五份周历、知识星球阶段计数、双付费漏斗和另行授权反馈；缺失证据保持待核验。')
  }
  if (reviewMode === 'monthly_final') {
    checks.push('月末终检：最终知识星球快照必须覆盖 9 月 10 日；到期定时稿必须有真实发布或失败记录，再生成最终复盘。')
    checks.push('最终决策不得用本地就绪、阅读或意向替代真实发布、家庭完成、付款和另行授权反馈。')
    checks.push(`最终月报先运行 npm run campaign:monthly-review -- --as-of ${dateKey} --json；只有 finalizationState=final_ready 才运行 npm run campaign:monthly-review:article -- --as-of ${dateKey} --json。生成稿保持 published=false，未获部署授权不得上线。`)
  }
  return checks
}

function summarizeOwnerDecisions(registry, dateKey, slot) {
  if (registry.version !== 1 || registry.campaignId !== 'ai-native-generation-30d' || !Array.isArray(registry.decisions)) {
    throw new Error('作者决策登记无效。')
  }
  const hour = new Set(['09', '11', '20']).has(slot) ? slot : '09'
  const asOf = `${dateKey}T${hour}:00:00+08:00`
  const asOfMs = Date.parse(asOf)
  const decisions = registry.decisions.map((decision) => {
    let state
    if (decision.status !== 'pending') state = 'resolved'
    else if (asOfMs < Date.parse(decision.askNotBefore)) state = 'waiting_to_ask'
    else if (asOfMs <= Date.parse(decision.dueAt)) state = 'action_due'
    else state = 'overdue'
    return { ...decision, state }
  })
  return {
    asOf,
    state: decisions.some((decision) => ['action_due', 'overdue'].includes(decision.state))
      ? 'owner_action_needed'
      : 'no_owner_action_now',
    surfaced: decisions.filter((decision) => ['action_due', 'overdue'].includes(decision.state)),
    decisions,
  }
}

function renderMarkdown(pack) {
  const lines = [
    `# ${pack.date} 活动执行包`,
    '',
    `- 活动周期内：${pack.inCampaign ? '是' : '否'}`,
  ]
  if (pack.day) {
    lines.push(
      `- 周次：第 ${pack.day.week} 周`,
      `- 今日重点：${pack.day.focus}`,
      `- 主平台：${pack.day.primaryChannel}`,
      `- 主转化动作：${pack.day.cta}`,
    )
  }
  lines.push(`- 当前执行时段：${pack.runSlot.label}（${pack.runSlot.id}）`)
  lines.push(`- 课程页渠道链接：${pack.tracking.status}`)
  lines.push(`- NotebookLM：${pack.notebooklm.status}；来源 ${pack.notebooklm.sourceCount ?? '未获得'}；研究笔记 ${pack.notebooklm.savedResearchNotes ?? '未获得'}；CLI ${pack.notebooklm.cliVersion || 'unknown'} / profile ${pack.notebooklm.profile || '未登记'} / auth ${pack.notebooklm.cliAuth}`)
  lines.push(`- NotebookLM 研究队列：完成 ${pack.notebooklm.researchQueue.completed}/${pack.notebooklm.researchQueue.tasks}；到期 ${pack.notebooklm.researchQueue.due}；下一项 ${pack.notebooklm.researchQueue.nextTaskId || '无'}（${pack.notebooklm.researchQueue.nextDueOn || '无'}）`)
  lines.push(`- 免费试学进度：${pack.courseProgress.status}；明确参与 ${pack.courseProgress.explicitOptIns} / 开始 ${pack.courseProgress.courseStartedFamilies} / 完成 ${pack.courseProgress.courseCompletedFamilies}；快照 ${pack.courseProgress.capturedAt || '尚未开始'}`)
  lines.push(`- 监护人意向台账：${pack.guardianIntake.status}；有效意向 ${pack.guardianIntake.activeQualifiedInterests}；快照 ${pack.guardianIntake.capturedAt || '尚未开始'}`)
  lines.push(`- 复盘模式：${pack.reviewMode}`)
  lines.push(`- 周实验：第 ${pack.weeklyExperiment.week || '—'} 周；${pack.weeklyExperiment.status}；决策门 ${pack.weeklyExperiment.decisionAt || '无'}`)
  lines.push('', '## 当日素材', '')
  if (pack.datedAssets.length === 0) lines.push('- 无同日期素材')
  else lines.push(...pack.datedAssets.map((name) => `- content/campaigns/ai-native-generation-30d/${name}`))

  lines.push('', '## 定时发布核验', '')
  if (pack.scheduledPublishes.length === 0) lines.push('- 无已登记的定时发布')
  else {
    lines.push(...pack.scheduledPublishes.map(
      (item) => `- ${item.scheduledFor}｜${item.platform}｜${item.title}｜当前 ${item.status}`,
    ))
  }
  if (pack.overdueScheduledPublishes.length) {
    lines.push('', '### 逾期未核验', '')
    lines.push(...pack.overdueScheduledPublishes.map(
      (item) => `- ${item.scheduledFor}｜${item.platform}｜${item.title}`,
    ))
  }

  lines.push('', '## 今日内容动作', '')
  if (pack.dueContentActions.length === 0) lines.push('- 无周历到期动作')
  else {
    lines.push(...pack.dueContentActions.map(
      (item) => `- ${item.platform}｜${item.title}｜${item.status}｜${item.payloadReady === false ? '母稿（需提取 -publish.txt）' : '发布载荷'}：${item.publishAsset || '未登记'}${item.blocker ? `｜${item.blocker}` : ''}`,
    ))
  }

  lines.push('', '## 今日课程视频交付', '')
  if (pack.dueCourseMedia.length === 0) lines.push('- 无到期课程视频')
  else {
    lines.push(...pack.dueCourseMedia.map((item) =>
      `- ${item.lessonId}｜${item.title}｜${item.status}｜承接 ${item.companionEntryId}｜${item.videoAsset}`,
    ))
  }

  lines.push('', '## 当前时段允许动作', '')
  if (pack.runSlot.allowedActions.length === 0) lines.push('- 无外部动作；保持等待或只做本地只读核验')
  else {
    lines.push(...pack.runSlot.allowedActions.map((item) =>
      `- ${item.type}｜${item.platform}｜${item.title}${item.publishAsset ? `｜${item.publishAsset}` : ''}${item.mediaAttachment ? `｜附 ${item.mediaAttachment.videoAsset}` : ''}${item.scheduledFor ? `｜${item.scheduledFor}` : ''}`,
    ))
  }
  lines.push(...pack.runSlot.checks.map((item) => `- 门禁：${item}`))

  lines.push('', '## 今日平台执行规则', '')
  if (pack.platformExecution.length === 0) lines.push('- 无')
  else {
    lines.push(...pack.platformExecution.map((item) =>
      `- ${item.platform}｜${item.executionMode}｜${item.externalWriteStatus}｜验收：${item.confirmationEvidence.join('；')}｜阻断：${item.currentBlocker}`,
    ))
  }

  const metric = pack.latestMetrics
  lines.push(
    '',
    '## 知识星球最近快照',
    '',
    `- 捕获时间：${metric.capturedAt}`,
    `- 有效期成员 / 7 日活跃：${metric.unexpiredMembers} / ${metric.sevenDayActiveMembers}`,
    `- 近 30 日访问 / 点击 / 支付：${metric.thirtyDayPreviewVisitors} / ${metric.thirtyDayJoinClickers} / ${metric.thirtyDayPaidJoins}`,
    `- 第一周开始 / 有效完成：${metric.startedWeek1Families} / ${metric.validWeek1Families}`,
    `- 监护人内测意向：${metric.qualifiedGuardianInterests}`,
    `- 三天挑战开始 / 完成：${metric.challengeStartedFamilies} / ${metric.challengeCompletedFamilies}`,
    `- 研究项目开始 / 完成：${metric.researchProjectStartedFamilies} / ${metric.researchProjectCompletedFamilies}`,
    `- 安全门 / 公约 / 答辩：${metric.safetyCheckpointFamilies} / ${metric.familyAgreementFamilies} / ${metric.defenseCompletedFamilies}`,
    `- 活动归因星球访问 / 点击 / 新付费：${metric.campaignPaidPageVisitors} / ${metric.campaignJoinClickers} / ${metric.newPaidFamilies}`,
    `- 课程内测意向 / 付费 / 开始 / 完成：${metric.qualifiedGuardianInterests} / ${metric.paidPilotFamilies} / ${metric.courseStartedFamilies} / ${metric.courseCompletedFamilies}`,
    `- 获授权反馈：${metric.authorizedFeedbackCount}`,
    '',
    '## 课程内测付款门禁',
    '',
    `- 状态：${pack.paidPilot.status}`,
    `- 付款开启：${pack.paidPilot.paymentEnabled}`,
    `- 缺失必填项：${pack.paidPilot.missingRequiredFields.length ? pack.paidPilot.missingRequiredFields.join(', ') : '无'}`,
    `- 缺失合规项：${pack.paidPilot.missingComplianceFields.length ? pack.paidPilot.missingComplianceFields.join(', ') : '无'}`,
    `- 待审批建议：${pack.paidPilot.proposedOffer.priceCny} 元 / 家庭，${pack.paidPilot.proposedOffer.maxFamilies} 个家庭，${pack.paidPilot.proposedOffer.startsOn} 至 ${pack.paidPilot.proposedOffer.endsOn}`,
    '',
    '## 操作检查',
    '',
    ...pack.operatorChecks.map((item) => `- ${item}`),
    '',
    '> 本执行包只读取本地配置并生成检查清单，不执行发布、部署、改价、优惠或登录凭证读取。',
    '',
  )
  return `${lines.join('\n')}\n`
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
