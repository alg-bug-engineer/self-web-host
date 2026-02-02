import { NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/admin-auth'
import { toolsDataPath, readJsonFile, writeJsonFile } from '@/lib/admin-storage'

type ToolItem = {
  id: string
  name: string
  description: string
  url: string
  tags: string[]
  status?: string
}

export async function POST(request: Request) {
  const token = request.cookies.get('admin_session')?.value
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ ok: false, message: '未授权' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const description = String(body.description || '').trim()
  const url = String(body.url || '').trim()
  const status = String(body.status || '').trim()
  const tags = Array.isArray(body.tags)
    ? body.tags.filter(Boolean)
    : String(body.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

  if (!name || !description || !url) {
    return NextResponse.json({ ok: false, message: '名称、描述、链接不能为空' }, { status: 400 })
  }

  const newItem: ToolItem = {
    id: `tool-${Date.now()}`,
    name,
    description,
    url,
    tags,
    status: status || 'Active',
  }

  const list = await readJsonFile<ToolItem[]>(toolsDataPath, [])
  const nextList = [newItem, ...list]
  await writeJsonFile(toolsDataPath, nextList)

  return NextResponse.json({ ok: true, item: newItem })
}
