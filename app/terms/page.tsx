export default function TermsPage() {
  return (
    <main className='max-w-2xl mx-auto px-4 py-12'>
      <h1 className='text-2xl font-bold mb-8'>이용약관</h1>
      <div className='space-y-8 text-sm text-gray-700 leading-relaxed'>
        <section>
          <h2 className='font-bold text-base mb-2'>1. 서비스 소개</h2>
          <p>스쿨러브아이는 학교 기반 공개 인스타그램 검색 플랫폼입니다. 누구나 로그인 없이 무료로 이용할 수 있습니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>2. 이용 규칙</h2>
          <p>공개 인스타그램 계정만 등록 가능합니다. 사칭 및 개인정보 무단 등록 금지. 서비스 이용 시 본 약관에 동의한 것으로 간주합니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>3. 등록 정보</h2>
          <p>등록된 정보는 누구나 볼 수 있습니다. 본인 또는 지인의 정보를 등록할 수 있으나, 타인의 개인정보를 무단으로 등록 시 책임은 등록자에게 있습니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>4. 삭제 요청</h2>
          <p>본인 정보 삭제를 원하실 경우 신고/삭제 요청 기능을 이용하거나 schoollove.help@gmail.com 으로 연락주세요. 관리자 확인 후 신속 실행합니다.</p>
        </section>
        <section>
          <h2 className='font-bold text-base mb-2'>5. 면책조항</h2>
          <p>서비스는 등록된 정보의 정확성을 보장하지 않습니다. 부정확한 정보 등록 시 신고 기능을 이용해 주세요.</p>
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
