import Link from 'next/link'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getSchoolGrowth } from '@/lib/schoolGrowthGame'
import GrowthMeter from './GrowthMeter'
import GrowthShareButton from './GrowthShareButton'

export default async function MyGrowthSchools() {
  try {
    const auth = await getAuthenticatedServerContext()
    if (!auth) return null
    const { data, error } = await auth.client.from('profile_school_memberships').select('school_id').eq('owner_user_id', auth.user.id)
    if (error || !data?.length) return null
    const ids = [...new Set(data.map(row => row.school_id as string))]
    const results = await Promise.all(ids.map(id => getSchoolGrowth(id)))
    const schools = results.flatMap(result => result.status === 'ok' ? result.schools : [])
    if (!schools.length) return null
    return <section className="border-t border-schoollove-border py-10" aria-labelledby="my-growth"><h2 id="my-growth" className="text-2xl font-bold">내가 함께 키우는 학교</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{schools.map(school => <article key={school.schoolId} className="min-w-0 border border-schoollove-border p-6"><Link href={`/school/${encodeURIComponent(school.slug)}`} className="schoollove-focus break-words text-xl font-bold">{school.schoolName}</Link><GrowthMeter growth={school} /><div className="mt-5"><GrowthShareButton schoolId={school.schoolId} schoolName={school.schoolName} slug={school.slug} level={school.level} /></div></article>)}</div></section>
  } catch { return null }
}
