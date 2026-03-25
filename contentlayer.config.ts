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
    category: {
      type: 'enum',
      options: ['tech', 'life'],
      default: 'tech',
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
        const content = post.body.raw;
        // 剔除一些 Markdown 语法干扰（如链接、图片链接等）
        const pureText = content.replace(/\[.*?\]\(.*?\)/g, '').replace(/!\[.*?\]\(.*?\)/g, '');
        
        // 1. 统计中文字符数 (Unicode 范围 \u4e00-\u9fa5)
        const chineseChars = pureText.match(/[\u4e00-\u9fa5]/g)?.length || 0;
        
        // 2. 统计英文单词数 (先剔除中文，再按空格分割)
        const englishWords = pureText
          .replace(/[\u4e00-\u9fa5]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 0).length;
        
        // 3. 统计图片数量
        const imageCount = content.match(/!\[.*?\]\(.*?\)/g)?.length || 0;
        
        // 计算预估时间 (假设：中文 300 字/分钟，英文 200 词/分钟，图片一张加 0.2 分钟)
        const minutes = (chineseChars / 300) + (englishWords / 200) + (imageCount * 0.2);
        
        return Math.ceil(minutes) || 1; // 最小显示为 1 分钟
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
