const EXTERNAL_ACTION_TYPES = new Set([
  'search-instrumentation',
  'wechat-permission',
  'wechat-rss-auth',
])

export function buildOperatorDecision({
  activeDays = 0,
  visitorDays = 0,
  qualifiedVisitorDays = 0,
  searchEvidenceReady = false,
  minimumActiveDays = 7,
  minimumVisitorDays = 20,
  activeExperimentCount = 0,
  maximumConcurrentExperiments = 1,
  recommendedActions = [],
} = {}) {
  const minimums = {
    activeDays: boundedMinimum(minimumActiveDays, 7),
    visitorDays: boundedMinimum(minimumVisitorDays, 20),
  }
  const audienceEvidenceReady = activeDays >= minimums.activeDays && visitorDays >= minimums.visitorDays
  const growthReady = audienceEvidenceReady || searchEvidenceReady === true
  const activeExperiments = Math.max(0, Math.round(Number(activeExperimentCount) || 0))
  const experimentLimit = Math.max(1, Math.round(Number(maximumConcurrentExperiments) || 1))
  const actions = recommendedActions
    .filter((action) => action && typeof action === 'object')
    .sort((left, right) => Number(left.priority || 99) - Number(right.priority || 99))
  const externalBlockers = actions
    .filter((action) => EXTERNAL_ACTION_TYPES.has(action.type))
    .map(safeAction)
  const automaticMaintenance = actions.find((action) =>
    action.reviewRequired === false && Number(action.priority || 99) === 1)
  const experiment = growthReady
    ? actions.find((action) => action.reviewRequired === true && !EXTERNAL_ACTION_TYPES.has(action.type))
    : null

  if (automaticMaintenance) {
    return {
      mode: 'maintenance-required',
      growthReady,
      reason: '存在优先级 1 的已授权维护事项，应先恢复观测或生产闭环，再开展增长实验。',
      primaryAction: safeAction(automaticMaintenance),
      externalBlockers,
      evidence: evidenceSnapshot({ activeDays, visitorDays, qualifiedVisitorDays, searchEvidenceReady, minimums, activeExperiments, experimentLimit }),
    }
  }

  if (activeExperiments >= experimentLimit) {
    return {
      mode: 'experiment-observing',
      growthReady,
      reason: `已有 ${activeExperiments} 项显式增长实验处于观察窗口，达到并发上限 ${experimentLimit}；在其结束或判为数据不足前不启动新实验。`,
      primaryAction: null,
      externalBlockers,
      evidence: evidenceSnapshot({ activeDays, visitorDays, qualifiedVisitorDays, searchEvidenceReady, minimums, activeExperiments, experimentLimit }),
    }
  }

  if (experiment) {
    return {
      mode: 'experiment-review',
      growthReady,
      reason: '自然数据已达到最低判断窗口；一次只评审并执行一个增长实验，部署后观察完整效果窗口。',
      primaryAction: safeAction(experiment),
      externalBlockers,
      evidence: evidenceSnapshot({ activeDays, visitorDays, qualifiedVisitorDays, searchEvidenceReady, minimums, activeExperiments, experimentLimit }),
    }
  }

  return {
    mode: 'observe',
    growthReady,
    reason: growthReady
      ? '当前没有满足证据条件的增长实验，继续积累数据并保持技术与内容管线健康。'
      : `自然数据尚未达到 ${minimums.activeDays} 个活跃日且 ${minimums.visitorDays} 个访客天的最低窗口，不根据噪声改标题、内容或 UI。`,
    primaryAction: null,
    externalBlockers,
    evidence: evidenceSnapshot({ activeDays, visitorDays, qualifiedVisitorDays, searchEvidenceReady, minimums, activeExperiments, experimentLimit }),
  }
}

function boundedMinimum(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(10_000, Math.max(1, Math.round(numeric))) : fallback
}

function safeAction(action) {
  return {
    priority: Number(action.priority || 99),
    type: String(action.type || 'unknown').slice(0, 80),
    action: String(action.action || '').slice(0, 500),
    reviewRequired: action.reviewRequired !== false,
  }
}

function evidenceSnapshot({ activeDays, visitorDays, qualifiedVisitorDays, searchEvidenceReady, minimums, activeExperiments, experimentLimit }) {
  return {
    activeDays: Math.max(0, Number(activeDays) || 0),
    visitorDays: Math.max(0, Number(visitorDays) || 0),
    qualifiedVisitorDays: Math.max(0, Number(qualifiedVisitorDays) || 0),
    searchEvidenceReady: searchEvidenceReady === true,
    minimums,
    activeExperiments,
    maximumConcurrentExperiments: experimentLimit,
    experimentCapacityAvailable: activeExperiments < experimentLimit,
    remainingActiveDays: Math.max(0, minimums.activeDays - (Number(activeDays) || 0)),
    remainingVisitorDays: Math.max(0, minimums.visitorDays - (Number(visitorDays) || 0)),
  }
}
