const COMMENTARY_TOPICS = {
  events: '热门事件',
  products: '产品观察',
  industry: '行业变化',
}

export const isCommentary = (post) => post.postType === 'commentary'

export function getPublishedCommentary(posts) {
  return posts
    .filter((post) => post.published && isCommentary(post))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.slug.localeCompare(b.slug))
}

export function commentaryTopicLabel(post) {
  return COMMENTARY_TOPICS[post.commentaryTopic] || '观点与分析'
}

export function formatCommentaryDate(date) {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
  })
}
