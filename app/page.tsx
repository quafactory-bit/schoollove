import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SearchBar from '@/components/SearchBar'
import SchoolCard from '@/components/SchoolCard'

const POPULAR_KEYWORDS = [
  'daechigodeunghaggyo',
  'seoulhagyo',
  'hanyangdaehakgyo',
  'busandaehakgyo',
  'seochogodeunghaggyo',
]

const POPULAR_LABELS = [
  '대치고등학교',
  '서울대학교',
  '한양대학교',
  '부산대학교',
  '서초고등학교',
]

export default async function Home() {
  const { data: recentSchools } = await supabase
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8)

  const { data: stats } = await supabase
    .from('schools')
    .select('school_type')

  const counts = {
    elementary: stats?.filter(s => s.school_type === 'elementary').length || 0,
    middle: stats?.filter(s => s.school_type === 'middle').length || 0,
    high: stats?.filter(s => s.school_type === 'high').length || 0,
    university: stats?.filter(s => s.school_type === 'university').length || 0,
    college: stats?.filter(s => s.school_type === 'college').length || 0,
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">
            우리 학교, 우리 사람들<br />
            <span className="text-blue-600">아이러브스쿨</span>에서 찾아보세요
          </h1>
          <p className="text-gray-500 text-sm">전국 초·중·고·대학교 동창들의 인스타그램을 연결해보세요</p>
        </div>

        <SearchBar />

        <div className="flex flex-wrap gap-2 justify-center mt-4 mb-10">
          {POPULAR_LABELS.map((label, i) => (
            <Link key={i} href={`/school/${POPULAR_KEYWORDS[i]}`}
              className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm hover:border-blue-400">
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">최근 등록 학교</h2>
          <Link href="/search" className="text-sm text-blue-500">전체보기</Link>
        </div>

        <div className="space-y-2 mb-10">
          {recentSchools?.map(school => (
            <SchoolCard key={school.id} school={school} />
          ))}
        </div>

        <div className="bg-blue-50 rounded-2xl p-6 text-center mb-8">
          <h3 className="font-bold mb-1">내 인스타를 등록해 보세요</h3>
          <p className="text-sm text-gray-500 mb-4">학교 친구들이 나를 찾을 수 있어요</p>
          <Link href="/submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium">
            지금 등록하기
          </Link>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { label: '초등학교', count: counts.elementary },
            { label: '중학교', count: counts.middle },
            { label: '고등학교', count: counts.high },
            { label: '대학교', count: counts.university },
            { label: '전문대학', count: counts.college },
          ].map(item => (
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