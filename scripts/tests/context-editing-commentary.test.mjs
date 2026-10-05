import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { render } from '../render-context-editing-diagram.mjs'
const article = await fs.readFile(new URL('../../content/posts/commentary-2026-10-05-context-editing-scissors.mdx', import.meta.url), 'utf8')
const pin = '18dc11115f50f261233c5bba7937834491e307e8'
test('commentary preserves dated source and metric boundaries', () => {
  for (const phrase of ['date: 2026-10-05', 'postType: commentary', 'published: true', '9 月 29 日', '59.4%', '相对提升', '不是增加 11.4 个百分点', 'prefix-reuse FLOPs', '没有独立复现', pin, 'CC BY-NC 4.0', 'Coming soon', '830 道题', '100 轮上限', '23,560 token', '编辑轮次不计入该上限']) assert.ok(article.includes(phrase), phrase)
  for (const url of [...article.matchAll(/https:\/\/github\.com\/facebookresearch\/context-language-models\/blob\/([^/]+)\//g)]) assert.equal(url[1], pin)
})
test('interpretation does not erase pinned-prefix and independent-risk boundaries', () => {
  for (const phrase of ['system 和初始 task 固定', '每次模型调用的上下文快照', '假想', '不是 CLM 已遭利用的证据', '独立于最终 Astra 模型', '本文建议的验收路径', '未发现或声称 CLM 存在可利用漏洞']) assert.ok(article.includes(phrase), phrase)
  assert.match(article, /sourceUrl: https:\/\/arxiv.org\/abs\/2609.37725/)
})
test('desktop and mobile diagrams reproduce exactly and have separate geometry', async () => {
  for (const mobile of [false, true]) {
    const svg = await fs.readFile(new URL(`../../public/images/articles/context-editing-commentary/editable-workprint${mobile ? '-mobile' : ''}.svg`, import.meta.url), 'utf8')
    assert.equal(svg, render(mobile))
    assert.ok(svg.includes(mobile ? 'viewBox="0 0 540 1450"' : 'viewBox="0 0 1080 1000"'))
    for (const phrase of ['非性能实验', '所核对实现', '本文建议', '原始授权', '访问', '留存']) assert.ok(svg.includes(phrase), phrase)
    assert.doesNotMatch(svg, /<script|https?:\/\/(?!www.w3.org)|foreignObject/)
  }
  assert.match(article, /mobileSrc="\/images\/articles\/context-editing-commentary\/editable-workprint-mobile.svg"/)
})
test('all diagram text fits estimated CJK glyph boxes', () => {
  for (const mobile of [false, true]) {
    const width = mobile ? 540 : 1080, height = mobile ? 1450 : 1000
    const svg = render(mobile)
    for (const t of svg.matchAll(/<text x="(\d+)" y="(\d+)" font-size="(\d+)" fill="[^"]+" text-anchor="([^"]+)" font-weight="[^"]+">([^<]+)<\/text>/g)) {
      const [, xx, yy, sz, anchor, label] = t
      const x = Number(xx), y = Number(yy), size = Number(sz)
      const estimated = [...label].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 1 : 0.62), 0) * size
      const left = anchor === 'middle' ? x - estimated / 2 : x
      const right = anchor === 'middle' ? x + estimated / 2 : x + estimated
      assert.ok(left >= 20 && right <= width - 20 && y > size && y < height - 20, label)
    }
  }
})
