import { cookies } from 'next/headers'
import { verifyAdminSession } from '@/lib/admin-auth'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const token = (await cookies()).get('admin_session')?.value
  const isAuthed = verifyAdminSession(token)

  return <AdminClient isAuthed={isAuthed} />
}
