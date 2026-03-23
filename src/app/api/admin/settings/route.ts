import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/admin-auth'
import { settingsDataPath, readJsonFile, writeJsonFile } from '@/lib/admin-storage'

export type SystemSettings = {
  planetQrCode?: string
  planetUrl?: string
  siteSlogan?: string
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ ok: false, message: '未授权' }, { status: 401 })
  }

  const settings = await readJsonFile<SystemSettings>(settingsDataPath, {})
  return NextResponse.json({ ok: true, settings })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ ok: false, message: '未授权' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const currentSettings = await readJsonFile<SystemSettings>(settingsDataPath, {})
  
  const nextSettings: SystemSettings = {
    ...currentSettings,
    ...body
  }

  await writeJsonFile(settingsDataPath, nextSettings)
  return NextResponse.json({ ok: true, settings: nextSettings })
}
