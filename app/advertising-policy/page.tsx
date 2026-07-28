import type { Metadata } from 'next'

export const metadata: Metadata = { title: '프로모션 운영 정책', description: '스쿨러브아이 오늘의 Instagram 무료 편집 추천과 유료 프로모션 운영 기준입니다.' }

export default function AdvertisingPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-bold">프로모션 운영 정책</h1>
      <p className="mt-3 text-sm text-gray-500">시행일: 2026년 7월 28일</p>
      <div className="mt-9 space-y-8 text-sm leading-7 text-gray-700">
        <section><h2 className="text-lg font-bold text-gray-950">무료 추천과 유료 광고의 구분</h2><p className="mt-2">‘오늘의 발견’은 경제적 대가 없이 운영자가 선정하는 편집 추천입니다. 유료 노출은 모든 카드에 ‘스폰서드’ 또는 ‘유료 프로모션’으로 표시되며, 추천이나 학교의 공식 인증을 의미하지 않습니다.</p></section>
        <section><h2 className="text-lg font-bold text-gray-950">신청 자격과 계정 확인</h2><p className="mt-2">만 19세 이상 로그인 사용자가 본인 소유 Instagram 계정이나 검증 가능한 사업자 계정만 신청할 수 있습니다. 임시 프로필 코드로 소유를 수동 확인하며 비밀번호, 세션 쿠키, 로그인 토큰은 받지 않습니다.</p></section>
        <section><h2 className="text-lg font-bold text-gray-950">금지 콘텐츠</h2><p className="mt-2">미성년자·재학생 개인 계정 광고, 특정 사람 찾기, 사칭, 개인 연락처·위치·신상 공개, 학교 공식 추천으로 오인시키는 표현, 불법·도박·성인·사기·고수익 보장 콘텐츠와 타인의 저작권·초상권을 침해하는 콘텐츠는 허용하지 않습니다.</p></section>
        <section><h2 className="text-lg font-bold text-gray-950">검수, 결제, 취소</h2><p className="mt-2">자동 승인은 없습니다. 운영자가 계정 소유, 문구, 이미지 권리와 배치 적합성을 검수하고 가격을 안내합니다. 이번 MVP는 자동 카드 결제를 제공하지 않으며 운영자의 수동 입금 확인 전에는 예약하거나 노출하지 않습니다. 시작 전 취소와 시작 후 중단·환불은 실제 집행 범위와 운영자 확인에 따라 처리합니다.</p></section>
        <section><h2 className="text-lg font-bold text-gray-950">측정과 개인정보</h2><p className="mt-2">광고주에게는 노출·고유 노출 근사·클릭·CTR의 집계만 제공합니다. 방문자의 이름, 계정 ID, 이메일, 학교 이력, 검색·연결·메시지 이력, 원시 IP 또는 개인별 방문 목록은 제공하지 않습니다. 중복 방지용 일자별 해시는 32일 뒤 삭제됩니다.</p></section>
        <section><h2 className="text-lg font-bold text-gray-950">신고와 긴급 중단</h2><p className="mt-2">사칭, 개인정보, 불법, 미성년자 위험 신고가 접수되면 해당 광고를 즉시 일시 중단하고 운영자가 검토합니다. 일반 신고도 감사 기록과 함께 검수 대기열에서 처리합니다.</p></section>
        <p className="border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">이 문서는 현재 Production 구현과 운영 경계를 설명하며 전문 법률 자문을 대체하지 않습니다. 운영 정책이나 관련 법령이 변경되면 내용을 갱신합니다.</p>
      </div>
    </main>
  )
}
