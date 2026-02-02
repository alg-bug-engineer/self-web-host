import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { verifyAdminSession } from '@/lib/admin-auth'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ ok: false, message: '未授权' }, { status: 401 })
  }

  // 开发模式下跳过构建命令，因为 contentlayer 会自动检测文件变化
  // 运行 npm run build 会与 dev server 冲突导致 webpack 缓存损坏
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.json({
      ok: true,
      message: '开发模式：内容已保存，页面会自动刷新。生产环境部署时会执行完整构建。',
    })
  }

  const command = process.env.ADMIN_PUBLISH_COMMAND
  if (!command) {
    return NextResponse.json({ ok: false, message: '未配置发布命令' }, { status: 400 })
  }

  try {
    const cwd = process.env.ADMIN_PUBLISH_CWD || process.cwd()
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 1000 * 60 * 10,
      env: process.env,
      shell: '/bin/bash',
    })
    return NextResponse.json({
      ok: true,
      stdout: stdout?.toString().slice(0, 2000) || '',
      stderr: stderr?.toString().slice(0, 2000) || '',
    })
  } catch (error: any) {
    const messageParts = [error?.message, error?.stderr?.toString(), error?.stdout?.toString()]
      .filter(Boolean)
      .join(' | ')
    return NextResponse.json(
      { ok: false, message: messageParts.slice(0, 2000) || '发布失败' },
      { status: 500 }
    )
  }
}
