export const SITE_URL = 'https://ai-knowledgepoints.cn'
export const SITE_NAME = 'AI 知识点'
export const BRAND_NAME = '芝士AI吃鱼'
export const SITE_DESCRIPTION =
  '用漫画和人话拆解 AI：持续分享大模型、RAG、Agent、NLP 与 AI 工程实践。'

export const AUTHOR_PROFILES = [
  'https://github.com/alg-bug-engineer',
  'https://blog.csdn.net/wwlsm_zql',
  'https://juejin.cn/user/140380880250734',
  'https://blog.51cto.com/u_15610758',
]

export function absoluteUrl(pathname = '/') {
  return new URL(pathname, SITE_URL).toString()
}
