export function evaluateWeeklyExperiment(registry, metrics, asOfInput) {
  validateRegistry(registry)
  const asOf = normalizeAsOf(asOfInput)
  const experiment = selectExperiment(registry.experiments, asOf)
  if (!experiment) {
    return {
      state: 'outside_experiment_window',
      asOf,
      decisionAllowed: false,
      experiment: null,
      evidence: null,
      recommendedBranch: null,
      reason: '当前时间不在已登记的周实验窗口内。',
    }
  }

  if (experiment.selectedBranch) {
    return {
      state: 'decided',
      asOf,
      decisionAllowed: false,
      experiment,
      evidence: experiment.decisionEvidence,
      recommendedBranch: findBranch(experiment, experiment.selectedBranch.id),
      reason: '本周实验已经登记决策，不得重复选择第二个变量。',
    }
  }

  if (Date.parse(asOf) < Date.parse(experiment.decisionAt)) {
    return {
      state: experiment.status,
      asOf,
      decisionAllowed: false,
      experiment,
      evidence: null,
      recommendedBranch: null,
      reason: `决策门将于 ${experiment.decisionAt} 开启；此前不调整下一周内容。`,
    }
  }

  if (!experiment.currentExperiment || experiment.allowedBranches.length === 0) {
    return {
      state: 'pending_previous_decision',
      asOf,
      decisionAllowed: false,
      experiment,
      evidence: null,
      recommendedBranch: null,
      reason: '本周实验尚未由上一周唯一决策初始化。',
    }
  }

  const snapshots = (metrics.snapshots || []).filter((snapshot) => {
    const capturedAt = Date.parse(snapshot.capturedAt)
    return capturedAt >= Date.parse(experiment.observationStartsAt)
      && capturedAt <= Date.parse(experiment.observationEndsAt)
      && capturedAt <= Date.parse(asOf)
  })
  const latest = snapshots.at(-1)
  const requiredMetrics = Object.values(experiment.stageMetrics || {})
  if (!latest || requiredMetrics.length < 2
    || requiredMetrics.some((field) => !Number.isInteger(latest[field]) || latest[field] < 0)) {
    return {
      state: 'evidence_incomplete',
      asOf,
      decisionAllowed: false,
      experiment,
      evidence: latest ? buildEvidence(latest, experiment) : null,
      recommendedBranch: null,
      reason: `决策窗口内缺少带 ${requiredMetrics.join('、') || '阶段指标'} 的已核验知识星球快照。`,
    }
  }

  const evidence = buildEvidence(latest, experiment)
  if (evidence.formalTopicCount === 0 || evidence.readsKnown === false) {
    return {
      state: 'evidence_incomplete',
      asOf,
      decisionAllowed: false,
      experiment,
      evidence,
      recommendedBranch: null,
      reason: '缺少第一周正式主题的可见阅读口径，不能区分入口触达与任务门槛。',
    }
  }

  const recommendedBranch = chooseBranch(experiment, evidence)
  return {
    state: 'decision_due',
    asOf,
    decisionAllowed: true,
    experiment,
    evidence,
    recommendedBranch,
    reason: '决策时点和最小证据均已满足；只能登记一个预定义分支。',
  }
}

export function normalizeAsOf(value) {
  if (!value) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00+08:00`
  if (Number.isNaN(Date.parse(value))) throw new Error('--as-of 必须是 YYYY-MM-DD 或有效 ISO 时间。')
  return value
}

export function findBranch(experiment, branchId) {
  const branch = experiment.allowedBranches.find((item) => item.id === branchId)
  if (!branch) throw new Error(`分支 ${branchId} 不在第 ${experiment.week} 周允许列表中。`)
  return branch
}

function validateRegistry(registry) {
  if (!registry || !Array.isArray(registry.experiments)) throw new Error('周实验登记缺少 experiments。')
  if (registry.policy?.maximumChangedVariablesPerReview !== 1) throw new Error('周实验必须限制每次复盘最多调整一个变量。')
  for (const experiment of registry.experiments) {
    if (!Number.isInteger(experiment.week)) throw new Error('周实验 week 必须是整数。')
    if (Date.parse(experiment.observationStartsAt) > Date.parse(experiment.decisionAt)) throw new Error(`第 ${experiment.week} 周时间窗口无效。`)
    const selected = experiment.selectedBranch ? 1 : 0
    if (selected > 1) throw new Error(`第 ${experiment.week} 周只能选择一个分支。`)
  }
}

function selectExperiment(experiments, asOf) {
  const timestamp = Date.parse(asOf)
  return experiments
    .filter((item) => timestamp >= Date.parse(item.observationStartsAt))
    .sort((left, right) => Date.parse(left.observationStartsAt) - Date.parse(right.observationStartsAt))
    .at(-1) || null
}

function buildEvidence(snapshot, experiment) {
  const calendarPrefix = `w${experiment.week}-`
  const formalContent = (snapshot.content || []).filter((item) => {
    const id = String(item.calendarEntryId || item.contentId || '')
    const publishedAt = Date.parse(item.publishedAt || item.contentId || '')
    return id.startsWith(calendarPrefix)
      || (Number.isFinite(publishedAt)
        && publishedAt >= Date.parse(experiment.observationStartsAt)
        && publishedAt <= Date.parse(experiment.observationEndsAt))
  })
  const reads = formalContent.map((item) => item.reads).filter(Number.isFinite)
  const comments = formalContent.map((item) => item.comments).filter(Number.isFinite)
  return {
    capturedAt: snapshot.capturedAt,
    source: snapshot.source,
    startedWeek1Families: snapshot.startedWeek1Families,
    validWeek1Families: snapshot.validWeek1Families,
    formalTopicCount: formalContent.length,
    readsKnown: formalContent.length > 0 && reads.length === formalContent.length,
    maximumVisibleReads: reads.length > 0 ? Math.max(...reads) : null,
    visibleComments: comments.length === formalContent.length ? comments.reduce((sum, value) => sum + value, 0) : null,
    week1MissingFieldCounts: snapshot.week1MissingFieldCounts || null,
    stageMetrics: Object.fromEntries(Object.entries(experiment.stageMetrics || {}).map(([stage, field]) => [
      stage,
      { field, value: snapshot[field] },
    ])),
  }
}

function chooseBranch(experiment, evidence) {
  const started = evidence.stageMetrics.started?.value
  const middle = evidence.stageMetrics.middle?.value
  const completed = evidence.stageMetrics.completed?.value
  if (completed >= 3) return findBranchByRole(experiment, 'keep')
  if (evidence.maximumVisibleReads === 0) return findBranchByRole(experiment, 'reach')
  if (started === 0 && (evidence.visibleComments || 0) === 0) return findBranchByRole(experiment, 'start')
  if (Number.isInteger(middle) && started > middle) return findBranchByRole(experiment, 'middle')
  if ((Number.isInteger(middle) && middle > completed)
    || (!Number.isInteger(middle) && started > completed)
    || ((evidence.visibleComments || 0) > 0 && completed === 0)) {
    return findBranchByRole(experiment, 'completion')
  }
  return findBranchByRole(experiment, 'feedback')
}

function findBranchByRole(experiment, role) {
  const branch = experiment.allowedBranches.find((item) => item.role === role)
  if (!branch) throw new Error(`第 ${experiment.week} 周缺少 ${role} 分支。`)
  return branch
}
