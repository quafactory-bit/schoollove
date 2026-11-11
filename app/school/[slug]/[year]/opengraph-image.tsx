import { ImageResponse } from 'next/og'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getSchoolYearCounts, parseGraduationYearParam } from '@/lib/schoolYearCounts'

// 졸업연도 페이지 공유 이미지. 학교 공유 이미지(../opengraph-image.tsx)와 같은 스타일.
// 숫자는 공개 연도 페이지와 같은 school_year_counts_v2 등록 수만 쓴다. 이름·개인 정보는 넣지 않는다.
export const alt = '졸업연도 출석부'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function YearShareImage({ params }: { params: Promise<{ slug: string; year: string }> }) {
  const { slug, year: yearParam } = await params
  const school = await getSchoolBySlug(slug)
  const year = parseGraduationYearParam(yearParam)
  if (!school || year === null) return new Response(null, { status: 404 })
  const counts = await getSchoolYearCounts(school.id)
  const count = counts.years.find((row) => row.graduationYear === year)?.count ?? 0
  const heading = `${school.school_name} ${year}년 졸업`
  const headingSize = heading.length <= 14 ? 72 : heading.length <= 18 ? 58 : 48
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: '#ffffff', color: '#0a0a0a', padding: 64 }}>
    <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 15, background: '#0f7b5f', marginRight: 18 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      출석부
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', fontSize: headingSize, fontWeight: 800 }}>{heading}</div>
      <div style={{ display: 'flex', fontSize: 40, color: '#0f7b5f', marginTop: 20, fontWeight: 700 }}>{count > 0 ? `${count}명이 출석부에 있어요` : '아직 아무도 없어요 · 첫 번째가 되어 주세요'}</div>
    </div>
    <div style={{ display: 'flex', fontSize: 28, color: '#6b7280' }}>이름은 같은 학교 회원에게만 보여요 · 만 19세 이상</div>
  </div>, size)
}
