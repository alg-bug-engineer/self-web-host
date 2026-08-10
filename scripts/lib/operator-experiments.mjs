const METRICS = new Set([
  'qualifiedVisitorsPercent',
  'articlePageViewsPercent',
  'engagementRatePoints',
  'returningRatePoints',
  'conversionRatePoints',
  'lcpP75Percent',
  'inpP75Percent',
  'clsP75Points',
])

const PRIVATE_PATH_PREFIXES = ['/api', '/operator', '/ai-operator', '/_next']

export function parseOperatorExperiment(message) {
  const trailers = parseTrailers(message)
  const id = trailers.get('operator-experiment')
  const hasExperimentTrailer = Boolean(id)
    || [...trailers.keys()].some((key) => key.startsWith('operator-'))

  if (!hasExperimentTrailer) return { experiment: null, error: null }
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) {
    return invalid('Operator-Experiment 必须是最多 80 字符的小写短横线标识。')
  }

  const hypothesis = trailers.get('operator-hypothesis') || ''
  if (hypothesis.length < 12 || hypothesis.length > 500) {
    return invalid('Operator-Hypothesis 必须是 12–500 字符的可验证假设。')
  }

  const primaryMetric = trailers.get('operator-primary-metric') || ''
  if (!METRICS.has(primaryMetric)) {
    return invalid(`Operator-Primary-Metric 必须是允许指标之一：${[...METRICS].join(', ')}。`)
  }

  const targetPath = trailers.get('operator-target-path') || ''
  if (!isPublicPath(targetPath)) {
    return invalid('Operator-Target-Path 必须是无查询参数的公开站内路径。')
  }

  return {
    error: null,
    experiment: {
      id,
      hypothesis,
      primaryMetric,
      targetPath,
    },
  }
}

export function primaryMetricSignal(metric, value) {
  if (!Number.isFinite(value)) return null
  const thresholds = {
    qualifiedVisitorsPercent: 5,
    articlePageViewsPercent: 5,
    engagementRatePoints: 2,
    returningRatePoints: 1,
    conversionRatePoints: 1,
    lcpP75Percent: 5,
    inpP75Percent: 5,
    clsP75Points: 0.02,
  }
  const threshold = thresholds[metric]
  if (!threshold) return null
  const lowerIsBetter = metric === 'lcpP75Percent' || metric === 'inpP75Percent' || metric === 'clsP75Points'
  if (lowerIsBetter) {
    if (value <= -threshold) return 'positive-signal'
    if (value >= threshold) return 'negative-signal'
    return 'mixed-signal'
  }
  if (value >= threshold) return 'positive-signal'
  if (value <= -threshold) return 'negative-signal'
  return 'mixed-signal'
}

function parseTrailers(message) {
  const output = new Map()
  for (const line of String(message || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]{1,80}):\s*(\S(?:.*\S)?)\s*$/)
    if (!match) continue
    output.set(match[1].toLowerCase(), match[2].trim())
  }
  return output
}

function isPublicPath(value) {
  if (!/^\/(?:[^?#\s]*)$/.test(value) || value.includes('//')) return false
  const normalized = value.length > 1 ? value.replace(/\/$/, '') : value
  try {
    const decoded = decodeURIComponent(normalized)
    if (decoded.includes('\\') || new URL(decoded, 'https://operator.invalid').pathname !== decoded) return false
    return !PRIVATE_PATH_PREFIXES.some((prefix) => decoded === prefix || decoded.startsWith(`${prefix}/`))
  } catch {
    return false
  }
}

function invalid(error) {
  return { experiment: null, error }
}
