import Link from 'next/link'
import { getPopularSchools } from '@/lib/api/schools'
import { getRecentProfiles } from '@/lib/api/profiles'
import SearchBar from '@/components/SearchBar'
import SchoolCard from '@/components/SchoolCard'
import ProfileCard from '@/components/ProfileCard'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import type { SchoolType } from '@/types/school'

export const revalidate = 300 // 5ë¶„ë§ˆ??ê°±ì‹ 

// ?¸ê¸° ê²€?‰ì–´ (?•ì )
const POPULAR_KEYWORDS = [
  '?€ì¹˜ê³ ?±í•™êµ?,
  '?œìš¸?€?™êµ',
  '?œì–‘?€?™êµ',
  'ë¶€?°ë??™êµ',
  '?œì´ˆê³ ë“±?™êµ',
]

export default async function HomePage() {
  const [popularSchools, recentProfiles] = await Promise.all([
    getPopularSchools(8),
    getRecentProfiles(10),
  ])

  return (
    <div className="page-container space-y-8">
      {/* ?ˆì–´ë¡??¹ì…˜ */}
      <section className="pt-6 pb-2 text-center space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">
            ?°ë¦¬ ?™êµ, ?°ë¦¬ ?¬ëŒ??          </h1>
          <p className="text-2xl sm:text-3xl font-black leading-tight">
            <span className="text-brand-blue">?„ì´?¬ë¸Œ?¤ì¿¨</span>?ì„œ ì°¾ì•„ë³´ì„¸??          </p>
        </div>
        <p className="text-sm text-gray-500">
          ?„êµ­ ì´ˆÂ·ì¤‘Â·ê³ Â·ë??™êµ ?™ì°½?¤ì˜ ?¸ìŠ¤?€ê·¸ë¨???°ê²°?´ë³´?¸ìš”
        </p>

        {/* ê²€?‰ì°½ */}
        <div className="max-w-md mx-auto pt-2">
          <SearchBar
            size="lg"
            placeholder="?™êµ ?´ë¦„??ê²€?‰í•˜?¸ìš” (?? ?€ì¹˜ê³ ?±í•™êµ?"
          />
        </div>

        {/* ?¸ê¸° ê²€?‰ì–´ */}
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

      {/* ?¸ê¸° ?™êµ */}
      {popularSchools.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">ìµœê·¼ ?±ë¡ ?™êµ</h2>
            <Link href="/search" className="text-xs text-brand-blue hover:underline">
              ?„ì²´ë³´ê¸°
            </Link>
          </div>

          {/* ?™êµ ?€?…ë³„ ??*/}
          <SchoolGrid schools={popularSchools} />
        </section>
      )}

      {/* ìµœê·¼ ?±ë¡ */}
      {recentProfiles.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">ìµœê·¼ ?±ë¡</h2>
          <div className="card overflow-hidden divide-y divide-gray-100">
            {recentProfiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} />
            ))}
          </div>
        </section>
      )}

      {/* ?±ë¡ CTA */}
      <section className="card p-6 text-center space-y-3 bg-gradient-to-br from-brand-blue-light to-white border-brand-blue/20">
        <p className="font-semibold text-gray-900">???¸ìŠ¤?€ë¥??±ë¡??ë³´ì„¸??/p>
        <p className="text-sm text-gray-500">
          ?™êµ ì¹œêµ¬?¤ì´ ?˜ë? ì°¾ì„ ???ˆì–´??        </p>
        <Link href="/submit" className="btn-primary inline-block text-sm">
          ì§€ê¸??±ë¡?˜ê¸°
        </Link>
      </section>

      {/* ?™êµ ??ë°°ë„ˆ */}
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
