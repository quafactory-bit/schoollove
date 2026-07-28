import type { Metadata } from 'next'
import AdminPromotionOperationsClient from './AdminPromotionOperationsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '프로모션 반복 운영', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default function AdminPromotionOperationsPage() {
  return <AdminPromotionOperationsClient />
}
