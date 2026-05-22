export default function PrivacyPage() {
  return (
    <main className='max-w-2xl mx-auto px-4 py-12'>
      <h1 className='text-2xl font-bold mb-8'>개인정보처리방침</h1>
      <div className='space-y-8 text-sm text-gray-700 leading-relaxed'>
        <section>
          <h2 className='font-bold text-base mb-2'>1. 수집하는 개인정보</h2>
          <p>서비스 이용 시 이름/별명, 인스타그램 ID, 학교명, 졸업년도, 학년, 반 정보를 수집합니다. 접속 IP 주소 및 서비스 이용 기록이 자동 수집될 수 있습니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>2. 수집 목적</h2>
          <p>학교 기반 인스타그램 검색 서비스 제공, 신고 및 관리, 서비스 개선을 목적으로 합니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>3. 보유 기간</h2>
          <p>서비스 탈퇴 시 즉시 삭제합니다. 다만 법령에 의해 보존이 필요한 경우 해당 기간 보존 후 삭제합니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>4. 제3자 제공</h2>
          <p>이용자의 동의 없이는 제3자에게 개인정보를 제공하지 않습니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>5. 삭제 요청</h2>
          <p>등록된 정보의 삭제를 원하실 경우 페이지 내 신고/삭제 요청 기능을 이용하거나 schoollove.help@gmail.com 으로 연락주세요.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>6. 문의</h2>
          <p>schoollove.help@gmail.com</p>
        </section>
        <p className='text-gray-400 text-xs mt-8'>시행일: 2026년 5월 22일</p>
      </div>
    </main>
  )
}
