import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
if (!args.manifest) throw new Error('缺少 --manifest')
if (!args.approvedAt || Number.isNaN(Date.parse(args.approvedAt))) {
  throw new Error('--approved-at 必须是有效时间')
}

const manifestPath = path.resolve(projectDir, args.manifest)
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
if (manifest.releaseGate !== 'draft_only_manual_preview') {
  throw new Error(`只允许确认 draft_only_manual_preview 草稿，当前为 ${manifest.releaseGate || 'missing'}`)
}
if (manifest.authorApproval?.status !== 'pending') throw new Error('作者确认状态必须为 pending')

const html = await fs.readFile(path.resolve(projectDir, manifest.htmlPath), 'utf8')
const article = html.match(/<article>([\s\S]*?)<\/article>/i)?.[1]
if (!article) throw new Error('公众号 HTML 中没有找到 article 正文')
const currentContentSha256 = crypto.createHash('sha256').update(article).digest('hex')
if (manifest.contentSha256 !== currentContentSha256) {
  throw new Error('公众号正文已变化；必须重新生成草稿并由作者重新预览')
}

const next = structuredClone(manifest)
next.releaseGate = 'author_approved_for_publish'
next.authorApproval = {
  status: 'approved',
  approvedAt: new Date(args.approvedAt).toISOString(),
  approvedContentSha256: currentContentSha256,
}

const result = {
  mode: args.apply ? 'apply' : 'dry_run',
  manifest: path.relative(projectDir, manifestPath),
  title: manifest.title,
  contentSha256: currentContentSha256,
  releaseGateBefore: manifest.releaseGate,
  releaseGateAfter: next.releaseGate,
  approvedAt: next.authorApproval.approvedAt,
  writesPerformed: false,
  externalPublishPerformed: false,
}

if (args.apply) {
  await fs.writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  result.writesPerformed = true
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

function parseArgs(values) {
  const parsed = { manifest: '', approvedAt: '', apply: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--manifest') parsed.manifest = values[++index] || ''
    else if (value === '--approved-at') parsed.approvedAt = values[++index] || ''
    else if (value === '--apply') parsed.apply = true
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}
