import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const manifestFile = path.resolve(
  projectDir,
  args.manifest || 'ops/campaigns/ai-native-generation-30d-publish-manifest-2026-08-12.json',
)
const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
const invalid = []

if (manifest.version !== 1) invalid.push('version 必须为 1')
if (manifest.campaignId !== 'ai-native-generation-30d') invalid.push('campaignId 不匹配')
if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.date || '')) invalid.push('date 无效')
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) invalid.push('必须至少固定 1 份发布载荷或媒体附件')

const assetIds = new Set()

const assetReports = []
for (const asset of manifest.assets || []) {
  if (assetIds.has(asset.id)) invalid.push(`资产 ID 重复：${asset.id}`)
  assetIds.add(asset.id)
  const file = path.resolve(projectDir, asset.file || '')
  let content = null
  try {
    content = await fs.readFile(file)
  } catch {
    invalid.push(`${asset.id || 'unknown'} 文件不存在：${asset.file}`)
    continue
  }
  const sha256 = crypto.createHash('sha256').update(content).digest('hex')
  if (sha256 !== asset.sha256) invalid.push(`${asset.id} SHA-256 不匹配`)
  if (!asset.id || !asset.platform || !asset.role || !asset.condition) invalid.push(`${asset.id || 'unknown'} 元数据不完整`)
  if (!/^[a-f0-9]{64}$/.test(asset.sha256 || '')) invalid.push(`${asset.id || 'unknown'} SHA-256 格式无效`)
  if (asset.platform === 'x') {
    const text = content.toString('utf8')
    const weightedLength = xWeightedLength(text.trim())
    if (weightedLength > 280) invalid.push(`${asset.id} X 加权长度 ${weightedLength} 超过 280`)
    if ([...text.matchAll(/https:\/\/wx\.zsxq\.com\/\S+/g)].length !== 1) {
      invalid.push(`${asset.id} 必须且只能包含 1 个知识星球链接`)
    }
    assetReports.push({ id: asset.id, sha256, weightedLength })
  } else if (asset.platform === 'zsxq') {
    const text = content.toString('utf8')
    const [title, , ...body] = text.split('\n')
    if (!title?.trim() || !body.join('\n').trim()) invalid.push(`${asset.id} 缺少标题或正文`)
    if (text.indexOf('场景｜给 AI 的输入类型') >= 150) invalid.push(`${asset.id} 五格任务出现过晚`)
    assetReports.push({ id: asset.id, sha256, characters: [...text].length })
  } else if (asset.platform === 'video') {
    if (path.extname(asset.file || '').toLowerCase() !== '.mp4') invalid.push(`${asset.id} 视频附件必须是 MP4`)
    if (content.byteLength === 0) invalid.push(`${asset.id} 视频附件为空`)
    const media = probeVideo(file, asset.id, invalid)
    if (media && asset.expectedMedia) validateExpectedMedia(asset.id, media, asset.expectedMedia, invalid)
    if (media?.subtitleDurationSeconds != null
      && media.subtitleDurationSeconds > media.durationSeconds + 0.1) {
      invalid.push(`${asset.id} 字幕轨时长超过容器时长 0.1 秒以上`)
    }
    assetReports.push({ id: asset.id, sha256, bytes: content.byteLength, ...(media ? { media } : {}) })
  } else if (asset.platform === 'worksheet') {
    if (asset.role !== 'optional_worksheet_attachment') invalid.push(`${asset.id} 练习卡角色无效`)
    if (path.extname(asset.file || '').toLowerCase() !== '.pdf') invalid.push(`${asset.id} 练习卡附件必须是 PDF`)
    if (!content.subarray(0, 5).equals(Buffer.from('%PDF-'))) invalid.push(`${asset.id} 练习卡不是有效 PDF 文件头`)
    if (content.byteLength === 0) invalid.push(`${asset.id} 练习卡附件为空`)
    assetReports.push({ id: asset.id, sha256, bytes: content.byteLength })
  } else {
    invalid.push(`${asset.id} 平台不受支持：${asset.platform}`)
  }
}

