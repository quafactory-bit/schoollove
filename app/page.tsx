import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SearchBar from '@/components/SearchBar'
import SchoolCard from '@/components/SchoolCard'

const POPULAR_SLUGS = [
  'seoul-gangnam-jungdonggodeunghaggyo',
  'seoul-gwanak-seoulhakgyo',
  'seoul-seongdong-hanyangdaehakgyo',
  'busan-geumjeong-busandaehakgyo',
  'seoul-seocho-seochogodeunghaggyo',
]

export default async function Home() {
  const { data: recentSchools } = await supabase
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8)

  const { data: popularSchools } = await supabase
    .from('schools')
    .select('*')
    .in('slug', POPULAR_SLUGS)
    .limit(5)

  const [elem, midd, high_, univ, coll] = await Promise.all([
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('school_type', 'elementary'),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('school_type', 'middle'),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('school_type', 'high'),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('school_type', 'university'),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('school_type', 'college'),
  ])
  const counts = {
    elementary: elem.count || 0,
    middle: midd.count || 0,
    high: high_.count || 0,
    university: univ.count || 0,
    college: coll.count || 0,
  }

  const statItems = [
    { label: '\ucd08\ub4f1\ud559\uad50', count: counts.elementary },
    { label: '\uc911\ud559\uad50', count: counts.middle },
    { label: '\uace0\ub4f1\ud559\uad50', count: counts.high },
    { label: '\ub300\ud559\uad50', count: counts.university },
    { label: '\uc804\ubb38\ub300\ud559', count: counts.college },
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">
            {'\uc6b0\ub9ac \ud559\uad50, \uc6b0\ub9ac \uc0ac\ub78c\ub4e4'}<br />
            <span className="text-blue-600">{'스쿨러브아이'}</span>{'\uc5d0\uc11c \ucc3e\uc544\ubcf4\uc138\uc694'}
          </h1>
          <p className="text-gray-500 text-sm">{'\uc804\uad6d \ucd08/\uc911/\uace0/\ub300\ud559\uad50 \ub3d9\ucc3d\ub4e4\uc758 \uc778\uc2a4\ud0c0\uadf8\ub7a8\uc744 \uc5f0\uacb0\ud574\ubcf4\uc138\uc694'}</p>
        </div>

        <SearchBar />

        <div className="flex flex-wrap gap-2 justify-center mt-4 mb-10">
          {popularSchools?.map(school => (
            <Link key={school.id} href={`/school/${school.slug}`}
              className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm hover:border-blue-400">
              {school.school_name}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">{'\ucd5c\uadfc \ub4f1\ub85d \ud559\uad50'}</h2>
          <Link href="/search" className="text-sm text-blue-500">{'\uc804\uccb4\ubcf4\uae30'}</Link>
        </div>

        <div className="space-y-2 mb-10">
          {recentSchools?.map(school => (
            <SchoolCard key={school.id} school={school} />
          ))}
        </div>

        <div className="bg-blue-50 rounded-2xl p-6 text-center mb-8">
          <h3 className="font-bold mb-1">{'\ub0b4 \uc778\uc2a4\ud0c0\ub97c \ub4f1\ub85d\ud574 \ubcf4\uc138\uc694'}</h3>
          <p className="text-sm text-gray-500 mb-4">{'\ud559\uad50 \uce5c\uad6c\ub4e4\uc774 \ub098\ub97c \ucc3e\uc744 \uc218 \uc788\uc5b4\uc694'}</p>
          <Link href="/submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {'\uc9c0\uae08 \ub4f1\ub85d\ud558\uae30'}
          </Link>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center">
          {statItems.map(item => (
            <div key={item.label} className="bg-white rounded-xl p-3 border border-gray-100">
              <div className="text-blue-600 font-bold text-lg">{item.count.toLocaleString()}</div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}