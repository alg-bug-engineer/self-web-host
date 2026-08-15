import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const cliArgs = process.argv.slice(2)
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(renderHelp())
  process.exit(0)
}

const args = parseArgs(cliArgs)
const input = path.resolve(args.input)
const tempRoot = path.resolve(os.tmpdir())
if (input !== tempRoot && !input.startsWith(`${tempRoot}${path.sep}`)) {
  throw new Error('--input 只允许系统临时目录中的分享二维码图片。')
}
const stat = await fs.stat(input)
if (!stat.isFile() || stat.size < 128 || stat.size > 5 * 1024 * 1024) {
  throw new Error('二维码图片必须是 128 字节到 5 MB 的普通文件。')
}
const image = await fs.readFile(input)
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
if (!image.subarray(0, pngSignature.length).equals(pngSignature)) {
  throw new Error('分享二维码必须是 PNG。')
}

const swift = `
import Foundation
import AppKit
import Vision

guard let input = ProcessInfo.processInfo.environment["ZSXQ_SHARE_QR_INPUT"],
      let image = NSImage(contentsOfFile: input),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fatalError("无法读取二维码图片")
}
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
let handler = VNImageRequestHandler(cgImage: cgImage)
try handler.perform([request])
for result in request.results ?? [] {
  if let value = result.payloadStringValue { print(value) }
}
`

const output = execFileSync('/usr/bin/swift', ['-e', swift], {
  encoding: 'utf8',
  env: { ...process.env, ZSXQ_SHARE_QR_INPUT: input },
  maxBuffer: 1024 * 1024,
})
const values = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
const destinations = [...new Set(values.filter(isValidTopicShareShortlink))]
if (destinations.length !== 1) {
  throw new Error(`二维码必须且只能包含 1 个可核验的 t.zsxq.com 主题短链，当前为 ${destinations.length} 个。`)
}

const result = {
  destination: destinations[0],
  destinationType: 'verified_topic_share_shortlink',
  imageSha256: crypto.createHash('sha256').update(image).digest('hex'),
  decoder: 'macos_vision_qr',
  writesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else process.stdout.write([
  '# 知识星球分享二维码核验',
  '',
  `- 目标：${result.destination}`,
  `- 类型：${result.destinationType}`,
  `- 图片 SHA-256：${result.imageSha256}`,
  '- 写入：无',
  '',
  '> 只用于当前可见主题“分享”面板中的二维码。工具不读取剪贴板、浏览器凭证或会话文件。',
  '',
].join('\n'))

function parseArgs(values) {
  const parsed = { input: '', json: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--input') parsed.input = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else throw new Error(`未知参数：${value}`)
  }
  if (!parsed.input) throw new Error('--input 不能为空。')
  return parsed
}

function isValidTopicShareShortlink(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 't.zsxq.com'
      && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}

function renderHelp() {
  return [
    '知识星球可见分享二维码解析器（只读）',
    '',
    '用法：',
    '  node scripts/decode-zsxq-share-qr.mjs --input <系统临时目录中的 PNG> [--json]',
    '',
    '输入必须来自当前主题可见“分享”面板的二维码；输出只接受无参数 t.zsxq.com 主题短链。',
    '工具不读取剪贴板、cookies、localStorage、密码或浏览器会话文件，也不执行外部写入。',
    '',
  ].join('\n')
}
