import type { MetadataRoute } from 'next'

// v2-08: 홈 화면 아이콘(초록 + 흰 체크, 새 이름 파일). 이름·짧은 이름은 10번 이름 결정 때 바꾼다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '스쿨러브아이',
    short_name: '출석부',
    description: '학교와 졸업연도로 같은 기수 출석부를 보고, 서로 수락하면 인스타그램 주소를 교환해요.',
    start_url: '/account',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0f7b5f',
    lang: 'ko',
    categories: ['social'],
    icons: [
      { src: '/icons/icon-v2-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-v2-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-v2-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
