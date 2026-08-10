const DEFAULT_EMPTY_BACKOFF_HOURS = 48
const DEFAULT_MAX_BACKOFF_HOURS = 168

export function normalizeWechatRssSyncState(value = {}) {
  const consecutiveEmptyUpdates = Math.max(0, Number.parseInt(value.consecutiveEmptyUpdates, 10) || 0)
  return {
    version: 2,
    consecutiveEmptyUpdates,
    lastAttemptAt: validIso(value.lastAttemptAt),
    lastSuccessfulAt: validIso(value.lastSuccessfulAt),
    backoffUntil: validIso(value.backoffUntil),
    lastItemCount: Math.max(0, Number.parseInt(value.lastItemCount, 10) || 0),
    lastResult: ['items-available', 'empty-after-update', 'frequency-controlled'].includes(value.lastResult)
      ? value.lastResult
      : null,
    lastFrequencyControlAt: validIso(value.lastFrequencyControlAt),
  }
}

export function shouldAttemptWechatRssUpdate({ state, now = new Date() } = {}) {
  const normalized = normalizeWechatRssSyncState(state)
  const timestamp = toDate(now)
  const backoffUntil = normalized.backoffUntil ? new Date(normalized.backoffUntil) : null
  return {
    allowed: !backoffUntil || timestamp >= backoffUntil,
    backoffUntil: backoffUntil?.toISOString() || null,
    consecutiveEmptyUpdates: normalized.consecutiveEmptyUpdates,
  }
}

export function recordWechatRssUpdate({
  state,
  now = new Date(),
  itemCount,
  frequencyControlled = false,
  emptyBackoffHours = DEFAULT_EMPTY_BACKOFF_HOURS,
  maxBackoffHours = DEFAULT_MAX_BACKOFF_HOURS,
} = {}) {
  const normalized = normalizeWechatRssSyncState(state)
  const timestamp = toDate(now)
  const safeItemCount = Math.max(0, Number.parseInt(itemCount, 10) || 0)
  if (safeItemCount > 0) {
    return {
      ...normalized,
      consecutiveEmptyUpdates: 0,
      lastAttemptAt: timestamp.toISOString(),
      lastSuccessfulAt: timestamp.toISOString(),
      backoffUntil: null,
      lastItemCount: safeItemCount,
      lastResult: 'items-available',
    }
  }

  const consecutiveEmptyUpdates = normalized.consecutiveEmptyUpdates + 1
  const baseHours = positiveNumber(emptyBackoffHours, DEFAULT_EMPTY_BACKOFF_HOURS)
  const capHours = Math.max(baseHours, positiveNumber(maxBackoffHours, DEFAULT_MAX_BACKOFF_HOURS))
  const backoffHours = Math.min(capHours, baseHours * (2 ** (consecutiveEmptyUpdates - 1)))
  return {
    ...normalized,
    consecutiveEmptyUpdates,
    lastAttemptAt: timestamp.toISOString(),
    backoffUntil: new Date(timestamp.getTime() + backoffHours * 3_600_000).toISOString(),
    lastItemCount: 0,
    lastResult: frequencyControlled ? 'frequency-controlled' : 'empty-after-update',
    lastFrequencyControlAt: frequencyControlled
      ? timestamp.toISOString()
      : normalized.lastFrequencyControlAt,
  }
}

export function hasWechatFrequencyControlEvidence(value) {
  return /(?:frequ(?:ency|encey)\s+control|\b200013\b|频率控制)/i.test(String(value || ''))
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null
}

function toDate(value) {
  const result = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(result.getTime())) throw new Error('公众号 RSS 退避时间无效。')
  return result
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}
