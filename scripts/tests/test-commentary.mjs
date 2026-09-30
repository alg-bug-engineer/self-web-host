import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { getPublishedCommentary, isCommentary, commentaryTopicLabel, formatCommentaryDate } from '../../src/lib/commentary.mjs'
import { renderPostMarkdown } from '../../src/lib/llms-markdown.mjs'

const makePost = (slug, overrides = {}) => ({
  slug, postType: 'commentary', commentaryTopic: 'products', published: true,
  date: '2026-09-30T16:33:00+08:00', ...overrides,
})
const posts = [
  makePost('z'), makePost('draft', { published: false }),
  makePost('article', { postType: 'article' }), makePost('legacy', { postType: undefined }),
  makePost('a'), makePost('older', { date: '2026-09-29T16:33:00+08:00' }),
]
assert.deepEqual(getPublishedCommentary(posts).map((post) => post.slug), ['a', 'z', 'older'])
assert.equal(posts[0].slug, 'z', 'Sorting must not mutate the shared allPosts collection')
assert.deepEqual(getPublishedCommentary([]), [])
assert.equal(isCommentary({ tags: ['AI锐评'] }), false, 'Tags must not silently reclassify legacy technical articles')
assert.equal(commentaryTopicLabel(makePost('products')), '产品观察')
assert.equal(commentaryTopicLabel({ commentaryTopic: 'events' }), '热门事件')
assert.equal(commentaryTopicLabel({ commentaryTopic: 'industry' }), '行业变化')
assert.equal(commentaryTopicLabel({}), '观点与分析')
assert.equal(formatCommentaryDate('2026-09-29T23:33:00Z'), '2026/09/30')

const markdown = renderPostMarkdown({
  ...makePost('test'), title: '测试锐评', description: '事实与观点分开', author: '芝士AI吃鱼',
  url: '/blog/test', tags: ['AI锐评'], body: { raw: '这是正文。' },
}, 'https://ai-knowledgepoints.cn')
assert.match(markdown, /栏目：\[AI锐评\]\(https:\/\/ai-knowledgepoints.cn\/commentary\)（观点与分析）/)
assert.match(markdown, /HTML 正文：\[https:\/\/ai-knowledgepoints.cn\/blog\/test\]/)

const root = new URL('../../', import.meta.url)
const read = (path) => fs.readFile(new URL(path, root), 'utf8')
const config = await read('contentlayer.config.ts')
assert.match(config, /postType:[\s\S]*?options: \['article', 'commentary'\][\s\S]*?default: 'article'/)
assert.match(config, /commentaryTopic:[\s\S]*?options: \['events', 'products', 'industry'\]/)
const article = await read('content/posts/commentary-2026-09-30-sonnet-max-review.mdx')
assert.match(article, /postType: commentary/)
assert.match(article, /commentaryTopic: products/)
assert.match(article, /published: true/)
assert.match(article, /access: public/)
assert.match(article, /给 AI 派一张小工单/)
assert.match(article, /这两例不足以判断 Max 在其他任务中的表现/)
assert.match(article, /玩笑归玩笑，最近一条真实的发布脚注/)
assert.match(article, /https:\/\/www.anthropic.com\/claude-sonnet-5-5/)
assert.match(article, /https:\/\/academy.claude.com\/tutorials\/choosing-the-right-effort-level-in-claude-code/)
assert.doesNotMatch(article, /\*\*[^*\n]+：\*\*[^\s]/)
for (const filename of ['src/components/Header.tsx', 'src/components/MobileMenu.tsx', 'src/app/page.tsx', 'src/app/sitemap.ts', 'src/app/llms.txt/route.ts']) {
  assert.match(await read(filename), /\/commentary/, `${filename} must expose the new section`)
}
const appCard = await read('src/components/AppCard.tsx')
assert.doesNotMatch(appCard, /timeAgo\(isPost/, 'Static post cards must not recompute a relative date during hydration')
assert.match(appCard, /timeZone: 'Asia\/Shanghai'/)
const feed = await read('src/app/commentary/feed.xml/route.ts')
assert.match(feed, /getPublishedCommentary\(allPosts\)/)
const rss = await read('src/lib/rss.ts')
assert.match(rss, /filter\(\(post\) => post.published\)/)
assert.match(rss, /absoluteUrl\(post.url\)/)
assert.ok(JSON.parse(await read('ops/public-analytics-paths.json')).staticPaths.includes('/commentary'))
console.log('AI锐评测试通过：显式分类、排序、草稿隔离、原有文章默认值、来源与 Markdown canonical。')
