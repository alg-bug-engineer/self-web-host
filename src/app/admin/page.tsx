import { cookies } from 'next/headers'
import { verifyAdminSession } from '@/lib/admin-auth'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const token = cookies().get('admin_session')?.value
  const isAuthed = verifyAdminSession(token)

  return <AdminClient isAuthed={isAuthed} />
}
