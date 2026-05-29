import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SearchBar from '@/components/SearchBar'

const POPULAR_SLUGS = [
  'seoul-gangnam-jungdonggodeunghaggyo',
  'seoul-gwanak-seoulhakgyo',
  'seoul-seongdong-hanyangdaehakgyo',
  'busan-geumjeong-busandaehakgyo',
  'seoul-seocho-seochogodeunghaggyo',
]

export default async function Home() {
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
    { label: '초등학교', count: counts.elementary },
    { label: '중학교', count: counts.middle },
    { label: '고등학교', count: counts.high },
    { label: '대학교', count: counts.university },
    { label: '전문대학', count: counts.college },
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">
            다시 만나는 학교 사람들, <span className="text-blue-600">스쿨러브</span>
          </h1>
          <p className="text-gray-500 text-sm">전국 10,005개 학교 · 동창 인스타 주소록</p>
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

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-8 text-center mb-10">
          <div className="text-3xl mb-3">🌱</div>
          <h2 className="font-bold text-lg mb-2 text-gray-800">
            지금은 우리 학교 사람들 모으는 중!
          </h2>
          <p className="text-sm text-gray-600 mb-5 leading-relaxed">
            아직 시작 단계예요.<br />
            내 인스타를 먼저 등록하고<br />
            동창들이 찾아오길 기다려보세요.
          </p>
          <Link
            href="/submit"
            className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            내 인스타 등록하기
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
