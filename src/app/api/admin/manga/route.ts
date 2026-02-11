import path from 'path'
import fs from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/admin-auth'
import { mangaDataPath, readJsonFile, writeJsonFile } from '@/lib/admin-storage'

type MangaItem = {
  id: string
  title: string
  description: string
  image: string
  date: string
  mood: string
}

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

const slugify = (value: string) => {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
  return cleaned || `manga-${Date.now()}`
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ ok: false, message: '未授权' }, { status: 401 })
  }

  const formData = await request.formData()
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const date = String(formData.get('date') || new Date().toISOString().slice(0, 10))
  const mood = String(formData.get('mood') || '').trim() || '记录'
  const file = formData.get('image') as File | null

  if (!title || !description || !file) {
    return NextResponse.json({ ok: false, message: '标题、描述、图片不能为空' }, { status: 400 })
  }

  const extension = path.extname(file.name).toLowerCase() || '.png'
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(extension)) {
    return NextResponse.json(
      { ok: false, message: `不支持的图片格式，仅支持：${ALLOWED_IMAGE_EXTENSIONS.join('、').replace(/\./g, '')}` },
      { status: 400 }
    )
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'manga')
  await fs.mkdir(uploadsDir, { recursive: true })

  const arrayBuffer = await file.arrayBuffer()
  const filename = `${slugify(title)}-${Date.now()}${extension}`
  const filePath = path.join(uploadsDir, filename)
  await fs.writeFile(filePath, Buffer.from(arrayBuffer))

  const newItem: MangaItem = {
    id: `manga-${Date.now()}`,
    title,
    description,
    image: `/uploads/manga/${filename}`,
    date,
    mood,
  }

  const list = await readJsonFile<MangaItem[]>(mangaDataPath, [])
  const nextList = [newItem, ...list]
  await writeJsonFile(mangaDataPath, nextList)

  return NextResponse.json({ ok: true, item: newItem })
}
