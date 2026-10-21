import assert from 'node:assert/strict';
import fs from 'node:fs';
const slug = 'commentary-2026-10-21-locked-chats-boundary';
const article = fs.readFileSync(`content/posts/${slug}.mdx`, 'utf8');
for (const pattern of [/date: 2026-10-21/, /postType: commentary/, /commentaryTopic: products/, /topicCluster: ai-commentary/, /假设小剧场/, /2026 年 10 月 20 日/, /管理员不能替用户解锁聊天或重置账户 PIN/, /会话消息权限须由工作区所有者授予/, /没有登录任何企业工作区测试开锁/, /不推断所有套餐都在同一天开放/, /锁定不等于所有屏幕瞬间清空/, /已有共享链接/, /AI 辅助整理与写作/]) assert.match(article, pattern);
for (const url of ['https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes', 'https://help.openai.com/en/articles/20001411-using-locked-chats-in-chatgpt', 'https://help.openai.com/en/articles/9261474-openai-compliance-platform-for-enterprise-and-edu-customers']) assert.ok(article.includes(url));
assert.ok(!article.includes('**'), 'Do not leak MDX emphasis delimiters');
for (const [file,w,h,min] of [['lock-and-governance.svg',1080,920,29], ['lock-and-governance-mobile.svg',540,1390,30]]) {
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
 assert.match(svg,/授权合规/);
 assert.match(svg,/保留规则/);
 assert.match(svg,/刷新/);
}
console.log('Locked-chats commentary: metadata, sources, authority boundaries and responsive SVG checks passed');
