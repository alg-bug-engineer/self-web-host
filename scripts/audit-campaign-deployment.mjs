import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const pageFile = path.join(projectDir, 'src', 'app', 'ai-native-generation', 'page.tsx')
const deploymentFile = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-deployment.json')
const scopeFile = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-deployment-scope.json')
const trackingFile = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-tracking-links.json')
const [pageSource, deployment, scope, tracking] = await Promise.all([
  fs.readFile(pageFile, 'utf8'),
  fs.readFile(deploymentFile, 'utf8').then(JSON.parse),
  fs.readFile(scopeFile, 'utf8').then(JSON.parse),
  fs.readFile(trackingFile, 'utf8').then(JSON.parse),
])
if (scope.version !== 1 || scope.campaignId !== deployment.campaignId) {
  throw new Error('部署范围清单版本或 campaignId 无效。')
}
const requiredRuntimePaths = scope.productionRuntimePaths || []
const requiredVerificationPaths = scope.verificationPaths || []

const publicPaths = [...new Set(
  [...pageSource.matchAll(/['"](\/(?:images|videos)\/[^'"?#]+)['"]/g)].map((match) => match[1]),
)].sort()
const subtitleArchives = publicPaths
  .filter((item) => item.endsWith('.mp4'))
  .map((item) => item.replace(/\.mp4$/, '.srt'))
const requiredPaths = publicPaths
const assets = []

for (const publicPath of requiredPaths) {
  const relativePath = path.posix.join('public', publicPath.slice(1))
  const absolutePath = path.join(projectDir, relativePath)
  const stat = await fs.stat(absolutePath).catch(() => null)
  const tracked = gitSucceeds(['ls-files', '--error-unmatch', relativePath])
  const ignored = gitSucceeds(['check-ignore', '--quiet', relativePath])
  assets.push({
    publicPath,
    relativePath,
    exists: Boolean(stat?.isFile()),
    bytes: stat?.size || 0,
    tracked,
    ignored,
  })
}

const runtimeFiles = await auditFiles(requiredRuntimePaths)
const verificationFiles = await auditFiles(requiredVerificationPaths)
const archiveFiles = await auditFiles(subtitleArchives.map((publicPath) => path.posix.join('public', publicPath.slice(1))))

const gitStatus = git(['status', '--porcelain', '--untracked-files=normal'])
const appPathsManifest = await readJson(path.join(projectDir, '.next', 'server', 'app-paths-manifest.json'))
const localBuildHasRoute = Object.keys(appPathsManifest || {}).some((route) =>
  route === '/ai-native-generation/page' || route.startsWith('/ai-native-generation/'))
const production = args.production
  ? await inspectProduction(deployment.productionRoute)
  : { checked: false, status: null, finalUrl: null }
const missingAssets = assets.filter((asset) => !asset.exists)
const untrackedAssets = assets.filter((asset) => asset.exists && !asset.tracked)
const ignoredRequiredAssets = assets.filter((asset) => asset.ignored)
const oversizedAssets = assets.filter((asset) => asset.bytes >= 100 * 1024 * 1024)
const missingRuntimeFiles = runtimeFiles.filter((file) => !file.exists)
const untrackedRuntimeFiles = runtimeFiles.filter((file) => file.exists && !file.tracked)
const ignoredRuntimeFiles = runtimeFiles.filter((file) => file.ignored)
const missingVerificationFiles = verificationFiles.filter((file) => !file.exists)
const untrackedVerificationFiles = verificationFiles.filter((file) => file.exists && !file.tracked)
const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0)
const blockers = []

if (!deployment.deploymentAuthorized || deployment.mode !== 'authorized') {
  blockers.push('本轮部署尚未获得明确授权，当前只能执行 preflight。')
}
if (gitStatus.trim()) blockers.push(`工作区存在 ${gitStatus.trim().split('\n').length} 项改动，现有部署脚本会停止。`)
if (missingAssets.length) blockers.push(`缺少 ${missingAssets.length} 个课程必需资产。`)
if (untrackedAssets.length) blockers.push(`${untrackedAssets.length} 个课程必需资产尚未被 Git 跟踪。`)
if (ignoredRequiredAssets.length) blockers.push(`${ignoredRequiredAssets.length} 个课程必需资产被 .gitignore 排除。`)
if (oversizedAssets.length) blockers.push(`${oversizedAssets.length} 个资产达到 GitHub 100 MiB 单文件限制。`)
if (missingRuntimeFiles.length) blockers.push(`缺少 ${missingRuntimeFiles.length} 个课程运行时源码文件。`)
if (untrackedRuntimeFiles.length) blockers.push(`${untrackedRuntimeFiles.length} 个课程运行时源码文件尚未被 Git 跟踪。`)
if (ignoredRuntimeFiles.length) blockers.push(`${ignoredRuntimeFiles.length} 个课程运行时源码文件被 .gitignore 排除。`)
if (missingVerificationFiles.length) blockers.push(`缺少 ${missingVerificationFiles.length} 个课程发布验收文件。`)
if (untrackedVerificationFiles.length) blockers.push(`${untrackedVerificationFiles.length} 个课程发布验收文件尚未被 Git 跟踪。`)
if (!localBuildHasRoute) blockers.push('当前生产构建没有课程页路由。')
if (tracking.status !== deployment.trackingLinksBeforeDeployment) {
  blockers.push(`渠道链接状态应保持 ${deployment.trackingLinksBeforeDeployment}，当前为 ${tracking.status}。`)
}
if (production.checked && production.status !== deployment.requiredProductionStatus) {
  blockers.push(`生产课程页当前返回 ${production.status}，尚未达到 ${deployment.requiredProductionStatus}。`)
}

