import type { Post } from 'contentlayer/generated'
export function isCommentary(post: Pick<Post, 'postType'>): boolean
export function getPublishedCommentary<T extends Pick<Post, 'published' | 'postType' | 'date' | 'slug'>>(posts: T[]): T[]
export function commentaryTopicLabel(post: Pick<Post, 'commentaryTopic'>): string
export function formatCommentaryDate(date: string): string
