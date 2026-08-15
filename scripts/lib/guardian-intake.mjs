export function resolveGuardianIntake(metricsQualifiedInterests, intake) {
  const fallback = nonNegativeInteger(metricsQualifiedInterests, 'metricsQualifiedInterests')
  if (!intake || intake.storageMode !== 'aggregate_only' || !Array.isArray(intake.snapshots)) {
    throw new Error('监护人意向台账必须使用 aggregate_only 且包含 snapshots。')
  }
  const latest = intake.snapshots.at(-1) || null
  const originKeys = ['zsxq', 'wechat', 'x', 'csdn', 'toutiao', 'website', 'unattributed']
  const zeroOrigins = Object.fromEntries(originKeys.map((key) => [key, 0]))
  const acquisitionOriginTotals = intake.snapshots.reduce((totals, snapshot) => {
    for (const key of originKeys) {
      totals[key] += nonNegativeInteger(snapshot.attributionOrigin?.[key] ?? 0, `attributionOrigin.${key}`)
    }
    return totals
  }, { ...zeroOrigins })
  const attribution = {
    collectionChannel: intake.collectionChannel || null,
    referralCodes: intake.referralCodes || {},
    latestNewQualifiedOrigins: latest?.attributionOrigin || zeroOrigins,
    acquisitionOriginTotals,
  }
  if (!latest) {
    return {
      activeQualifiedInterests: fallback,
      capturedAt: null,
      source: 'campaign_metrics_fallback',
      status: intake.status || 'not_started',
      ...attribution,
    }
  }
  if (Number.isNaN(Date.parse(latest.capturedAt))) throw new Error('监护人意向最新快照 capturedAt 无效。')
  if (latest.containsIdentifiersOrMessageText !== false) {
    throw new Error('监护人意向快照不得包含身份标识或消息原文。')
  }
  return {
    activeQualifiedInterests: nonNegativeInteger(
      latest.activeQualifiedInterests,
      'activeQualifiedInterests',
    ),
    capturedAt: latest.capturedAt,
    source: latest.source,
    status: intake.status,
    ...attribution,
  }
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} 必须是非负整数。`)
  return value
}