const report = {
  campaignId: deployment.campaignId,
  generatedAt: new Date().toISOString(),
  state: blockers.length ? 'blocked' : 'ready',
  deploymentMode: deployment.mode,
  deploymentAuthorized: deployment.deploymentAuthorized,
  worktreeClean: !gitStatus.trim(),
  localBuildHasRoute,
  trackingStatus: tracking.status,
  latestReadinessReport: deployment.latestReadinessReport || null,
  lastPreflight: deployment.lastPreflight || null,
  scope: {
    manifest: path.relative(projectDir, scopeFile),
    neverInclude: scope.neverInclude || [],
    note: scope.scopeNote || null,
  },
  production,
  assets: {
    required: assets.length,
    existing: assets.length - missingAssets.length,
    tracked: assets.length - untrackedAssets.length,
    ignoredRequired: ignoredRequiredAssets.length,
    oversized: oversizedAssets.length,
    totalBytes,
    totalMiB: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
    missing: missingAssets.map((asset) => asset.relativePath),
    untracked: untrackedAssets.map((asset) => asset.relativePath),
  },
  code: {
    runtime: summarizeFiles(runtimeFiles),
    verification: summarizeFiles(verificationFiles),
  },
  localArchives: {
    requiredForProduction: false,
    ...summarizeFiles(archiveFiles),
  },
  blockers,
  postDeploymentChecks: deployment.postDeploymentChecks,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))
if (args.expectReady && report.state !== 'ready') process.exitCode = 1

function parseArgs(values) {
  const result = { expectReady: false, json: false, production: false }
  for (const value of values) {
    if (value === '--expect-ready') result.expectReady = true
    else if (value === '--json') result.json = true
    else if (value === '--production') result.production = true
    else throw new Error(`未知参数：${value}`)
  }
  return result
}

function git(args) {
  return execFileSync('git', args, { cwd: projectDir, encoding: 'utf8' })
}

function gitSucceeds(args) {
  try {
    execFileSync('git', args, { cwd: projectDir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function auditFiles(relativePaths) {
  return Promise.all(relativePaths.map(async (relativePath) => {
    const stat = await fs.stat(path.join(projectDir, relativePath)).catch(() => null)
    return {
      relativePath,
      exists: Boolean(stat?.isFile()),
      tracked: gitSucceeds(['ls-files', '--error-unmatch', relativePath]),
      ignored: gitSucceeds(['check-ignore', '--quiet', relativePath]),
    }
  }))
}

function summarizeFiles(files) {
  const missing = files.filter((file) => !file.exists)
  const untracked = files.filter((file) => file.exists && !file.tracked)
  const ignored = files.filter((file) => file.ignored)
  return {
    required: files.length,
    existing: files.length - missing.length,
    tracked: files.length - untracked.length,
    ignored: ignored.length,
    missing: missing.map((file) => file.relativePath),
    untracked: untracked.map((file) => file.relativePath),
  }
}

async function readJson(filename) {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8'))
  } catch {
    return null
  }
}

async function inspectProduction(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    await response.body?.cancel()
    return { checked: true, status: response.status, finalUrl: response.url }
  } catch (error) {
    return { checked: true, status: null, finalUrl: null, error: String(error) }
  }
}

function renderMarkdown(report) {
  const lines = [
    '# AI 原生一代课程部署预检',
    '',
    `- 状态：${report.state}`,
    `- 模式：${report.deploymentMode}`,
    `- 已获部署授权：${report.deploymentAuthorized ? '是' : '否'}`,
    `- 工作区干净：${report.worktreeClean ? '是' : '否'}`,
    `- 本地构建包含课程页：${report.localBuildHasRoute ? '是' : '否'}`,
    `- 必需资产：${report.assets.existing}/${report.assets.required} 存在，${report.assets.tracked}/${report.assets.required} 已跟踪，共 ${report.assets.totalMiB} MiB`,
    `- 运行时源码：${report.code.runtime.existing}/${report.code.runtime.required} 存在，${report.code.runtime.tracked}/${report.code.runtime.required} 已跟踪`,
    `- 发布验收文件：${report.code.verification.existing}/${report.code.verification.required} 存在，${report.code.verification.tracked}/${report.code.verification.required} 已跟踪`,
    `- 被忽略的必需资产：${report.assets.ignoredRequired}`,
    `- ≥100 MiB 单文件：${report.assets.oversized}`,
    `- 渠道链接状态：${report.trackingStatus}`,
  ]
  if (report.production.checked) lines.push(`- 生产课程页：HTTP ${report.production.status ?? '不可达'}`)
  lines.push('', '## 阻断项', '')
  if (report.blockers.length) lines.push(...report.blockers.map((item) => `- ${item}`))
  else lines.push('- 无')
  lines.push('', '> 此命令只读取本地状态和可选生产 URL，不执行提交、推送、部署或发布。', '')
  return `${lines.join('\n')}\n`
}
