#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { renderCoverSvg } from './lib/article-visuals.mjs'

const manifestFile = process.argv[2]
if (!manifestFile) throw new Error('用法：node scripts/render-article-cover.mjs content/wechat/<article>.json')

const projectDir = process.cwd()
const manifestPath = path.resolve(projectDir, manifestFile)
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const coverPath = path.resolve(projectDir, manifest.coverPath)
if (!coverPath.startsWith(`${path.join(projectDir, 'public', 'images', 'articles')}${path.sep}`)) {
  throw new Error('封面输出路径必须位于 public/images/articles。')
}

const svg = renderCoverSvg({
  title: manifest.title,
  kicker: String(manifest.topicCluster || 'AI').toUpperCase(),
})
await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(coverPath)
console.log(`已刷新文章封面：${path.relative(projectDir, coverPath)}`)
