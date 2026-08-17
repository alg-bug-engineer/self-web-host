import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeMarkdown, formatMarkdown, normalizeCodeText } from '../../src/lib/wechat-markdown.ts'

test('formatMarkdown preserves fenced code indentation and line breaks', () => {
  const source = '#标题\n\n```js\nif (ok) {\n\tconsole.log(ok)\n}\n```'
  const result = formatMarkdown(source)
  assert.match(result, /^# 标题/)
  assert.match(result, /if \(ok\) \{\n  console\.log\(ok\)\n\}/)
})

test('normalizeCodeText expands tabs and removes only the trailing newline', () => {
  assert.equal(normalizeCodeText('  a\n\tb\n'), '  a\n    b')
})

test('analyzeMarkdown reports WeChat-sensitive structures', () => {
  const diagnostics = analyzeMarkdown('> 引用\n\n```html\n<section>\n  text\n</section>\n```\n\n| A | B |\n|---|---|')
  assert.deepEqual(diagnostics, { codeBlocks: 1, codeLines: 3, quotes: 1, tables: 1, images: 0 })
})
