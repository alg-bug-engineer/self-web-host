import { allPosts } from 'contentlayer/generated'
import publicAnalyticsPaths from '../../ops/public-analytics-paths.json'
import { normalizeAnalyticsPath } from './analytics-storage'

const staticPaths = new Set(publicAnalyticsPaths.staticPaths)
const publishedArticlePaths = new Set(
  allPosts.filter((post) => post.published).map((post) => post.url),
)

export function normalizeTrackableAnalyticsPath(value: string) {
  const pathname = normalizeAnalyticsPath(value)
  if (!pathname) return null
  return staticPaths.has(pathname) || publishedArticlePaths.has(pathname)
    ? pathname
    : null
}
