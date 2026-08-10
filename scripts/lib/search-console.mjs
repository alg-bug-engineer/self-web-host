const percent = (value) => Math.round(Number(value || 0) * 10_000) / 100
const decimal = (value) => Math.round(Number(value || 0) * 100) / 100

export function dateInTimeZone(value, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function shiftDate(dateKey, days) {
  const value = new Date(`${dateKey}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function finalizedDateRange(now = new Date(), days = 28, lagDays = 3) {
  const today = dateInTimeZone(now)
  const endDate = shiftDate(today, -lagDays)
  return { startDate: shiftDate(endDate, -(days - 1)), endDate }
}

export async function fetchSearchConsoleReport({
  accessToken,
  siteUrl,
  startDate,
  endDate,
  fetchImpl = fetch,
  apiBaseUrl = 'https://www.googleapis.com/webmasters/v3',
}) {
  if (!accessToken) throw new Error('Search Console access token 为空。')
  if (!siteUrl) throw new Error('Search Console property 为空。')

  const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const query = async (dimensions = [], rowLimit = 100) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        type: 'web',
        dataState: 'final',
        aggregationType: dimensions.includes('page') ? 'auto' : 'byProperty',
        rowLimit,
        startRow: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      const message = data.error?.message || `HTTP ${response.status}`
      throw new Error(`Search Console 查询失败：${message}`)
    }
    return Array.isArray(data.rows) ? data.rows : []
  }

  const [summaryRows, dailyRows, queryRows, pageRows] = await Promise.all([
    query([], 1),
    query(['date'], 31),
    query(['query'], 100),
    query(['page'], 100),
  ])
  const summary = summaryRows[0] || {}

  return {
    version: 1,
    status: 'connected',
    generatedAt: new Date().toISOString(),
    property: siteUrl,
    searchType: 'web',
    dataState: 'final',
    range: { startDate, endDate, days: 28, lagDays: 3, timeZone: 'America/Los_Angeles' },
    summary: {
      clicks: Number(summary.clicks || 0),
      impressions: Number(summary.impressions || 0),
      ctr: Number(summary.ctr || 0),
      ctrPercent: percent(summary.ctr),
      averagePosition: decimal(summary.position),
    },
    daily: dailyRows.map((row) => ({
      date: row.keys?.[0] || '',
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctrPercent: percent(row.ctr),
      averagePosition: decimal(row.position),
    })),
    topQueries: queryRows.map((row) => ({
      query: row.keys?.[0] || '',
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctrPercent: percent(row.ctr),
      averagePosition: decimal(row.position),
    })),
    topPages: pageRows.map((row) => ({
      page: row.keys?.[0] || '',
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctrPercent: percent(row.ctr),
      averagePosition: decimal(row.position),
    })),
    limitations: [
      'Search Analytics API 返回的是 Google 所保留的顶部结果，不保证覆盖所有查询行。',
      '日期按 America/Los_Angeles 口径，结束日滞后 3 天并只使用 finalized 数据。',
    ],
  }
}
