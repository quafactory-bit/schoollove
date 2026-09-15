import type { Metadata } from 'next'
import CollectionNotice from '@/components/privacy/CollectionNotice'
import { PRIVACY_NOTICE_REVISION } from '@/lib/privacyNotice'

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '스쿨러브아이 개인정보 안전 전환과 처리 원칙을 안내합니다.',
}

const CONTACT = 'schoollove.contact@gmail.com'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-black text-gray-950">개인정보처리방침</h1>
      <p className="mt-3 text-sm text-gray-500">시행일: {PRIVACY_NOTICE_REVISION}</p>
      <p className="mt-2 text-sm text-gray-600">이번 개정에서는 수집 항목·목적·보유기간·거부 방법, 개인정보 보호책임자와 탈퇴 후 삭제 절차를 구체화했습니다. 확인되지 않은 외부 사업자의 처리 범위는 해당 항목에 따로 표시합니다.</p>

      <div className="mt-10 space-y-9 text-sm leading-7 text-gray-700">
        <section>
          <h2 className="text-lg font-bold text-gray-950">1. 현재 개인정보 안전 전환 상태</h2>
          <p className="mt-2">
            스쿨러브아이는 개인의 이름·졸업연도·학년·반·인스타그램주소 정보가 결합된 공개 명단과 공개 사람 검색을 제공하지 않습니다.
            공개 화면에서는 학교명·지역·학교 유형 등 학교 기본 정보만 제공합니다.
            안부 도착·재알림·수락 알림은 본인 계정 안에서만 제공하며 외부 이메일·푸시로 발송하지 않습니다.
            성인 비공개 계정은 launch 상태가 별도로 승인된 때에만 시작할 수 있고, 본인 소유 정보만 처리합니다.
            별도 초대·운영자 승인이 필요한 사람 찾기에서는 학교·졸업연도·정확한 이름의 일치 여부만 확인합니다. 선택한 반 조건은 본인이 저장한 학교 이력과 일치해야 합니다. 개인 명단·검색 결과 수·상대 계정 ID는 반환하지 않습니다. 안부 수락 전 이름은 마스킹되며, 연결 후 상대에게 표시명이 보입니다. 인스타그램주소는 기능 권한과 연결 상대별 공개 승인이 있을 때만 보이고 취소·차단·연결 해제 시 비공개로 전환됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">2. 기존 정보의 처리</h2>
          <p className="mt-2">
            2026년 8월 3일 legacy 개인 정보와 원문 검색 로그 초기화를 완료했습니다. 기존 등록자를 조회·연락·전환·소유권 부여·초대·재사용하지 않습니다.
            다시 방문하는 이용자는 현재 성인 확인·동의·인증·비공개 소유권 경계를 새로 거쳐야 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">3. 성인 비공개 계정 조건</h2>
          <p className="mt-2">
            계정 등록은 만 19세 이상 이용자, 본인 정보, 인증된 소유권, 기본 비공개를 원칙으로 합니다. Google 로그인으로 인증하며 복구 이메일은 로그인 수단이 아닌 소유권·중복 보호를 위해 별도로 확인합니다. 학년·반 등록은 선택 사항입니다.
            타인의 이름이나 계정을 대신 등록하는 방식은 허용하지 않습니다.
          </p>
          <p className="mt-2">
            성인 확인에 입력한 생년월일은 KST 기준 만 나이 판정에만 사용하고 원본을 저장하지 않습니다.
            현재 자기진술 방식은 휴대전화·신분증 기반의 강한 본인확인이 아니며, 성인 확인·정책 버전별 필수 동의 결과를 최소한으로 기록합니다. 복구 이메일은 암호화와 중복 확인용 해시로 보호합니다.
          </p>
        </section>

        <section id="collection" className="scroll-mt-8">
          <h2 className="text-lg font-bold text-gray-950">수집하는 정보·목적·보유기간과 동의 거부</h2>
          <p className="mt-2 mb-4">아래는 본인 계정에서 직접 입력하거나 계정 관리 과정에서 생성되는 정보입니다. 처리 목적에 필요한 정보만 수집합니다.</p>
          <CollectionNotice />
          <h3 className="mt-6 mb-3 font-bold text-gray-950">선택 정보</h3>
          <CollectionNotice optional />
          <p className="mt-3">선택 정보를 입력하지 않아도 기본 계정을 이용할 수 있습니다. 각 선택 항목은 내 계정에서 삭제할 수 있으며, 삭제 요청을 위한 새로운 개인정보 제공을 일률적으로 요구하지 않습니다.</p>
        </section>

        <section id="authentication" className="scroll-mt-8">
          <h2 className="text-lg font-bold text-gray-950">로그인·복구 과정의 정보 처리</h2>
          <p className="mt-2">Google 로그인에서는 Google 계정 식별값과 인증 결과를 검증하고, 계정 식별값을 해시 기반 식별자로 바꿔 계정 연결에 사용합니다. Google 프로필의 이름·사진을 SchoolLove 프로필로 자동 등록하지 않으며 Google 이메일을 로그인 식별자로 사용하지 않습니다. Google 인증은 이용자의 요청에 따른 계정 인증·서비스 제공을 위해 처리합니다.</p>
          <p className="mt-2">복구 이메일은 소유권 확인과 중복 계정 보호를 위해 별도로 입력받습니다. 이메일 암호문과 중복 확인용 해시, 인증 결과·시각을 처리합니다. 복구 이메일 암호문은 계정 이용 중 보관하고 탈퇴의 개인 데이터 삭제 단계에서 제거합니다. 인증번호는 발급 후 10분 동안만 유효하며, 사용 완료·취소·만료 처리된 인증의 인증번호 검증값과 수신 주소 암호문은 제거합니다. 인증 유효기간은 외부 발송 사업자의 이메일·로그 보유기간과 다릅니다.</p>
          <p className="mt-2">일반적인 자발적 탈퇴는 인증 계정의 실제 삭제를 확인한 뒤, 중복 확인용 해시·로그인 식별 기록·완료된 삭제 작업을 정리합니다. 기존 인증의 재사용을 막기 위해 완료 후 15분간 제한적으로 유지하고 5분 주기 작업으로 제거합니다. 인증번호의 비밀정보는 사용·취소 시 제거하며, 미사용 정보는 만료 후 5분 주기로 정리합니다. 발송 제한용 해시는 발송 예약 시각부터 24시간 보관한 뒤 같은 주기로 삭제합니다. 삭제 실패나 안전 신고·이용 제한의 별도 처리가 필요한 경우 일반 완료 기록과 구분해 제한된 운영 권한으로 처리합니다.</p>
          <p className="mt-2 font-semibold">Google 인증이나 필요한 복구 이메일 확인을 진행하지 않으면 개인 계정을 사용할 수 없습니다. 공개 학교 기본 정보는 로그인하지 않고 조회할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">4. 자동 수집 및 이용 목적</h2>
          <p className="mt-2">
            서비스 보안, 장애 대응, 부정 이용 방지 및 통계 분석을 위해 접속·요청 관련 기술 정보가 처리될 수 있습니다.
            Web Analytics는 페이지 방문을 집계하며 개인 이름, 인스타그램주소, 메시지, 검색어 원문을 커스텀 분석 이벤트로 전송하지 않습니다.
            공개 계정 집계는 KST 일자, 허용된 단계, direct·school_search·account·onboarding의 거친 출처, 합계만 저장하며 10 미만 관리자 집계를 마스킹합니다. Home·login·실제 학교 검색은 고유 방문자가 아닌 요청 횟수이고, OTP 인증 이후의 전환 단계는 같은 계정의 최초 완료만 집계합니다. 이메일·user/profile/school ID·이름·인스타그램주소·생년월일·검색어·IP·user agent·token/cookie는 집계에 저장하지 않습니다.
          </p>
          <p className="mt-2">보안과 요청 제한을 위해 IP 주소 또는 IP·계정 식별정보의 해시, 요청 시각과 횟수를 처리합니다. 해시 처리만으로 익명정보가 되는 것은 아닙니다. 요청 제한용 카운터에는 만료시간을 설정하며, 현재 사람 찾기·안부 요청 등에 사용하는 하루 제한 카운터의 수명은 생성 시점부터 최대 48시간 1초입니다. 호스팅·데이터베이스 사업자의 보안 로그와 백업은 이 카운터와 별도입니다.</p>
          <p className="mt-2">로그인 유지를 위한 필수 쿠키와 방문 통계를 구분합니다. 브라우저 설정에서 쿠키 저장을 차단하거나 삭제할 수 있으나 로그인이 유지되지 않을 수 있습니다. Vercel Web Analytics는 방문 URL에서 검색 매개변수와 주소의 # 뒤 부분을 제거하며, 방문 식별용 값은 업체 정책상 24시간 뒤 폐기됩니다. 이 기간은 통계 전체의 보유기간을 뜻하지 않습니다. 브라우저의 콘텐츠 차단 기능으로 분석 요청 경로인 /_vercel/insights/를 차단할 수 있습니다.</p>
        </section>

        <section id="processors" className="scroll-mt-8">
          <h2 className="text-lg font-bold text-gray-950">5. 처리 위탁과 국외 이전</h2>
          <p className="mt-2">계정 인증·저장·보안 및 복구 이메일 발송을 위해 다음 사업자의 서비스를 이용합니다. 국외 처리위탁·보관에 계약 체결·이행에 필요한 이전 근거를 적용하는 경우 개인정보 보호법 제28조의8 제1항 제3호에 따른 사항을 안내합니다. 방문 분석 등은 그 목적과 법적 근거를 별도로 확인하며 필수 계정 처리와 같은 것으로 취급하지 않습니다.</p>
          <dl className="mt-4 space-y-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <dt className="font-bold text-gray-950">Supabase, Inc. · 데이터베이스·계정 인증</dt>
              <dd className="mt-2">연락처: <a className="underline" href="mailto:privacy@supabase.com">privacy@supabase.com</a></dd>
              <dd>항목·목적: 계정 식별자, 프로필·학교 이력, 성인 확인·동의, 복구 이메일 암호문·해시 및 서비스 기록의 저장·조회·인증 처리</dd>
              <dd>국가: 운영 주 데이터베이스는 싱가포르. 국외 지원 접근 및 재위탁 국가의 전체 범위는 확인 중입니다.</dd>
              <dd>시기·방법: 로그인·저장·조회 요청 시 암호화된 네트워크 통신으로 전송</dd>
              <dd>보유기간: 서비스 데이터는 위 항목별 기간에 따릅니다. 현재 Free 요금제의 API·DB 로그는 공식 안내상 1일입니다. 비활성 프로젝트의 일시중지 복구 창은 최대 1년이며 일반 이용자별 보관기간과 다릅니다. 내부 보안 로그·백업 사본의 세부 삭제 조건은 확인 중입니다. 공급자 계약 종료 후에는 공식 DPA상 30일의 반환 기간을 거쳐 사본을 삭제합니다.</dd>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <dt className="font-bold text-gray-950">Vercel Inc. · 호스팅·보안·방문 분석</dt>
              <dd className="mt-2">연락처: <a className="underline" href="mailto:privacy@vercel.com">privacy@vercel.com</a></dd>
              <dd>항목·목적: 사이트 요청에 포함되는 IP·브라우저·요청 시각·경로, 해당 기능에서 제출한 정보의 서버 처리, 방문 통계</dd>
              <dd>시기·방법: 페이지 방문·기능 요청 시 암호화된 네트워크 통신으로 전송</dd>
              <dd>국가: 운영 서버 함수는 미국(워싱턴 D.C. 지역)에서 실행됩니다. CDN·보안 로그·분석의 처리 국가 전체 범위는 확인 중입니다.</dd>
              <dd>보유기간: 현재 Hobby의 런타임 로그 조회 범위는 1시간이며, 이를 모든 개인정보의 완전 삭제 기한으로 간주하지 않습니다. 방문 분석 보고 창은 1개월이지만 공급자는 더 오래 보유할 수 있다고 안내합니다. 분석·보안 로그의 최대 보유기간과 Hobby에 적용되는 처리계약 범위는 확인 중입니다.</dd>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <dt className="font-bold text-gray-950">Upstash, Inc. · 요청 제한</dt>
              <dd className="mt-2">연락처: <a className="underline" href="mailto:support@upstash.com">support@upstash.com</a></dd>
              <dd>항목·목적: IP 주소 또는 IP·계정 식별정보의 해시와 요청 카운터를 이용한 부정 이용 방지</dd>
              <dd>시기·방법: 요청 제한을 적용하는 기능의 요청 시 서버에서 암호화 통신으로 전송</dd>
              <dd>국가: 운영 데이터베이스에서 확인된 저장 지역은 일본 도쿄(AWS ap-northeast-1)입니다. 추가 읽기 복제 지역의 유무는 확인 중입니다.</dd>
              <dd>보유기간: 요청 카운터는 만료시간에 따라 제거합니다. 무료 티어를 사용하며, 별도 로그·백업 보유기간은 확인 중입니다.</dd>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <dt className="font-bold text-gray-950">Plus Five Five, Inc. (Resend) · 복구 인증 이메일 발송</dt>
              <dd className="mt-2">연락처: <a className="underline" href="mailto:privacy@resend.com">privacy@resend.com</a></dd>
              <dd>항목·목적: 복구 이메일 주소, 인증번호를 포함한 메일 본문, 발송 상태의 전달·장애 대응</dd>
              <dd>국가: 미국. 이메일 발송 지역과 데이터 저장 국가는 다를 수 있습니다.</dd>
              <dd>시기·방법: 이용자가 복구 인증번호 발송을 요청할 때 서버에서 암호화 통신으로 전송</dd>
              <dd>보유기간: 현재 Free 요금제를 사용하며, 공식 정책에 따라 이메일·로그는 30일, 백업은 7일 보관됩니다. 이 기간은 인증번호의 유효기간과 별개입니다.</dd>
            </div>
          </dl>
          <p className="mt-4 font-semibold">국외 이전을 원하지 않으면 해당 기능을 시작하기 전에 이용을 중단하거나 {CONTACT} 또는 아래 보호책임자 연락처로 처리정지·삭제를 요청할 수 있습니다. 계정 인증·저장·복구에 필요한 이전을 거부하면 해당 개인 계정 기능을 제공할 수 없습니다. 방문 분석의 거부 방법은 자동 수집 항목에서 안내합니다.</p>
          <p className="mt-2">각 사업자의 처리계약과 재위탁 내역을 확인해 반영하며, 변경되는 이전 사항은 적용 법령에 따라 알리고 필요한 경우 별도 동의를 받습니다. 위 ‘확인 중’ 항목은 아직 확정하지 못한 범위이며, 공급자 확인 결과에 따라 보완합니다. 이번 개정으로 새로운 수집 목적이나 공개 범위를 추가하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">6. 열람·삭제·처리정지 및 신고</h2>
          <p className="mt-2">
            본인 정보의 열람, 삭제, 정정, 처리정지 또는 개인정보 침해 신고는 {CONTACT}으로 요청할 수 있습니다.
            요청자의 권리와 타인의 개인정보를 보호하기 위해 본인 확인과 대상 정보 확인을 요청할 수 있습니다.
            계정 내 탈퇴 요청은 즉시 추가 profile·학교 이력 변경을 차단합니다. 운영 확인 후 공개 계정 데이터를 먼저 삭제하고 Auth identity 실제 삭제를 요청하는 2단계 절차를 사용합니다.
            Auth 제공자 삭제가 실패하면 완료로 표시하지 않고 차단된 재시도 대기 상태를 유지합니다. 성인 확인과 필수 동의 기록은 개인 데이터 삭제 단계에서 제거하고, 로그인 계정은 인증 제공자의 삭제 절차로 제거합니다. 탈퇴 요청은 지체 없이 처리하며 정상 완료 목표는 24시간 이내입니다. 이는 삭제를 미루는 대기기간이 아닙니다. 일반 탈퇴의 요청·감사 기록은 위 인증 재사용 방지 기간 뒤 식별 기록과 함께 삭제하고, 개인을 연결할 수 없는 날짜별 완료 건수만 최대 90일 보관합니다. 이용자·계정·요청 식별자나 이메일 해시는 이 집계에 남기지 않습니다.
          </p>
          <p className="mt-2">본인 프로필·학교 이력은 내 계정에서 열람·정정·삭제할 수 있습니다. 동의 철회와 처리정지, 로그인할 수 없는 계정의 권리행사는 이메일이나 전화로 요청할 수 있습니다. 요청 확인을 위해 필요한 최소한의 정보만 확인하고, 처리 결과 또는 법령상 제한 사유를 안내합니다. 불필요해진 전자 기록은 복구할 수 없도록 파기하며, 법령에 따른 별도 보존이 필요한 경우 해당 근거·항목·기간을 구분합니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">7. 개인정보 보호책임자와 문의</h2>
          <dl className="mt-2 space-y-1">
            <div><dt className="inline font-semibold">개인정보 보호책임자: </dt><dd className="inline">박완</dd></div>
            <div><dt className="inline font-semibold">이메일: </dt><dd className="inline"><a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></dd></div>
            <div><dt className="inline font-semibold">전화: </dt><dd className="inline"><a className="underline" href="tel:07087130423">070-8713-0423</a></dd></div>
          </dl>
          <p className="mt-2">개인정보 문의, 긴급 삭제 요청, 권리행사와 불만 처리를 위 연락처로 접수합니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-950">8. 안전성 확보와 방침 변경</h2>
          <p className="mt-2">개인정보 접근을 본인 계정과 필요한 운영 권한으로 제한하고, 관리자 인증과 전송 암호화, 복구 이메일 암호화, 요청 제한을 적용합니다. 개인 명단 공개와 타인 정보 등록을 허용하지 않습니다.</p>
          <p className="mt-2">처리방침을 변경하면 변경 내용과 시행일을 공개합니다. 새로운 수집·이용 목적이나 동의가 필요한 변경은 기존 동의로 간주하지 않고 적용 법령에 따른 안내와 동의 절차를 진행합니다.</p>
        </section>

        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
          이 문서는 현재 서비스 동작을 설명하기 위한 운영 고지이며, 관계 법령에 따른 최종 법률 검토를 대체하지 않습니다.
        </p>
      </div>
    </main>
  )
}
