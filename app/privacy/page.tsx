import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '스쿨러브아이 개인정보 안전 전환과 처리 원칙을 안내합니다.',
}

const CONTACT = 'schoollove.contact@gmail.com'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-black text-gray-950">개인정보처리방침</h1>
      <p className="mt-3 text-sm text-gray-500">시행일: 2026년 7월 28일</p>

      <div className="mt-10 space-y-9 text-sm leading-7 text-gray-700">
        <section>
          <h2 className="text-lg font-bold text-gray-950">1. 현재 개인정보 안전 전환 상태</h2>
          <p className="mt-2">
            스쿨러브아이는 개인의 이름·졸업연도·학년·반·Instagram 정보가 결합된 공개 명단과 사람 검색을 중단했습니다.
            공개 개인 등록은 중단했으며, 공개 화면에서는 학교명·지역·학교 유형 등 학교 기본 정보만 제공합니다.
            승인된 만 19세 이상 제한 베타에서는 본인 소유 비공개 정보만 처리합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">2. 기존 정보의 처리</h2>
          <p className="mt-2">
            기존에 접수된 개인 정보는 공개 화면에서 제공하지 않으며, 안전 전환·삭제 요청 처리·분쟁 대응·보안 운영에 필요한 범위에서만 제한적으로 보관하고 관리자 권한으로 처리합니다.
            이 전환은 기존 데이터를 자동 삭제하는 작업이 아니며, 보유 필요성이 사라지거나 적법한 삭제 요청이 확인되면 필요한 절차에 따라 처리합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">3. 제한 베타 등록 조건</h2>
          <p className="mt-2">
            제한 베타 등록은 만 19세 이상 이용자, 본인 정보, 인증된 소유권, 상대방 승인 전 비공개를 기본으로 합니다.
            타인의 이름이나 계정을 대신 등록하는 방식은 허용하지 않습니다.
          </p>
          <p className="mt-2">
            성인 확인에 입력한 생년월일은 KST 기준 만 나이 판정에만 사용하고 원본을 저장하지 않습니다.
            현재 자기진술 방식은 휴대전화·신분증 기반의 강한 본인확인이 아니며, 이메일 인증·성인 확인·정책 버전별 필수 동의 결과만 최소한으로 기록합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">4. 자동 수집 및 이용 목적</h2>
          <p className="mt-2">
            서비스 보안, 장애 대응, 부정 이용 방지 및 통계 분석을 위해 접속·요청 관련 기술 정보가 처리될 수 있습니다.
            Web Analytics는 페이지 방문을 집계하며 개인 이름, Instagram ID, 메시지, 검색어 원문을 커스텀 분석 이벤트로 전송하지 않습니다.
            제한 베타 온보딩은 개인 원문 없이 단계와 direct·organic social·creator·community·referral·paid social·unknown의 거친 출처만 집계합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">5. 처리 위탁과 국외 처리 가능성</h2>
          <p className="mt-2">
            서비스 운영을 위해 Supabase(데이터베이스), Vercel(호스팅·분석), Upstash(요청 제한·캐시) 등 외부 서비스가 사용될 수 있으며, 제공 사업자의 인프라 위치에 따라 국외에서 처리될 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">6. 열람·삭제·처리정지 및 신고</h2>
          <p className="mt-2">
            본인 정보의 열람, 삭제, 정정, 처리정지 또는 개인정보 침해 신고는 {CONTACT}으로 요청할 수 있습니다.
            요청자의 권리와 타인의 개인정보를 보호하기 위해 본인 확인과 대상 정보 확인을 요청할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">7. 문의</h2>
          <p className="mt-2">개인정보 관련 문의 및 긴급 삭제 요청: {CONTACT}</p>
        </section>

        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
          이 문서는 현재 서비스 동작을 설명하기 위한 운영 고지이며, 관계 법령에 따른 최종 법률 검토를 대체하지 않습니다.
        </p>
      </div>
    </main>
  )
}
