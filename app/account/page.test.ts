import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app/account/page.tsx'), 'utf8')
const client = readFileSync(join(process.cwd(), 'app/account/AccountClient.tsx'), 'utf8')

describe('/account private management UI', () => {
  it('서버가 검증된 auth context 없이는 login으로 보낸다', () => {
    expect(page).toContain('getAuthenticatedServerContext()')
    expect(page).toContain("if (!auth) redirect('/login?next=/account')")
    expect(page).toContain("robots: { index: false, follow: false, nocache: true, noarchive: true }")
  })

  it('Google 로그인 상태를 coarse label로 표시하고 provider email에 의존하지 않는다', () => {
    expect(client).toContain('Google 계정으로 로그인됨')
    expect(page).not.toContain('auth.user.email')
    expect(client).not.toMatch(/\bemail\b/)
  })

  it('성인 확인, 필수 동의, 내 프로필, 학교 이력, 삭제·탈퇴를 제공한다', () => {
    for (const text of ['만 19세 이상 확인', '필수 동의', '내 비공개 프로필', '내 학교 이력', '내 프로필 삭제', '계정 탈퇴 요청']) {
      expect(client).toContain(text)
    }
  })

  it('생년월일 비저장과 기본 비공개를 명시한다', () => {
    expect(client).toContain('원본 생년월일은 DB나 로그에 저장하지 않습니다')
    expect(client).toContain('사람 검색이나 공개 화면에 표시되지 않습니다')
  })

  it('제한 베타·연결·메시지 CTA를 공개 계정 화면에서 제거한다',()=>{
    for(const path of ['/people/search','/connections','/notifications','/account/safety'])expect(client).not.toContain(path)
    expect(client).not.toContain('제한 베타 시작 상태')
  })

  it('실제 계정 상태에서 로그인 포함 온보딩 진행률을 계산한다',()=>{
    expect(client).toContain('onboardingCompleted=1+Number(state.adultEligible)')
    expect(client).toContain('onboardingComplete=state.adultEligible&&state.consentsComplete&&Boolean(state.profile)&&state.memberships.length>0')
    expect(client).toContain('온보딩 진행 상태 보기')
    expect(client).toContain('{onboardingCompleted*20}%')
    expect(client).toContain('비공개 계정 준비 완료')
  })

  it('기존 account state membership을 별도 조회 없이 내 학교 첫 가치로 전달한다',()=>{
    expect(client).toContain('<MySchoolsPanel memberships={state.memberships} schoolMembershipWritable={schoolMembershipWritable}/>')
    expect(client).not.toMatch(/fetch\([^)]*my-schools/)
  })

  it('public, active beta, exact invite onboarding 중 하나가 허용한 기능만 저장 가능하다',()=>{
    expect(page).toContain("hasBetaFeatureAccess(auth.client,auth.user.id,'private_profile')")
    expect(page).toContain("hasBetaFeatureAccess(auth.client,auth.user.id,'instagram_permission')")
    expect(page).toContain('getBetaOnboardingState(auth.user.id)')
    expect(client).toContain('(launch.privateProfileEnabled||controlledBetaAccess||inviteOnboardingAccess)&&!launch.emergencyStopped')
    expect(client).toContain('(launch.schoolMembershipEnabled||controlledBetaAccess||inviteOnboardingAccess)&&!launch.emergencyStopped')
    expect(client).toContain('controlledBetaAccess||inviteOnboardingAccess?1:3')
  })

  it('Connected Instagram add-on은 기존 profile의 handle만 별도 저장·삭제한다',()=>{
    expect(client).toContain('instagramHandleSetWritable=Boolean(state.profile)&&instagramBetaAccess&&!deletionBlocked')
    expect(client).toContain('instagramHandleClearWritable=Boolean(state.profile?.instagram_handle)&&!deletionBlocked')
    expect(client).toContain("submit('/api/account/instagram',{instagram_handle:instagram||null},'PATCH'")
    expect(client).toContain("submit('/api/account/instagram',{instagram_handle:null},'PATCH'")
    expect(client).toContain('이 동작은 Instagram 아이디만 저장하거나 삭제하며 이름·소개·학교 이력은 변경하지 않습니다.')
  })

  it('선택한 K12 학교에만 학년별 반 입력을 제공하고 학교 수와 분리한다',()=>{
    expect(client).toContain('gradeNumbersForSchoolType(selectedSchoolType)')
    expect(client).toContain('기억나는 학년의 반만 입력해도 됩니다.')
    expect(client).toContain('{grade}학년 반')
    expect(client).toContain('grade_classes:buildGradeClassPayload(gradeClassValues)')
    expect(client).not.toContain('class_number:classNumber')
    expect(client).toContain('controlledBetaAccess||inviteOnboardingAccess?1:3')
  })

  it('어두운 계정 동작 버튼과 상태 알림은 흰 글자 대비를 강제한다',()=>{
    expect(client).toContain('schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950')
    expect(client).toContain('className={`schoollove-dark-action sticky bottom-24')
  })

  it('authenticated account에서만 token을 invite-onboarding API에 제출한다',()=>{
    expect(client).toContain('제한 베타 초대 등록')
    expect(client).toContain("fetch('/api/beta/onboarding/claim'")
    expect(client).toContain('JSON.stringify({token:inviteToken})')
    expect(client).toContain("if(inviteBusy)return")
    expect(client).toContain('inviteBusy||inviteToken.trim().length<24')
    expect(client).toContain("type=\"password\"")
    expect(client).toContain("autoComplete=\"off\"")
    expect(client).not.toMatch(/localStorage|searchParams.*invite|console\.(log|error).*invite/i)
  })

  it('beta invite success와 coarse failure 상태를 토큰 반사 없이 표시한다',()=>{
    for(const state of ['ONBOARDING_CLAIMED','PENDING_REVIEW','ACTIVE','ALREADY_REDEEMED','UNAVAILABLE','INVALID','PROGRAM_FULL'])expect(client).toContain(state)
    expect(client).toContain("if(success){setInviteToken('');router.refresh()}")
    expect(client).not.toContain('setInviteStatus(inviteToken')
  })

  it('claim과 finalize UX를 분리하고 pending review 전에는 beta feature CTA를 만들지 않는다',()=>{
    expect(client).toContain('초대 확인 완료')
    expect(client).toContain("fetch('/api/beta/onboarding/finalize'")
    expect(client).toContain('베타 참여 신청 완료')
    expect(client).not.toContain('href="/people/search"')
  })

})
