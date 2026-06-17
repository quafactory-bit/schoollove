export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold">개인정보처리방침</h1>
      <div className="space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <p>
            스쿨러브아이(이하 &lsquo;서비스&rsquo;)는 학교 기반 공개 인스타그램 검색 플랫폼으로,
            이용자가 입력한 정보가 누구나 볼 수 있도록 공개되고 외부 검색엔진에 노출될 수 있는
            특성을 가집니다. 본 방침은 그 처리 방식을 안내합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">1. 수집하는 개인정보 항목</h2>
          <p>
            서비스는 로그인 없이 이용 가능하며, 등록 시 다음 정보를 수집합니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>필수: 이름 또는 별명, 학교명, 졸업(예정) 년도, 학년·반(초·중·고) 또는 학과·학번(대학)</li>
            <li>선택: 인스타그램 ID, 등록 시 남기는 한마디</li>
            <li>자동 수집: 접속 IP 주소, 서비스 이용 기록(부정 이용 방지 및 통계 목적)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">2. 수집 및 이용 목적</h2>
          <p>학교 기반 인스타그램 검색 서비스 제공, 신고·삭제 요청 처리, 부정 이용 방지, 서비스 개선 및 통계 분석.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">3. 등록 정보의 공개 및 검색엔진 노출</h2>
          <p>
            본 서비스에 등록된 정보(이름/별명, 인스타그램 ID, 학교·학년·반 등)는 로그인 여부와
            관계없이 <strong>누구나 열람할 수 있도록 공개</strong>됩니다. 또한 공개된 페이지는
            <strong> 구글, 네이버 등 외부 검색엔진에 색인되어 검색 결과에 표시될 수 있습니다.</strong>
            이용자는 정보 등록 시 이러한 공개 및 검색엔진 노출에 동의하는 것으로 간주됩니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">4. 제3자(타인) 정보의 등록</h2>
          <p>
            본 서비스는 이용자가 본인 외 타인(동창 등)의 공개 정보를 등록할 수 있는 구조입니다.
            타인의 정보를 등록하는 경우, 해당 정보가 위 3항과 같이 공개·노출됨에 대한 책임은
            등록자에게 있습니다. 서비스는 비공개·민감 정보의 무단 등록을 금지하며, 신고 또는
            삭제 요청이 접수된 정보는 검토 후 비공개 처리하거나 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">5. 만 14세 미만 아동의 개인정보</h2>
          <p>
            본 서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만 아동의 정보는
            법정대리인의 동의 없이 등록할 수 없습니다. 만 14세 미만 아동 본인 또는 그 정보가
            동의 없이 등록된 사실을 확인한 경우, 아래 연락처로 요청하시면 지체 없이 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">6. 보유 및 이용 기간</h2>
          <p>
            등록된 정보는 삭제 요청 시 또는 보관 필요가 사라진 때 삭제합니다. 로그인·회원 제도가
            없으므로 별도의 탈퇴 절차는 없으며, 삭제 요청을 통해 정보를 제거할 수 있습니다.
            다만 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보존 후 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">7. 삭제 및 정정 요청</h2>
          <p>
            등록된 정보의 삭제·정정을 원하실 경우 각 페이지의 신고/수정·삭제 요청 기능을
            이용하거나 아래 연락처로 요청해 주세요. 관리자 확인 후 신속히 처리하며, 처리 완료
            시 해당 페이지는 비공개 처리됩니다. 외부 검색엔진의 캐시는 검색엔진의 정책에 따라
            반영에 일정 시간이 소요될 수 있으며, 필요한 경우 검색엔진에 색인 삭제를 요청합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">8. 처리의 위탁 및 국외 이전</h2>
          <p>
            서비스 운영을 위해 데이터 저장·호스팅을 외부 사업자에 위탁하며, 이 과정에서 개인정보가
            국외 서버에 저장될 수 있습니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Supabase (데이터베이스 저장)</li>
            <li>Vercel (웹 호스팅)</li>
            <li>Upstash (요청 제한·캐시)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">9. 정보주체의 권리</h2>
          <p>
            이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요청할 수 있으며, 아래
            연락처를 통해 행사할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">10. 개인정보 보호책임자</h2>
          <p>
            성명: [스쿨러브아이]
            <br />
            연락처: schoollove.contact@gmail.com
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">11. 문의</h2>
          <p>schoollove.contact@gmail.com</p>
        </section>

        <p className="mt-8 text-xs text-gray-400">시행일: 2026년 5월 22일</p>
      </div>
    </main>
  )
}
