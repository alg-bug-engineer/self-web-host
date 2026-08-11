const commitPattern = /^[0-9a-f]{40}$/i

/**
 * Probe the public homepage and health endpoint without recording an analytics
 * page view. The returned evidence is intentionally small enough for Actions
 * logs and contains no request headers, credentials or server internals.
 *
 * @param {{
 *   baseUrl: string,
 *   expectedCommit?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} options
 */
export async function checkProductionHealth({
  baseUrl,
  expectedCommit = '',
  fetchImpl = fetch,
  timeoutMs = 20_000,
}) {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '')
  const normalizedExpectedCommit = String(expectedCommit || '').trim().toLowerCase()
  if (!normalizedBaseUrl.startsWith('https://')) {
    throw new Error('PRODUCTION_BASE_URL 必须使用 HTTPS。')
  }
  if (normalizedExpectedCommit && !commitPattern.test(normalizedExpectedCommit)) {
    throw new Error('EXPECTED_COMMIT 必须是 40 位 Git 提交 SHA。')
  }

  const issues = []
  let homepageStatus = null
  let healthStatus = null
  let deployedCommit = null

  try {
    const response = await fetchImpl(`${normalizedBaseUrl}/`, {
      headers: { 'user-agent': 'ai-knowledgepoints-health-audit' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    homepageStatus = response.status
    if (!response.ok) issues.push(`homepage-http-${response.status}`)
  } catch {
    issues.push('homepage-unreachable')
  }

  try {
    const response = await fetchImpl(`${normalizedBaseUrl}/api/health`, {
      headers: { 'user-agent': 'ai-knowledgepoints-health-audit' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    healthStatus = response.status
    if (!response.ok) {
      issues.push(`health-http-${response.status}`)
    } else {
      const body = await response.json().catch(() => null)
      deployedCommit = typeof body?.commit === 'string' ? body.commit.toLowerCase() : null
      if (body?.ok !== true) issues.push('health-not-ok')
      if (!deployedCommit || !commitPattern.test(deployedCommit)) issues.push('health-commit-missing')
      if (normalizedExpectedCommit && deployedCommit !== normalizedExpectedCommit) {
        issues.push('production-commit-drift')
      }
    }
  } catch {
    issues.push('health-unreachable')
  }

  return {
    status: issues.length ? 'unhealthy' : 'healthy',
    checkedAt: new Date().toISOString(),
    expectedCommit: normalizedExpectedCommit || null,
    deployedCommit,
    endpoints: {
      homepage: homepageStatus,
      health: healthStatus,
    },
    issues,
  }
}
