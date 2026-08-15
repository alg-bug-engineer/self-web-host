import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'

const projectDir = process.cwd()
const args = new Set(process.argv.slice(2))
const files = {
  campaign: 'ops/campaigns/ai-native-generation-30d.json',
  log: 'ops/campaigns/ai-native-generation-30d-log.json',
  platform: 'ops/campaigns/ai-native-generation-30d-platform-execution.json',
  media: 'ops/campaigns/ai-native-generation-30d-deployment-assets.json',
  queue: 'ops/campaigns/ai-native-generation-30d-research-queue.json',
}

const [campaign, log, platform, media, researchQueue] = await Promise.all(
  Object.values(files).map((file) => readJson(file)),
)
const invalid = []
const missingAssets = []

const notebooklm = log.notebooklm || {}
if (notebooklm.status !== 'browser_operational_cli_pending' && notebooklm.status !== 'ready') {
  invalid.push(`NotebookLM 状态不可执行：${notebooklm.status || 'unknown'}`)
}
if (typeof notebooklm.notebookId !== 'string' || !notebooklm.notebookId) {
  invalid.push('NotebookLM 缺少现有 notebookId')
}
if (!Number.isInteger(notebooklm.sourceCount) || notebooklm.sourceCount < 1) {
  invalid.push('NotebookLM 缺少有效来源计数')
}
if (!Number.isInteger(notebooklm.savedResearchNotes) || notebooklm.savedResearchNotes < 1) {
  invalid.push('NotebookLM 缺少已保存研究笔记计数')
}
if (notebooklm.attemptedSourceCount < notebooklm.sourceCount) {
  invalid.push('NotebookLM 尝试来源数不能小于有效来源数')
}
if (notebooklm.profile !== 'ai-native-generation') {
  invalid.push('NotebookLM 活动必须使用独立 profile ai-native-generation')
}
if (!/^0\.8\./.test(notebooklm.cliVersion || '')) {
  invalid.push(`NotebookLM CLI 版本未锁定到已验收的 0.8.x：${notebooklm.cliVersion || 'unknown'}`)
}
if ((notebooklm.failedSources || []).length !== notebooklm.attemptedSourceCount - notebooklm.sourceCount) {
  invalid.push('NotebookLM 失败来源数与尝试/有效来源差值不一致')
}
if (platform.platforms?.notebooklm?.externalWriteStatus !== 'research_notes_only') {
  invalid.push('NotebookLM 必须保持 research_notes_only')
}
if (!(platform.platforms?.notebooklm?.prohibitedActions || []).some((item) => /cookies/i.test(item))) {
  invalid.push('NotebookLM 缺少禁止导出 Cookie 的门禁')
}
if (researchQueue.version !== 1 || researchQueue.campaignId !== campaign.id) {
  invalid.push('NotebookLM 研究队列版本或 campaignId 无效')
}
if (researchQueue.evidenceMap !== 'ops/campaigns/ai-native-generation-30d-course-evidence-map.json') {
  invalid.push('NotebookLM 研究队列未绑定课程证据映射')
}
if ((researchQueue.tasks || []).length !== 6) invalid.push('NotebookLM 研究队列必须覆盖 6 个阶段任务')
if (!(researchQueue.tasks || []).some((task) => task.id === 'R04' && task.mustReverifyOnline === true)) {
  invalid.push('NotebookLM 高风险来源刷新任务缺少在线重验门禁')
}
const researchPolicy = Object.values(researchQueue.policy || {}).join('\n')
for (const marker of ['官方或一手原文', 'Chrome Cookie', '课程教学假设', '仍未知']) {
  if (!researchPolicy.includes(marker)) invalid.push(`NotebookLM 研究队列策略缺少：${marker}`)
}

