import { ImageResponse } from 'next/og'

// 사이트 기본 링크 미리보기 이미지. 학교 공유 이미지(app/school/[slug]/opengraph-image.tsx)와 같은 스타일:
// 흰 바탕·진초록 체크 브랜드마크·"출석부". 개인 정보·숫자는 넣지 않는다.
export const alt = '출석부 - 그때 그 친구, 지금 뭐 하는지 궁금하지 않아요?'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function SiteShareImage() {
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: '#ffffff', color: '#0a0a0a', padding: 64 }}>
    <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 15, background: '#0f7b5f', marginRight: 18 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      출석부
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 64, fontWeight: 800, lineHeight: 1.3 }}>
        <div style={{ display: 'flex' }}>그때 그 친구,</div>
        <div style={{ display: 'flex' }}>지금 뭐 하는지 궁금하지 않아요?</div>
      </div>
      <div style={{ display: 'flex', fontSize: 40, color: '#0f7b5f', marginTop: 20, fontWeight: 700 }}>학교와 졸업연도로 같은 기수 출석부</div>
    </div>
    <div style={{ display: 'flex', fontSize: 28, color: '#6b7280' }}>서로 수락하면 인스타그램 주소를 교환해요 · 만 19세 이상</div>
  </div>, size)
}
