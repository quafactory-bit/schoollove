import { ImageResponse } from 'next/og'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getSchoolYearCounts } from '@/lib/schoolYearCounts'

// v2-10: 공유 이미지를 v2 디자인(흰 바탕·진초록)과 새 이름 "출석부"로. 레벨·순위·XP는 넣지 않는다.
// 숫자는 공개 학교 페이지와 같은 졸업연도별 등록 수 합계만(이름·개인 정보 없음).
export const alt = '졸업연도별 출석부'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function SchoolShareImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return new Response(null, { status: 404 })
  const counts = await getSchoolYearCounts(school.id)
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: '#ffffff', color: '#0a0a0a', padding: 64 }}>
    <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 15, background: '#0f7b5f', marginRight: 18 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      출석부
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', fontSize: school.school_name.length > 20 ? 52 : 72, fontWeight: 800 }}>{school.school_name}</div>
      <div style={{ display: 'flex', fontSize: 40, color: '#0f7b5f', marginTop: 20, fontWeight: 700 }}>{counts.total > 0 ? `${counts.total}명이 등록했어요` : '졸업연도별 출석부'}</div>
    </div>
    <div style={{ display: 'flex', fontSize: 28, color: '#6b7280' }}>졸업연도를 고르면 같은 기수 출석부가 보여요 · 만 19세 이상</div>
  </div>, size)
}