if (manifest.runtimeDerivative) {
  const runtimeScript = path.resolve(projectDir, manifest.runtimeDerivative.script || '')
  try {
    await fs.stat(runtimeScript)
  } catch {
    invalid.push('运行时直链生成器不存在')
  }
  for (const field of ['sourceSha256', 'contentSha256', 'destination', 'destinationType', 'payload', 'writesPerformed']) {
    if (!manifest.runtimeDerivative.requiredOutputFields?.includes(field)) invalid.push(`运行时派生缺少必需输出 ${field}`)
  }
  if (manifest.runtimeDerivative.shareQrDecoderScript) {
    const decoderScript = path.resolve(projectDir, manifest.runtimeDerivative.shareQrDecoderScript)
    try {
      await fs.stat(decoderScript)
    } catch {
      invalid.push('知识星球分享二维码解析器不存在')
    }
    for (const field of ['destination', 'destinationType', 'imageSha256', 'decoder', 'writesPerformed']) {
      if (!manifest.runtimeDerivative.shareQrRequiredOutputFields?.includes(field)) {
        invalid.push(`分享二维码解析缺少必需输出 ${field}`)
      }
    }
  }
}
if (manifest.externalWritesPerformed !== false) invalid.push('清单不得登记外部写入')

const report = {
  campaignId: manifest.campaignId,
  date: manifest.date,
  state: invalid.length ? 'invalid' : 'ready',
  manifest: path.relative(projectDir, manifestFile),
  assets: assetReports,
  runtimeDerivative: manifest.runtimeDerivative,
  invalid,
  writesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  process.stdout.write([
    '# 活动发布版本清单核验',
    '',
    `- 状态：${report.state}`,
    `- 日期：${report.date}`,
    `- 基础载荷：${report.assets.length}`,
    `- 无效项：${report.invalid.length}`,
    '- 写入：无',
    '',
  ].join('\n'))
}
if (invalid.length) process.exitCode = 1

function parseArgs(values) {
  const parsed = { json: false, manifest: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--json') parsed.json = true
    else if (value === '--manifest') parsed.manifest = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function xWeightedLength(value) {
  const urls = [...value.matchAll(/https?:\/\/\S+/g)].length
  const withoutUrls = value.replace(/https?:\/\/\S+/g, '')
  let length = urls * 23
  for (const character of [...withoutUrls]) {
    length += /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(character) ? 2 : 1
  }
  return length
}

function probeVideo(file, assetId, invalid) {
  let probe
  try {
    probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-of', 'json',
      file,
    ], { encoding: 'utf8' }))
  } catch {
    invalid.push(`${assetId} 无法通过 ffprobe 核验`)
    return null
  }
  const video = probe.streams?.find((stream) => stream.codec_type === 'video')
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
  const subtitle = probe.streams?.find((stream) => stream.codec_type === 'subtitle')
  const durationSeconds = Number(probe.format?.duration)
  if (!video || !Number.isFinite(durationSeconds)) {
    invalid.push(`${assetId} 缺少有效视频流或容器时长`)
    return null
  }
  return {
    durationSeconds,
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name || null,
    subtitleCodec: subtitle?.codec_name || null,
    subtitleLanguage: subtitle?.tags?.language || null,
    subtitleDurationSeconds: subtitle?.duration == null ? null : Number(subtitle.duration),
  }
}

function validateExpectedMedia(assetId, media, expected, invalid) {
  const tolerance = expected.durationToleranceSeconds ?? 0.1
  if (Math.abs(media.durationSeconds - expected.durationSeconds) > tolerance) {
    invalid.push(`${assetId} 视频时长 ${media.durationSeconds} 不在 ${expected.durationSeconds}±${tolerance} 秒内`)
  }
  for (const [field, label] of [
    ['width', '视频宽度'],
    ['height', '视频高度'],
    ['videoCodec', '视频编码'],
    ['audioCodec', '音频编码'],
    ['subtitleCodec', '字幕编码'],
    ['subtitleLanguage', '字幕语言'],
  ]) {
    if (expected[field] != null && media[field] !== expected[field]) {
      invalid.push(`${assetId} ${label}应为 ${expected[field]}，实际为 ${media[field]}`)
    }
  }
}
