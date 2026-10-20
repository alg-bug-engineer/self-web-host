import assert from 'node:assert/strict';
import fs from 'node:fs';
const slug = 'commentary-2026-10-20-migration-behavior-contract';
const text = fs.readFileSync(`content/posts/${slug}.mdx`, 'utf8');
assert.match(text, /date: 2026-10-20/);
assert.match(text, /postType: commentary/);
assert.match(text, /commentaryTopic: products/);
assert.match(text, /topicCluster: ai-commentary/);
assert.match(text, /这段情节是虚构的/);
assert.match(text, /97\.9%/);
assert.match(text, /87\.4%/);
assert.match(text, /本文没有独立复现/);
assert.match(text, /272/);
assert.match(text, /不等于公告中的另一套 COBOL 隐藏迁移测试已经全部公开/);
assert.match(text, /995755bffdba3da60ca367448a1606ba0e50573a/);
assert.match(text, /浮点结果项的例外/);
assert.match(text, /1\.239/);
assert.match(text, /1\.23/);
assert.match(text, /1\.24/);
assert.match(text, /AI 辅助制作/);
assert.ok(!text.includes('**'), 'Numeric emphasis must not leak markdown delimiters into MDX output');
const sources = [
  'https://openai.com/index/low-resource-programming-languages/',
  'https://github.com/openai/MultiLangBench/blob/995755bffdba3da60ca367448a1606ba0e50573a/README.md',
  'https://bs2manuals.ts.fujitsu.com/psCOBOL2000V16en/rounded-phrase-cobol-compiler-reference-manual-2022-11-196-22036902.html',
];
for (const url of sources) assert.ok(text.includes(url));
for (const [name, width, height, min] of [['translation-and-change.svg',1080,930,27], ['translation-and-change-mobile.svg',540,1450,30]]) {
  const path = `public/images/commentary/${slug}/${name}`;
  assert.ok(text.includes(path.slice('public'.length)), 'Article must reference actual SVG path');
  const svg = fs.readFileSync(path, 'utf8');
  assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
  assert.match(svg, /<title[^>]*>.+<\/title>/);
  assert.match(svg, /<desc[^>]*>.+<\/desc>/);
  assert.ok(!/<(?:script|foreignObject|image)\b/i.test(svg));
  assert.ok(!/href=/.test(svg), 'Diagrams are self-contained');
  assert.ok([...svg.matchAll(/font-size="(\d+)"/g)].every(m => Number(m[1]) >= min));
  assert.match(svg, /#fff8d8/);
  assert.match(svg, /#1762aa/);
}
console.log('Migration commentary: source, boundary, metadata and SVG checks passed');
