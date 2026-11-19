import { ImageResponse } from 'next/og'
import { getPublicSummons } from '@/lib/part2Public'
import { shortSchoolName } from '@/lib/push/contracts'

// Part 2 P3: 지명 소환장 공유 카드(칠판 디자인). 학교·졸업연도·찾는 이름만. 만든 사람·인스타·연락처 없음.
export const alt = '출석부 알림'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function SummonsShareImage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const summons = await getPublicSummons(code)
  if (!summons) return new Response(null, { status: 404 })
  const line1 = `${shortSchoolName(summons.school_name)} ${summons.graduation_year}년 졸업생 누군가가`
  const line2 = `'${summons.target_name}'님을 찾고 있습니다`
  return new ImageResponse(<div style={{ display: 'flex', width: '100%', height: '100%', background: '#8b5e34', padding: 28 }}>
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: '#14532d', color: '#fcfaf5', padding: 56, borderRadius: 18 }}>
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: '#fbbf24' }}>[출석부 알림]</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 800 }}>{line1}</div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, marginTop: 16 }}>{line2}</div>
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: '#d1fae5' }}>schoollove.kr · 만 19세 이상 · 무광고</div>
    </div>
  </div>, size)
}
