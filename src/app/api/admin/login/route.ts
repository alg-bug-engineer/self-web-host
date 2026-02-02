import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, createAdminSession, verifyAdminCredentials } from '@/lib/admin-auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const username = String(body.username || '')
  const password = String(body.password || '')

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, message: '未配置管理员账号' }, { status: 500 })
  }

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.json({ ok: false, message: '账号或密码错误' }, { status: 401 })
  }

  const session = createAdminSession(username)
  if (!session) {
    return NextResponse.json({ ok: false, message: '未配置后台密钥' }, { status: 500 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: session,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return response
}
