import type { Metadata } from 'next'
import AdminSafetyClient from './AdminSafetyClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '연결 안전센터', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default function AdminSafetyPage() {
  return <AdminSafetyClient />
}