const selectedMedia = [...(media.sharedImages || []), ...(media.posters || [])]
const courseBetaImage = (media.sharedImages || []).find((item) => item.name === 'course-beta-family-review')
if (!courseBetaImage) {
  invalid.push('即梦部署素材缺少课程内测主视觉')
} else {
  if (courseBetaImage.purpose !== 'course_beta_intake') invalid.push('课程内测主视觉用途未锁定')
  if (!/即梦.*生成式插画/.test(courseBetaImage.disclosure || '')) invalid.push('课程内测主视觉缺少即梦生成声明')
  if (!/不是真实儿童/.test(courseBetaImage.disclosure || '')) invalid.push('课程内测主视觉缺少非真实儿童声明')
  if (!/不代表真实学员或课程效果/.test(courseBetaImage.disclosure || '')) invalid.push('课程内测主视觉缺少非效果声明')
  const baseMetadata = courseBetaImage.output
    ? await sharp(path.resolve(projectDir, courseBetaImage.output)).metadata().catch(() => null)
    : null
  if (baseMetadata?.format !== 'webp' || baseMetadata?.width !== 1280 || baseMetadata?.height !== 1280) {
    invalid.push('课程内测方形主视觉必须为 1280×1280 WebP')
  }
  const requiredVariants = [
    { name: 'wide', width: 1200, height: 675, platforms: ['website', 'x'] },
    { name: 'wechat-cover', width: 900, height: 383, platforms: ['wechat'] },
  ]
  for (const expected of requiredVariants) {
    const variant = (courseBetaImage.variants || []).find((item) => item.name === expected.name)
    if (!variant) {
      invalid.push(`课程内测主视觉缺少 ${expected.name} 规格`)
      continue
    }
    if (variant.width !== expected.width || variant.height !== expected.height) {
      invalid.push(`课程内测主视觉 ${expected.name} 尺寸声明无效`)
    }
    if (JSON.stringify([...(variant.platforms || [])].sort()) !== JSON.stringify([...expected.platforms].sort())) {
      invalid.push(`课程内测主视觉 ${expected.name} 平台绑定无效`)
    }
    const stat = variant.output
      ? await fs.stat(path.resolve(projectDir, variant.output)).catch(() => null)
      : null
    if (!stat?.isFile()) missingAssets.push(`variant:${variant.output || 'missing'}`)
    else {
      const metadata = await sharp(path.resolve(projectDir, variant.output)).metadata().catch(() => null)
      if (metadata?.format !== 'webp' || metadata?.width !== expected.width || metadata?.height !== expected.height) {
        invalid.push(`课程内测主视觉 ${expected.name} 文件规格无效`)
      }
    }
  }
}
const lessons = new Set((media.posters || []).map((item) => item.lesson))
for (const lesson of Array.from({ length: 12 }, (_, index) => `L${String(index + 1).padStart(2, '0')}`)) {
  if (!lessons.has(lesson)) invalid.push(`即梦部署海报缺少 ${lesson}`)
}
if ((media.posters || []).length !== 12) invalid.push(`即梦课程海报应为 12，当前为 ${(media.posters || []).length}`)
if (platform.platforms?.jimeng?.executionMode !== 'local_api_5100') {
  invalid.push('即梦执行方式必须为 local_api_5100')
}
if (platform.platforms?.jimeng?.externalWriteStatus !== 'local_media_generation_only') {
  invalid.push('即梦必须保持 local_media_generation_only')
}
for (const item of selectedMedia) {
  if (!/jimeng-image-\d{8}T\d{6}Z-\d{2}\.png$/.test(item.source || '')) {
    invalid.push(`即梦源文件命名不可追溯：${item.source || 'missing'}`)
  }
  for (const field of ['source', 'output']) {
    const asset = item[field]
    const stat = asset ? await fs.stat(path.resolve(projectDir, asset)).catch(() => null) : null
    if (!stat?.isFile()) missingAssets.push(`${field}:${asset || 'missing'}`)
  }
}

