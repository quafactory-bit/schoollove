// lib/images.ts
// 모든 일러스트 경로를 한 곳에서 관리. 컴포넌트는 이 상수만 참조한다.
// (UI 의존성 없는 순수 상수 -> 앱 전환 시 그대로 재사용)
export const IMG = {
  // 히어로
  heroMain: "/images/hero-main.webp", // 메인 홈 상단 (카페 3인방)
  heroSchool: "/images/hero-school.webp", // 학교 페이지 상단 (교복 3인방)
  // 배너
  bannerHowto: "/images/banner-howto.webp", // 사용법 3단계 (검색·등록·연결)
  bannerEmpathy: "/images/banner-empathy.webp", // 공감 3컷 (??·누구지·재회)
  bannerBottom: "/images/banner-bottom.webp", // 메인 하단 감성 배너
  bannerSubmit: "/images/banner-submit.webp", // 등록 페이지 상단 (폰+생각풍선)
  bannerYear: "/images/banner-year.webp", // 졸업년도 페이지 (학사모)
  // 상태/장식
  completeSchool: "/images/complete-school.webp", // 등록 완료 (학교 건물)
  completeGraduation: "/images/complete-graduation.jpg", // 등록 완료 (졸업식 실사)
  reunion: "/images/reunion.webp", // 재회 (오랜만이야)
  cardInsta: "/images/card-insta.webp", // "내 인스타 등록" 유도 카드
  cardName: "/images/card-name.webp", // "떠오르는 이름 남기기" 유도 카드
} as const;

// 학교 타입별 실사 배너 (school_type -> 이미지)
export const SCHOOL_TYPE_IMG = {
  elementary: "/images/school-elementary.jpg",
  middle: "/images/school-middle.jpg",
  high: "/images/school-high.jpg",
  university: "/images/school-university.jpg",
  college: "/images/school-college.jpg",
} as const;

// 학교 타입에 맞는 배너 이미지 반환 (없으면 고등학교 기본값)
export function schoolTypeImage(type?: string | null): string {
  if (type && type in SCHOOL_TYPE_IMG) {
    return SCHOOL_TYPE_IMG[type as keyof typeof SCHOOL_TYPE_IMG];
  }
  return SCHOOL_TYPE_IMG.high;
}

// 프로필 기본 아바타 (인스타/이미지 없을 때 placeholder)
export const AVATARS = {
  girl: [
    "/images/avatars/avatar-girl-1.webp",
    "/images/avatars/avatar-girl-2.webp",
    "/images/avatars/avatar-girl-3.webp",
    "/images/avatars/avatar-girl-4.webp",
  ],
  boy: [
    "/images/avatars/avatar-boy-1.webp",
    "/images/avatars/avatar-boy-2.webp",
    "/images/avatars/avatar-boy-3.webp",
    "/images/avatars/avatar-boy-4.webp",
  ],
} as const;
const ALL_AVATARS = [...AVATARS.girl, ...AVATARS.boy];
// 이름(또는 id) 기반으로 항상 같은 아바타를 고정 배정 (랜덤 X -> SSR/CSR 일치)
export function pickAvatar(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ALL_AVATARS[Math.abs(h) % ALL_AVATARS.length];
}
