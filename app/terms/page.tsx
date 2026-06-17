export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold">이용약관</h1>
      <div className="space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-2 text-base font-bold">1. 서비스 소개</h2>
          <p>
            스쿨러브아이(이하 &lsquo;서비스&rsquo;)는 학교 기반 공개 인스타그램 검색 플랫폼입니다.
            누구나 로그인 없이 무료로 이용할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">2. 약관의 효력</h2>
          <p>
            이용자가 서비스를 이용하거나 정보를 등록하는 경우, 본 약관 및 개인정보처리방침에
            동의한 것으로 간주합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">3. 이용 규칙</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>공개된 인스타그램 계정 정보만 등록할 수 있습니다.</li>
            <li>비공개 계정, 민감 정보, 사칭 정보의 등록을 금지합니다.</li>
            <li>타인을 비방·괴롭히거나 명예를 훼손할 목적의 등록을 금지합니다.</li>
            <li>자동화된 수단을 통한 대량 등록·수집을 금지합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">4. 등록 정보의 공개</h2>
          <p>
            등록된 정보(이름/별명, 인스타그램 ID, 학교·학년·반 등)는 누구나 열람할 수 있도록
            공개되며, 구글·네이버 등 외부 검색엔진의 검색 결과에 표시될 수 있습니다. 이용자는
            등록 시 이러한 공개 및 노출에 동의합니다. 자세한 내용은 개인정보처리방침을 따릅니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">5. 타인 정보의 등록과 책임</h2>
          <p>
            본 서비스는 본인 외 타인(동창 등)의 공개 정보를 등록할 수 있는 구조입니다. 타인의
            정보를 등록하는 이용자는 해당 정보가 공개·노출됨에 따른 모든 책임을 부담하며,
            비공개·민감 정보를 무단으로 등록해서는 안 됩니다. 무단 등록으로 인해 발생하는 분쟁 및
            법적 책임은 등록자에게 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">6. 만 14세 미만 아동</h2>
          <p>
            만 14세 미만 아동의 정보는 법정대리인의 동의 없이 등록할 수 없습니다. 동의 없이
            등록된 사실이 확인되면 해당 정보를 지체 없이 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">7. 수정·삭제 요청</h2>
          <p>
            등록된 정보의 수정·삭제를 원하실 경우 각 페이지의 신고/수정·삭제 요청 기능을
            이용하거나 schoollove.contact@gmail.com 으로 연락해 주세요. 관리자 확인 후 신속히
            처리합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">8. 면책조항</h2>
          <p>
            서비스는 등록된 정보의 정확성·신뢰성을 보장하지 않으며, 이용자 간 또는 이용자와
            제3자 간 발생한 분쟁에 대해 책임을 지지 않습니다. 부정확하거나 부적절한 정보는 신고
            기능을 통해 알려주시기 바랍니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">9. 약관의 변경</h2>
          <p>
            서비스는 필요 시 본 약관을 변경할 수 있으며, 변경 시 서비스 내에 시행일과 함께
            공지합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">10. 문의</h2>
          <p>schoollove.contact@gmail.com</p>
        </section>

        <p className="mt-8 text-xs text-gray-400">시행일: 2026년 5월 22일</p>
      </div>
    </main>
  )
}
