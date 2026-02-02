import path from 'path'
import fs from 'fs/promises'
import { NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/admin-auth'

const sanitizeSlug = (value: string) => {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\\s+/g, '-')
    .replace(/[^a-z0-9\\u4e00-\\u9fa5-]/g, '')
    .replace(/-+/g, '-')
  return cleaned || `post-${Date.now()}`
}

const ensureUniqueSlug = async (dir: string, slug: string) => {
  let candidate = slug
  let counter = 1
  while (true) {
    try {
      await fs.access(path.join(dir, `${candidate}.mdx`))
      candidate = `${slug}-${counter}`
      counter += 1
    } catch {
      return candidate
    }
  }
}

export async function POST(request: Request) {
  const token = request.cookies.get('admin_session')?.value
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ ok: false, message: '未授权' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const content = String(body.content || '').trim()
  const icon = body.icon === 'cat' ? 'cat' : 'robot'
  const author = String(body.author || '芝士AI吃鱼').trim()
  const date = String(body.date || new Date().toISOString().slice(0, 10))
  const tags = Array.isArray(body.tags)
    ? body.tags.filter(Boolean)
    : String(body.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
  const rawSlug = String(body.slug || title)

  if (!title || !description || !content) {
    return NextResponse.json({ ok: false, message: '标题、描述、正文不能为空' }, { status: 400 })
  }

  const postsDir = path.join(process.cwd(), 'content', 'posts')
  await fs.mkdir(postsDir, { recursive: true })

  const safeSlug = sanitizeSlug(rawSlug)
  const finalSlug = await ensureUniqueSlug(postsDir, safeSlug)
  const filePath = path.join(postsDir, `${finalSlug}.mdx`)

  const frontmatter = [
    '---',
    `title: ${title}`,
    `description: ${description}`,
    `date: ${date}`,
    `author: ${author}`,
    'tags:',
    ...tags.map((tag: string) => `  - ${tag}`),
    `icon: ${icon}`,
    'published: true',
    '---',
    '',
  ].join('\n')

  const mdx = `${frontmatter}\n${content}\n`
  await fs.writeFile(filePath, mdx, 'utf8')

  return NextResponse.json({ ok: true, slug: finalSlug })
}
