import type { Metadata } from 'next'
import AdminPaymentsClient from './AdminPaymentsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '결제 운영', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default function AdminPaymentsPage() { return <AdminPaymentsClient /> }
