import Link from 'next/link'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getOwnSchoolGrowth } from '@/lib/ownerSchoolGrowth'
import GrowthMeter from './GrowthMeter'
import GrowthShareButton from './GrowthShareButton'
import SchoolWorld from '@/components/game/SchoolWorld'
import type { ReactNode } from 'react'

export default async function MyGrowthSchools({ compact = false, fallback = null }: { compact?: boolean; fallback?: ReactNode } = {}) {
  try {
    const auth = await getAuthenticatedServerContext()
    if (!auth) return fallback
    const { data, error } = await auth.client.from('profile_school_memberships').select('school_id').eq('owner_user_id', auth.user.id)
    if (error || !data?.length) return fallback
    const ids = [...new Set(data.map(row => row.school_id as string))]
    const results = await Promise.all(ids.map(id => getOwnSchoolGrowth(auth.client, id)))
    const schools = results.filter(result => result !== null)
    if (!schools.length) return fallback
    return <section className={compact ? 'sl-owner-home' : 'py-10'} aria-labelledby="my-growth"><h2 id="my-growth" className="mb-4 text-xl font-bold">내가 함께 키우는 학교</h2><div className={compact ? 'grid gap-4' : 'grid gap-5 md:grid-cols-2'}>{schools.map(school => <article key={school.schoolId} className="sl-owner-card min-w-0"><Link href={`/school/${encodeURIComponent(school.slug)}`} className="schoollove-focus break-words text-xl font-bold">{school.schoolName}</Link><SchoolWorld level={school.level} mode="dashboard" /><GrowthMeter growth={school} projection="owner" /><div className="mt-5"><GrowthShareButton schoolId={school.schoolId} schoolName={school.schoolName} slug={school.slug} /></div></article>)}</div></section>
  } catch { return fallback }
}
