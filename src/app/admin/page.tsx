import { cookies } from 'next/headers'
import { verifyAdminSession } from '@/lib/admin-auth'
import { getAnalyticsOverview } from '@/lib/analytics-storage'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const token = (await cookies()).get('admin_session')?.value
  const isAuthed = verifyAdminSession(token)
  const analytics = isAuthed ? await getAnalyticsOverview(30) : null

  return <AdminClient isAuthed={isAuthed} analytics={analytics} />
}
