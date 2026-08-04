import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이용약관',
  description: '스쿨러브아이 개인정보 안전 전환 기간의 이용 원칙을 안내합니다.',
}

const CONTACT = 'schoollove.contact@gmail.com'

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-black text-gray-950">이용약관</h1>
      <p className="mt-3 text-sm text-gray-500">시행일: 2026년 8월 3일</p>

      <div className="mt-10 space-y-9 text-sm leading-7 text-gray-700">
        <section>
          <h2 className="text-lg font-bold text-gray-950">1. 현재 제공 범위</h2>
          <p className="mt-2">
            공개 화면은 학교명·지역·학교 유형 등 학교 기본 정보 검색만 제공합니다.
            공개 개인 명단과 사람 이름 검색은 제공하지 않습니다. 별도로 공개 계정 launch가 승인된 경우 만 19세 이상 이용자는
            이메일 인증·필수 동의 뒤 기본 비공개 본인 프로필과 과거 학교 이력만 관리할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">2. 이용 자격과 향후 등록 원칙</h2>
          <p className="mt-2">
            개인 등록은 만 19세 이상 이용자가 본인 정보만 등록할 수 있습니다.
            본인 소유권과 항상 비공개를 기본 조건으로 하며 Instagram은 사람 검색이나 공개 화면에 표시하지 않습니다.
          </p>
          <p className="mt-2">
            초기 성인 확인은 KST 기준 만 나이를 계산하는 자기진술 방식이며 강한 법적 본인확인이 아닙니다.
            다른 사용자의 정보 등록, 기존 비공개 row의 임의 소유권 주장, 다른 사용자의 raw profile 조회는 허용하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">3. 금지 행위</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>타인의 이름, 계정 또는 개인정보를 대신 등록하거나 공개하는 행위</li>
            <li>미성년자의 정보를 수집·유도·공유하거나 개인을 식별하려는 행위</li>
            <li>괴롭힘, 사칭, 스토킹, 신상털기 또는 영리 목적의 무단 수집</li>
            <li>자동화 도구를 이용한 대량 조회, 등록 또는 서비스 방해</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">4. 기존 정보와 삭제 요청</h2>
          <p className="mt-2">
            기존 개인 정보는 공개 화면에서 제공하지 않습니다. 본인 정보의 삭제·정정·처리정지 또는 침해 신고는 {CONTACT}으로 요청할 수 있으며, 안전한 처리를 위해 본인 확인을 요청할 수 있습니다.
            계정 탈퇴 요청은 추가 변경을 즉시 차단합니다. 공개 계정 데이터 삭제와 Auth identity 실제 삭제는 서로 다른 시스템의 2단계 절차이며, Auth 삭제 실패 시 완료가 아닌 차단·재시도 대기 상태로 유지합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">5. 서비스 제한</h2>
          <p className="mt-2">
            개인정보 보호, 보안, 법적 의무 이행 또는 장애 대응을 위해 일부 기능을 즉시 중단하거나 접근을 제한할 수 있습니다.
            공개 계정 launch가 closed·internal_test·ready·emergency_stopped인 동안 신규 가입은 중단하며, controlled beta는 별도 운영자 승인 범위에서만 제공합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">6. 문의</h2>
          <p className="mt-2">서비스·개인정보·삭제 요청: {CONTACT}</p>
        </section>

        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
          이 약관은 현재 안전 전환 상태를 알리는 운영 고지이며, 최종 법률 검토를 대체하지 않습니다.
        </p>
      </div>
    </main>
  )
}
