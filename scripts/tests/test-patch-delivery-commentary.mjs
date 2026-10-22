import assert from 'node:assert/strict';
import fs from 'node:fs';
const slug = 'commentary-2026-10-22-patch-delivery-gap';
const article = fs.readFileSync(`content/posts/${slug}.mdx`, 'utf8');
for (const pattern of [/date: 2026-10-22/, /postType: commentary/, /commentaryTopic: events/, /topicCluster: ai-commentary/, /原创假设场景/, /2026 年 10 月 21 日/, /修复和发布由 PHP 维护者主导/, /没有为此安排 WordPress 更新/, /参与方的公开叙述/, /不是本文对模型能力的独立复测/, /回补补丁/, /不推断全网受影响比例或修复完成率/, /AI 辅助整理与写作/]) assert.match(article, pattern);
for (const url of ['https://www.php.net/archive/2026.php', 'https://wordpress.org/news/2026/10/critical-php-security-release/', 'https://openai.com/index/coordinated-disclosure-of-critical-vulnerabilities/', 'https://www.wiz.io/blog/php2shell-php-rce']) assert.ok(article.includes(url));
assert.ok(!article.includes('**'), 'Do not leak MDX emphasis delimiters');
for (const [file,w,h,min] of [['patch-delivery.svg',1080,940,29], ['patch-delivery-mobile.svg',540,1490,30]]) {
 const path = `public/images/commentary/${slug}/${file}`;
 const svg = fs.readFileSync(path,'utf8');
 assert.ok(article.includes(path.slice(6)), 'Article must reference both responsive assets');
 assert.ok(svg.includes(`viewBox="0 0 ${w} ${h}"`));
 assert.match(svg, /<title[^>]*>.+<\/title>/);
 assert.match(svg, /<desc[^>]*>.+<\/desc>/);
 assert.ok(!/<(?:script|foreignObject|image)\b/i.test(svg));
 assert.ok(!/href=/.test(svg));
 assert.ok([...svg.matchAll(/font-size="(\d+)"/g)].every(m => Number(m[1]) >= min));
 for (const color of ['#ffffff','#1762aa','#fff8d8','#edf4fd','#eaf8f5','#fff0ee']) assert.ok(svg.includes(color));
 for (const label of ['发现者','维护者','运营者','临时缓解','运行状态']) assert.ok(svg.includes(label));
}
console.log('Patch-delivery commentary: metadata, primary sources, disclosure boundaries and responsive SVG checks passed');
