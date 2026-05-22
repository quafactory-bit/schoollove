import Link from 'next/link'
import { getPopularSchools } from '@/lib/api/schools'
import { getRecentProfiles } from '@/lib/api/profiles'
import SearchBar from '@/components/SearchBar'
import SchoolCard from '@/components/SchoolCard'
import ProfileCard from '@/components/ProfileCard'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import type { SchoolType } from '@/types/school'

export const revalidate = 300 // 5분마??갱신

// ?�기 검?�어 (?�적)
const POPULAR_KEYWORDS = [
  '?�치고?�학�?,
  '?�울?�?�교',
  '?�양?�?�교',
  '부?��??�교',
  '?�초고등?�교',
]

export default async function HomePage() {
  const [popularSchools, recentProfiles] = await Promise.all([
    getPopularSchools(8),
    getRecentProfiles(10),
  ])

  return (
    <div className="page-container space-y-8">
      {/* ?�어�??�션 */}
      <section className="pt-6 pb-2 text-center space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">
            ?�리 ?�교, ?�리 ?�람??          </h1>
          <p className="text-2xl sm:text-3xl font-black leading-tight">
            <span className="text-brand-blue">?�이?�브?�쿨</span>?�서 찾아보세??          </p>
        </div>
        <p className="text-sm text-gray-500">
          ?�국 초·중·고·�??�교 ?�창?�의 ?�스?�그램???�결?�보?�요
        </p>

        {/* 검?�창 */}
        <div className="max-w-md mx-auto pt-2">
          <SearchBar
            size="lg"
            placeholder="?�교 ?�름??검?�하?�요 (?? ?�치고?�학�?"
          />
        </div>

        {/* ?�기 검?�어 */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {POPULAR_KEYWORDS.map((kw) => (
            <Link
              key={kw}
              href={`/search?q=${encodeURIComponent(kw)}`}
              className="px-3 py-1 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-full hover:border-brand-blue hover:text-brand-blue transition-colors"
            >
              {kw}
            </Link>
          ))}
        </div>
      </section>

      {/* ?�기 ?�교 */}
      {popularSchools.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">최근 ?�록 ?�교</h2>
            <Link href="/search" className="text-xs text-brand-blue hover:underline">
              ?�체보기
            </Link>
          </div>

          {/* ?�교 ?�?�별 ??*/}
          <SchoolGrid schools={popularSchools} />
        </section>
      )}

      {/* 최근 ?�록 */}
      {recentProfiles.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">최근 ?�록</h2>
          <div className="card overflow-hidden divide-y divide-gray-100">
            {recentProfiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} />
            ))}
          </div>
        </section>
      )}

      {/* ?�록 CTA */}
      <section className="card p-6 text-center space-y-3 bg-gradient-to-br from-brand-blue-light to-white border-brand-blue/20">
        <p className="font-semibold text-gray-900">???�스?��??�록??보세??/p>
        <p className="text-sm text-gray-500">
          ?�교 친구?�이 ?��? 찾을 ???�어??        </p>
        <Link href="/submit" className="btn-primary inline-block text-sm">
          지�??�록?�기
        </Link>
      </section>

      {/* ?�교 ??배너 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.entries(SCHOOL_TYPE_LABELS) as [SchoolType, string][]).map(([type, label]) => {
          const counts: Record<SchoolType, number> = {
            elementary: 5014,
            middle: 2628,
            high: 1921,
            university: 262,
            college: 180,
          }
          return (
            <Link
              key={type}
              href={`/search?type=${type}`}
              className="card p-3 text-center hover:border-brand-blue transition-colors group"
            >
              <p className="text-lg font-bold text-brand-blue group-hover:scale-110 transition-transform inline-block">
                {counts[type].toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SchoolGrid({ schools }: { schools: Awaited<ReturnType<typeof getPopularSchools>> }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {schools.map((school) => (
        <SchoolCard key={school.id} school={school} />
      ))}
    </div>
  )
}
