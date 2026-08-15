export function resolveCourseProgress(metricsStarted, metricsCompleted, progress) {
  const fallbackStarted = nonNegativeInteger(metricsStarted, 'metricsStarted')
  const fallbackCompleted = nonNegativeInteger(metricsCompleted, 'metricsCompleted')
  if (fallbackCompleted > fallbackStarted) throw new Error('metricsCompleted 不能大于 metricsStarted。')
  if (!progress || progress.storageMode !== 'aggregate_only' || progress.mode !== 'free_research_trial') {
    throw new Error('课程进度台账必须使用 aggregate_only/free_research_trial。')
  }
  if (!Array.isArray(progress.snapshots)) throw new Error('课程进度台账必须包含 snapshots。')
  const latest = progress.snapshots.at(-1) || null
  if (!latest) {
    return {
      status: progress.status || 'not_started',
      capturedAt: null,
      source: 'campaign_metrics_fallback',
      totalInvited: 0,
      explicitOptIns: 0,
      courseStartedFamilies: fallbackStarted,
      courseCompletedFamilies: fallbackCompleted,
      withdrawnBeforeStart: 0,
      withdrawnAfterStart: 0,
      activeCourseFamilies: fallbackStarted - fallbackCompleted,
    }
  }
  if (Number.isNaN(Date.parse(latest.capturedAt))) throw new Error('课程进度最新快照 capturedAt 无效。')
  if (latest.containsIdentifiersOrMessageText !== false) {
    throw new Error('课程进度快照不得包含身份标识或消息原文。')
  }
  const result = {
    status: progress.status,
    capturedAt: latest.capturedAt,
    source: latest.source,
    totalInvited: nonNegativeInteger(latest.totalInvited, 'totalInvited'),
    explicitOptIns: nonNegativeInteger(latest.explicitOptIns, 'explicitOptIns'),
    courseStartedFamilies: nonNegativeInteger(latest.courseStartedFamilies, 'courseStartedFamilies'),
    courseCompletedFamilies: nonNegativeInteger(latest.courseCompletedFamilies, 'courseCompletedFamilies'),
    withdrawnBeforeStart: nonNegativeInteger(latest.withdrawnBeforeStart, 'withdrawnBeforeStart'),
    withdrawnAfterStart: nonNegativeInteger(latest.withdrawnAfterStart, 'withdrawnAfterStart'),
    activeCourseFamilies: integer(latest.activeCourseFamilies, 'activeCourseFamilies'),
  }
  validateProgress(result)
  return result
}

function validateProgress(value) {
  if (value.explicitOptIns > value.totalInvited) throw new Error('explicitOptIns 不能大于 totalInvited。')
  if (value.courseStartedFamilies > value.explicitOptIns - value.withdrawnBeforeStart) {
    throw new Error('courseStartedFamilies 不能大于明确参与且未在开始前退出的家庭。')
  }
  if (value.courseCompletedFamilies + value.withdrawnAfterStart > value.courseStartedFamilies) {
    throw new Error('课程完成与开始后退出合计不能大于课程开始家庭。')
  }
  if (value.activeCourseFamilies < 0) throw new Error('activeCourseFamilies 必须是非负整数。')
  const expectedActive = value.courseStartedFamilies - value.courseCompletedFamilies - value.withdrawnAfterStart
  if (value.activeCourseFamilies !== expectedActive) throw new Error('activeCourseFamilies 与阶段计数不一致。')
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} 必须是非负整数。`)
  return value
}

function integer(value, label) {
  if (!Number.isInteger(value)) throw new Error(`${label} 必须是整数。`)
  return value
}
