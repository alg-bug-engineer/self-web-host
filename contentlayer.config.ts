import { defineDocumentType, makeSource } from 'contentlayer2/source-files'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import remarkGfm from 'remark-gfm'

export const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: `posts/**/*.mdx`,
  contentType: 'mdx',
  fields: {
    title: {
      type: 'string',
      required: true,
    },
    description: {
      type: 'string',
      required: true,
    },
    date: {
      type: 'date',
      required: true,
    },
    author: {
      type: 'string',
      default: '芝士AI吃鱼',
    },
    tags: {
      type: 'list',
      of: { type: 'string' },
      default: [],
    },
    cover: {
      type: 'string',
      required: false,
    },
    published: {
      type: 'boolean',
      default: true,
    },
    icon: {
      type: 'enum',
      options: ['cat', 'robot'],
      default: 'robot',
    },
  },
  computedFields: {
    slug: {
      type: 'string',
      resolve: (post) => post._raw.flattenedPath.replace('posts/', ''),
    },
    url: {
      type: 'string',
      resolve: (post) => `/blog/${post._raw.flattenedPath.replace('posts/', '')}`,
    },
    readingTime: {
      type: 'number',
      resolve: (post) => {
        const wordsPerMinute = 200
        const words = post.body.raw.split(/\s+/).length
        return Math.ceil(words / wordsPerMinute)
      },
    },
  },
}))

export default makeSource({
  contentDirPath: 'content',
  contentDirExclude: ['collections'],
  documentTypes: [Post],
  mdx: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      rehypeHighlight,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap',
          properties: {
            className: ['anchor'],
          },
        },
      ],
    ],
  },
})
