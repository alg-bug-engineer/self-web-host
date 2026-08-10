import { compareArticleCandidate } from './content-diversity.mjs'

export function buildContentOperationsReport({
  now = new Date(),
  articles = [],
  manifests = [],
  publishState = {},
  rss = { checked: false },
} = {}) {
  const generatedAt = now.toISOString()
  const today = shanghaiDateKey(now)
  const shanghaiHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now))
  const published = articles.filter((article) => article.published !== false)
  const dailyArticles = published
    .filter((article) => article.filename?.startsWith('daily-'))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
  const latest = dailyArticles[0] || null
  const latestDate = latest?.date?.slice(0, 10) || null
  const daysSinceLatest = latestDate ? differenceInCalendarDays(today, latestDate) : null
  const expectedToday = shanghaiHour >= 9
  const todayPublished = latestDate === today
  const recentDateSet = new Set(lastDateKeys(today, 7))
  const publishedDates = new Set(dailyArticles.map((article) => article.date?.slice(0, 10)).filter(Boolean))
  const cadence7d = [...recentDateSet].filter((date) => publishedDates.has(date)).length
  const issues = []

  if (!latest) {
    issues.push({ severity: 'error', code: 'daily-content-missing', message: '仓库中没有已发布的 AI 日更文章。' })
  } else if (daysSinceLatest > 1 || expectedToday && !todayPublished) {
    issues.push({ severity: 'error', code: 'daily-content-stale', message: `最新日更停留在 ${latestDate}，今天 ${today} 尚未按计划发布。` })
  }

  let diversity = { checked: false, conflict: null }
  if (latest && dailyArticles.length > 1) {
    const comparison = compareArticleCandidate({ ...latest, markdown: latest.body }, dailyArticles.slice(1))
    diversity = {
      checked: true,
      conflict: comparison?.reasons?.length ? {
        date: comparison.article.date?.slice(0, 10) || null,
        title: comparison.article.title || comparison.article.filename,
        reasons: comparison.reasons,
      } : null,
    }
    if (diversity.conflict) {
      issues.push({
        severity: 'warning',
        code: 'daily-content-similar',
        message: `最新日更与 ${diversity.conflict.date}《${diversity.conflict.title}》存在历史重复信号；后续文章必须继续通过发布前相似度门槛。`,
      })
    }
  }

  const latestManifest = latestDate
    ? manifests.find((manifest) => manifest.date === latestDate && manifest.slug === latest.slug)
      || manifests.find((manifest) => manifest.date === latestDate)
      || null
    : null
  const stateKey = latestManifest?.date && latestManifest?.slug ? `${latestManifest.date}:${latestManifest.slug}` : null
  const publisherRecord = stateKey ? publishState[stateKey] : latestManifest?.slug ? publishState[latestManifest.slug] : null
  const publisherStatus = normalizePublisherStatus(publisherRecord?.status)
  const publisherLimitation = publisherRecord?.publishNote && /48001|未授权/i.test(publisherRecord.publishNote)
    ? 'freepublish-api-unauthorized'
    : publisherStatus === 'draft' ? 'draft-only' : null

  if (latest && !latestManifest) {
    issues.push({ severity: 'error', code: 'wechat-manifest-missing', message: '最新日更缺少公众号发布清单。' })
  } else if (latestManifest && publisherStatus === 'missing') {
    issues.push({ severity: 'error', code: 'wechat-delivery-missing', message: '最新日更尚无公众号草稿或发布记录。' })
  } else if (publisherStatus === 'draft') {
    issues.push({
      severity: 'warning',
      code: publisherLimitation || 'wechat-draft-only',
      message: publisherLimitation === 'freepublish-api-unauthorized'
        ? '最新日更已创建公众号草稿，但 freepublish 接口无权限，尚未自动群发。'
        : '最新日更目前只保留为公众号草稿。',
    })
  } else if (publisherStatus === 'publishing') {
    issues.push({ severity: 'warning', code: 'wechat-publishing', message: '公众号群发仍在等待确认。' })
  }

  if (rss.checked) {
    if (!rss.reachable) {
      issues.push({ severity: 'error', code: 'wechat-rss-unreachable', message: '公众号 RSS 内网服务无法读取。' })
    } else if (rss.loginStatus !== true) {
      issues.push({ severity: 'error', code: 'wechat-rss-auth-expired', message: '公众号 RSS 微信扫码授权已失效。' })
    } else if (!rss.feedExists) {
      issues.push({ severity: 'error', code: 'wechat-rss-feed-missing', message: '公众号 RSS 订阅不存在。' })
    } else if (Number(rss.itemCount || 0) === 0) {
      issues.push({ severity: 'warning', code: 'wechat-rss-empty', message: '公众号 RSS 授权有效，但 Feed 暂无文章；保持每日单次采集，避免触发频控。' })
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error')
  const hasWarnings = issues.some((issue) => issue.severity === 'warning')
  return {
    version: 1,
    generatedAt,
    status: hasErrors ? 'degraded' : hasWarnings ? 'limited' : 'healthy',
    website: {
      latestDailyDate: latestDate,
      latestDailyTitle: latest?.title || null,
      latestDailySlug: latest?.slug || null,
      today,
      expectedToday,
      todayPublished,
      daysSinceLatest,
      cadence7d,
      publishedDailyArticles: dailyArticles.length,
      diversity,
    },
    delivery: {
      manifestFound: Boolean(latestManifest),
      websiteUrl: safeWebsiteUrl(latestManifest?.websiteUrl),
      wechat: {
        status: publisherStatus,
        draftCreated: ['draft', 'publishing', 'published'].includes(publisherStatus),
        publicPublished: publisherStatus === 'published',
        limitation: publisherLimitation,
        updatedAt: validIsoDate(publisherRecord?.updatedAt),
      },
    },
    inboundSync: {
      importedWechatArticles: published.filter((article) => article.filename?.startsWith('wechat-')).length,
      rss: sanitizeRssStatus(rss),
    },
    issues,
  }
}

export function shanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

function normalizePublisherStatus(value) {
  return ['draft', 'publishing', 'published'].includes(value) ? value : 'missing'
}

function sanitizeRssStatus(rss) {
  return {
    checked: Boolean(rss.checked),
    reachable: rss.checked ? Boolean(rss.reachable) : null,
    loginStatus: rss.checked && rss.reachable ? rss.loginStatus === true : null,
    feedExists: rss.checked && rss.reachable ? Boolean(rss.feedExists) : null,
    feedName: typeof rss.feedName === 'string' ? rss.feedName.slice(0, 80) : null,
    itemCount: Number.isFinite(Number(rss.itemCount)) ? Number(rss.itemCount) : null,
    checkedAt: validIsoDate(rss.checkedAt),
  }
}

function safeWebsiteUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'ai-knowledgepoints.cn' ? url.toString() : null
  } catch {
    return null
  }
}

function validIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

function differenceInCalendarDays(left, right) {
  return Math.floor((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000)
}

function lastDateKeys(today, count) {
  const start = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: count }, (_, index) => new Date(start - index * 86_400_000).toISOString().slice(0, 10))
}
