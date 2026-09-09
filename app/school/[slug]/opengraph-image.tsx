import { ImageResponse } from 'next/og'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getSchoolGrowth } from '@/lib/schoolGrowthGame'

export const alt = '우리 학교, 함께 키우기'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function SchoolGrowthImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return new Response(null, { status: 404 })
  const result = await getSchoolGrowth(school.id)
  const growth = result.schools[0]
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: '#f5f7ff', color: '#111827', padding: 64 }}>
    <div style={{ display: 'flex', fontSize: 24, color: '#3448c5', letterSpacing: 5 }}>SCHOOLLOVE · OUR SCHOOL, NEXT LEVEL</div>
    <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', fontSize: school.school_name.length > 20 ? 42 : 60, fontWeight: 700 }}>{school.school_name}</div><div style={{ display: 'flex', fontSize: 96, color: '#3448c5', marginTop: 24 }}>{growth ? `Lv.${growth.level}` : 'OUR SCHOOL'}</div></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28 }}><span>우리 학교 같이 키워보자</span><span>{growth?.rank ? `이번 주 성장 ${growth.rank}위` : 'SCHOOLLOVE.KR'}</span></div>
  </div>, size)
}
