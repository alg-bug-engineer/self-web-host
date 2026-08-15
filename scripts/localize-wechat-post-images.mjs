#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { downloadWechatImages, isWechatImageUrl } from './lib/wechat-images.mjs'

const projectDir = process.cwd()
const postsDir = path.join(projectDir, 'content', 'posts')
const publicDir = path.join(projectDir, 'public')
const requestedFiles = process.argv.slice(2)
const postFiles = requestedFiles.length
  ? requestedFiles.map((file) => path.resolve(projectDir, file))
  : (await fs.readdir(postsDir))
      .filter((file) => /^wechat-.*\.mdx$/.test(file))
      .map((file) => path.join(postsDir, file))

let changed = 0
for (const postFile of postFiles) {
  const slug = path.basename(postFile, '.mdx')
  const content = await fs.readFile(postFile, 'utf8')
  const urls = [...content.matchAll(/https:\/\/mmbiz\.(?:qpic|qlogo)\.cn\/[^\s)'"<>]+/gi)]
    .map((match) => match[0])
    .filter(isWechatImageUrl)
  if (!urls.length) continue

  const replacements = await downloadWechatImages(urls, { slug, publicDir })
  let localized = content
  for (const [source, target] of replacements) localized = localized.replaceAll(source, target)
  if (localized === content) continue

  await fs.writeFile(postFile, localized, 'utf8')
  changed += 1
  console.log(`已本地化 ${slug}：${replacements.size} 张图片。`)
}

console.log(`公众号历史文章图片本地化完成：更新 ${changed} 篇。`)
