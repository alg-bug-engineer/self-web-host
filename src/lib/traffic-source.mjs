const internalDomains = ['ai-knowledgepoints.cn']

const aiSources = [
  ['chatgpt', ['chatgpt.com', 'chat.openai.com']],
  ['perplexity', ['perplexity.ai']],
  ['claude', ['claude.ai']],
  ['gemini', ['gemini.google.com', 'bard.google.com']],
  ['copilot', ['copilot.microsoft.com']],
  ['poe', ['poe.com']],
  ['you', ['you.com']],
  ['grok', ['grok.com']],
  ['deepseek', ['chat.deepseek.com', 'deepseek.com']],
  ['kimi', ['kimi.com', 'kimi.moonshot.cn']],
  ['doubao', ['doubao.com']],
  ['tongyi', ['tongyi.com', 'qianwen.com']],
  ['yuanbao', ['yuanbao.tencent.com']],
]

const searchEngines = [
  [/(^|\.)google\./, 'google'],
  [/(^|\.)baidu\.com$/, 'baidu'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)sogou\.com$/, 'sogou'],
  [/(^|\.)so\.com$/, '360'],
]

const socialSources = [
  [/(^|\.)weixin\.qq\.com$|^mp\.weixin\.qq\.com$/, 'wechat'],
  [/(^|\.)zhihu\.com$/, 'zhihu'],
  [/(^|\.)weibo\.com$/, 'weibo'],
  [/(^|\.)juejin\.cn$/, 'juejin'],
  [/(^|\.)csdn\.net$/, 'csdn'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
]

/**
 * Match a hostname only when it is the registered product domain or one of its
 * subdomains. This avoids classifying lookalikes such as chatgpt.com.example.
 *
 * @param {string} hostname
 * @param {string} domain
 */
function isDomainOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

/** @param {unknown} value */
function safeCampaignToken(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Reduce a page-view referrer to a privacy-safe acquisition category. UTM
 * campaigns intentionally take priority so explicitly tagged distribution can
 * be evaluated independently from inferred referrers.
 *
 * @param {Record<string, unknown>} body
 */
export function classifyTrafficSource(body) {
  const campaign = safeCampaignToken(body.utmSource)
  const medium = safeCampaignToken(body.utmMedium)
  if (campaign) return `campaign:${campaign}${medium ? `/${medium}` : ''}`

  const rawReferrer = String(body.referrer || '').slice(0, 500)
  if (!rawReferrer) return 'direct'

  try {
    const hostname = new URL(rawReferrer).hostname.toLowerCase().replace(/^www\./, '')
    if (!hostname) return 'direct'
    if (internalDomains.some((domain) => isDomainOrSubdomain(hostname, domain))) {
      return 'internal'
    }

    // AI assistants must be checked before generic search engines: Gemini is
    // hosted below google.com and would otherwise be counted as Google Search.
    const aiSource = aiSources.find(([, domains]) =>
      domains.some((domain) => isDomainOrSubdomain(hostname, domain)))
    if (aiSource) return `ai:${aiSource[0]}`

    const searchEngine = searchEngines.find(([pattern]) => pattern.test(hostname))
    if (searchEngine) return `search:${searchEngine[1]}`

    const socialSource = socialSources.find(([pattern]) => pattern.test(hostname))
    if (socialSource) return `social:${socialSource[1]}`

    return `referral:${hostname.slice(0, 80)}`
  } catch {
    return 'direct'
  }
}
