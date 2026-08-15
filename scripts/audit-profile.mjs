#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import nextEnv from '@next/env'

const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const outputDir = path.join(dataDir, 'operator')
const outputPath = path.join(outputDir, 'profile-latest.json')
const profilePath = process.env.PROFILE_DATA_FILE || path.join(projectDir, 'src', 'data', 'profile.json')
const fixturePath = process.env.PROFILE_GITHUB_FIXTURE
const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'))
const expected = profile?.checks?.github
const publicIdentity = profile?.publicIdentity
const verifiedWorks = Array.isArray(profile?.verifiedWorks) ? profile.verifiedWorks : []

if (!expected?.login || !expected?.profileUrl || !Number.isInteger(expected?.expectedPublicRepositories)) {
  throw new Error('src/data/profile.json 缺少有效的 GitHub 核对配置。')
}
if (!profile?.publicEvidenceVerifiedAt || !publicIdentity?.career?.sourceLabel || !verifiedWorks.length) {
  throw new Error('src/data/profile.json 缺少公开身份或专业成果的核验来源。')
}
for (const work of verifiedWorks) {
  if (!work?.title || !work?.identifier || !work?.url || !work?.sourceLabel) {
    throw new Error('src/data/profile.json 存在缺少标识或来源的专业成果。')
  }
}

const generatedAt = new Date().toISOString()
const issues = []
let github = null

try {
  if (fixturePath) {
    github = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
  } else {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(expected.login)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ai-knowledgepoints-profile-audit/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`)
    github = body
  }
} catch (error) {
  issues.push({
    severity: 'warning',
    code: 'github-profile-unavailable',
    message: `GitHub 公开资料暂时无法核对：${safeMessage(error)}`,
  })
}

if (github) {
  if (github.login !== expected.login) {
    issues.push({
      severity: 'warning',
      code: 'github-login-drift',
      message: `GitHub 登录名已由 ${expected.login} 变为 ${String(github.login || '未知')}，需要人工核对作者链接。`,
    })
  }
  if (github.html_url && github.html_url !== expected.profileUrl) {
    issues.push({
      severity: 'warning',
      code: 'github-profile-url-drift',
      message: `GitHub 公开主页已由 ${expected.profileUrl} 变为 ${String(github.html_url)}，需要人工核对作者链接。`,
    })
  }
  if (expected.expectedName && github.name !== expected.expectedName) {
    issues.push({
      severity: 'warning',
      code: 'github-name-drift',
      message: `GitHub 公开名称与“${expected.expectedName}”不一致，需要人工核对品牌信息。`,
    })
  }
  if (Number(github.public_repos) !== expected.expectedPublicRepositories) {
    issues.push({
      severity: 'warning',
      code: 'github-repository-count-drift',
      message: `GitHub 公开仓库现为 ${Number(github.public_repos) || 0} 个，网站记录为 ${expected.expectedPublicRepositories} 个；修改作者页前需要代码审查。`,
    })
  }
}

const unavailable = issues.some((issue) => issue.code === 'github-profile-unavailable')
const report = {
  version: 2,
  generatedAt,
  status: unavailable ? 'unavailable' : issues.length ? 'review-needed' : 'healthy',
  profileVersion: profile.version,
  githubVerifiedAt: profile.githubVerifiedAt,
  github: github ? {
    login: String(github.login || ''),
    name: String(github.name || ''),
    publicRepositories: Math.max(0, Number(github.public_repos) || 0),
    followers: Math.max(0, Number(github.followers) || 0),
    profileUrl: expected.profileUrl,
    updatedAt: typeof github.updated_at === 'string' ? github.updated_at : null,
  } : null,
  publicEvidence: {
    verifiedAt: profile.publicEvidenceVerifiedAt,
    careerSource: {
      label: publicIdentity.career.sourceLabel,
    },
    verifiedWorks: verifiedWorks.map((work) => ({
      type: work.type,
      title: work.title,
      identifier: work.identifier,
      url: work.url,
      sourceLabel: work.sourceLabel,
    })),
  },
  manualClaims: [
    { key: 'csdnArticles', source: profile.sourceNotes?.csdnArticles || 'public-profile' },
    { key: 'wechatReaders', source: profile.sourceNotes?.wechatReaders || 'author-provided' },
    { key: 'career', source: profile.sourceNotes?.career || 'public-author-bio' },
    { key: 'verifiedWorks', source: profile.sourceNotes?.verifiedWorks || 'public-record' },
  ],
  issues,
}

await fs.mkdir(outputDir, { recursive: true, mode: 0o700 })
await fs.chmod(outputDir, 0o700).catch(() => undefined)
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
await fs.chmod(outputPath, 0o600).catch(() => undefined)

console.log(`个人公开资料巡检完成：${report.status}，问题 ${issues.length} 项`)
console.log(`私有报告：${outputPath}`)

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 180)
}
