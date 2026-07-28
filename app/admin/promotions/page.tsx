import type { Metadata } from 'next'
import AdminPromotionsClient from './AdminPromotionsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '프로모션 운영', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default function AdminPromotionsPage() {
  return <AdminPromotionsClient />
}
