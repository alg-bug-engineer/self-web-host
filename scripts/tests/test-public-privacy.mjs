#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const privateName = String.fromCodePoint(0x5f20, 0x5176, 0x6765)
const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: projectDir,
  encoding: 'utf8',
}).split('\0').filter(Boolean)

for (const filename of trackedFiles) {
  const filePath = path.join(projectDir, filename)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue
  const content = fs.readFileSync(filePath)
  if (content.includes(0)) continue
  assert.ok(!content.toString('utf8').includes(privateName), `${filename} 中存在禁止公开的个人姓名`)
}

const portfolioPath = path.join(projectDir, 'content/collections/portfolio.json')
const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'))
const books = portfolio.filter((item) => item.type === 'book')
assert.ok(books.length > 0, '著作列表不应为空')
for (const book of books) {
  assert.equal(typeof book.title, 'string')
  assert.ok(book.title.trim())
  assert.deepEqual(Object.keys(book).sort(), ['title', 'type'], `《${book.title}》应仅保留书名`)
}

const removedPrivateAssets = [
  'public/images/portfolio/token.jpg',
  'public/images/portfolio/rag.png',
  'public/images/portfolio/geo.png',
  'docs/著作.jpeg',
]
for (const filename of removedPrivateAssets) {
  assert.ok(!fs.existsSync(path.join(projectDir, filename)), `${filename} 不应继续公开`)
}

console.log(`公开隐私测试通过：已检查 ${trackedFiles.length} 个跟踪文件，${books.length} 本著作仅保留书名。`)