const publicDisclosureFiles = await findPublicDisclosureFiles()
const disclosureChecks = []
for (const file of publicDisclosureFiles) {
  const text = await fs.readFile(path.resolve(projectDir, file), 'utf8')
  const declaresGenerated = /(?:图片|封面).*即梦.*生成/.test(text)
  const disclaimsOutcome = /不代表真实学员或课程效果/.test(text)
  disclosureChecks.push({ file, declaresGenerated, disclaimsOutcome })
  if (!declaresGenerated || !disclaimsOutcome) invalid.push(`公开素材声明不完整：${file}`)
}

const report = {
  campaignId: campaign.id,
  state: invalid.length || missingAssets.length ? 'blocked' : 'ready',
  notebooklm: {
    status: notebooklm.status || null,
    notebookId: notebooklm.notebookId || null,
    validSources: notebooklm.sourceCount ?? null,
    attemptedSources: notebooklm.attemptedSourceCount ?? null,
    failedSources: (notebooklm.failedSources || []).length,
    savedResearchNotes: notebooklm.savedResearchNotes ?? null,
    cliAuth: notebooklm.cliAuth || null,
    profile: notebooklm.profile || null,
    cliVersion: notebooklm.cliVersion || null,
    researchQueueTasks: (researchQueue.tasks || []).length,
    completedResearchTasks: (researchQueue.tasks || []).filter((task) => task.status === 'completed_verified').length,
    nextResearchTask: (researchQueue.tasks || [])
      .filter((task) => task.status !== 'completed_verified')
      .sort((left, right) => left.dueOn.localeCompare(right.dueOn))[0]?.id || null,
  },
  jimeng: {
    executionMode: platform.platforms?.jimeng?.executionMode || null,
    selectedSourceAssets: selectedMedia.length,
    platformVariants: courseBetaImage?.variants?.length || 0,
    lessonPosters: (media.posters || []).length,
    disclosureChecks,
    liveHealth: 'run skill health check separately; do not persist credentials',
  },
  handoff: {
    researchToEditorial: 'NotebookLM notes are leads; public claims must return to primary sources',
    mediaToPublishing: 'Only selected outputs enter deployment assets; public use requires disclosure',
    childPrivacy: 'Do not use or collect identifiable child media or private work',
  },
  missingAssets,
  invalid,
}

if (args.has('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  process.stdout.write([
    '# NotebookLM—即梦生产链路审计',
    '',
    `- 状态：${report.state}`,
    `- NotebookLM：${report.notebooklm.validSources}/${report.notebooklm.attemptedSources} 个有效来源；${report.notebooklm.savedResearchNotes} 条研究笔记；CLI ${report.notebooklm.cliAuth}`,
    `- 即梦：${report.jimeng.lessonPosters} 张课程海报；${report.jimeng.selectedSourceAssets} 个已选源素材；${report.jimeng.disclosureChecks.length} 个公开声明检查`,
    `- 缺失素材：${missingAssets.length}`,
    `- 无效项：${invalid.length}`,
    '',
  ].join('\n'))
}
if (report.state !== 'ready') process.exitCode = 1

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.resolve(projectDir, file), 'utf8'))
}

async function findPublicDisclosureFiles() {
  const postDir = path.resolve(projectDir, 'content/posts')
  const campaignDir = path.resolve(projectDir, 'content/campaigns/ai-native-generation-30d')
  const posts = (await fs.readdir(postDir))
    .filter((name) => /^daily-2026-.*\.(?:md|mdx)$/.test(name))
    .map((name) => path.join('content/posts', name))
  const campaignFiles = (await fs.readdir(campaignDir))
    .filter((name) => /wechat-(?:article|publish)\.(?:md|txt)$/.test(name))
    .map((name) => path.join('content/campaigns/ai-native-generation-30d', name))
  const candidates = [...posts, ...campaignFiles]
  const matched = []
  for (const file of candidates) {
    const text = await fs.readFile(path.resolve(projectDir, file), 'utf8')
    if (/images\/(?:campaigns|courses)\/ai-native-generation/.test(text) || /即梦.*生成/.test(text)) matched.push(file)
  }
  return matched.sort()
}
