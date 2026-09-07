'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSchoolAutocomplete } from '@/lib/hooks/useSchoolAutocomplete'
import type { AccountState } from '@/lib/account'
import type { PublicAccountLaunch } from '@/lib/publicAccountLaunch'
import MySchoolsPanel from '@/components/account/MySchoolsPanel'
import { buildGradeClassPayload, formatGradeClassHistory, gradeNumbersForSchoolType } from '@/lib/accountGradeClass'
import { SCHOOL_TYPE_LABELS, type SchoolType } from '@/types/school'
import type { BetaOnboardingState } from '@/lib/betaOnboarding'

type Props={state:AccountState;launch:PublicAccountLaunch;controlledBetaAccess:boolean;peopleSearchBetaAccess?:boolean;instagramBetaAccess:boolean;betaOnboardingState:BetaOnboardingState;currentYear:number}

async function readResult(response:Response):Promise<{error?:string}>{
  try{return await response.json() as {error?:string}}catch{return {}}
}

export default function AccountClient({state,launch,controlledBetaAccess,peopleSearchBetaAccess=false,instagramBetaAccess,betaOnboardingState,currentYear}:Props){
  const router=useRouter()
  const [status,setStatus]=useState('')
  const [isError,setIsError]=useState(false)
  const [busy,setBusy]=useState(false)
  const [birthDate,setBirthDate]=useState('')
  const [consents,setConsents]=useState({terms:false,privacy_collection:false,adult_confirmation:false,private_by_default:false})
  const [displayName,setDisplayName]=useState(state.profile?.display_name??'')
  const [instagram,setInstagram]=useState(state.profile?.instagram_handle??'')
  const [introduction,setIntroduction]=useState(state.profile?.introduction??'')
  const [schoolQuery,setSchoolQuery]=useState('')
  const [schoolId,setSchoolId]=useState('')
  const [selectedSchoolType,setSelectedSchoolType]=useState<SchoolType|null>(null)
  const [graduationYear,setGraduationYear]=useState('')
  const [gradeClassValues,setGradeClassValues]=useState<Record<number,string>>({})
  const [activeSchool,setActiveSchool]=useState(-1)
  const [inviteToken,setInviteToken]=useState('')
  const [inviteBusy,setInviteBusy]=useState(false)
  const [inviteStatus,setInviteStatus]=useState('')
  const [inviteError,setInviteError]=useState(false)
  const schools=useSchoolAutocomplete(schoolQuery)
  const deletionBlocked=state.deletionStatus!==null
  const inviteOnboardingAccess=betaOnboardingState==='claimed'
  const privateProfileWritable=(launch.privateProfileEnabled||controlledBetaAccess||inviteOnboardingAccess)&&!launch.emergencyStopped&&!deletionBlocked
  const schoolMembershipWritable=(launch.schoolMembershipEnabled||controlledBetaAccess||inviteOnboardingAccess)&&!launch.emergencyStopped&&!deletionBlocked
  const classHistoryWritable=(schoolMembershipWritable||peopleSearchBetaAccess)&&!launch.emergencyStopped&&!deletionBlocked
  const instagramHandleSetWritable=Boolean(state.profile)&&instagramBetaAccess&&!deletionBlocked
  const instagramHandleClearWritable=Boolean(state.profile?.instagram_handle)&&!deletionBlocked
  const accountWritable=privateProfileWritable||schoolMembershipWritable||instagramHandleSetWritable||instagramHandleClearWritable
  const membershipLimit=controlledBetaAccess||inviteOnboardingAccess?1:3
  const onboardingCompleted=1+Number(state.adultEligible)+Number(state.consentsComplete)+Number(Boolean(state.profile))+Number(state.memberships.length>0)
  const onboardingComplete=state.adultEligible&&state.consentsComplete&&Boolean(state.profile)&&state.memberships.length>0
  const selectedGradeNumbers=gradeNumbersForSchoolType(selectedSchoolType)

  async function submit(endpoint:string,payload:unknown,method='POST',success='안전하게 저장했습니다.'){
    if(busy)return false
    setBusy(true);setStatus('');setIsError(false)
    try{
      const response=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      const result=await readResult(response)
      if(!response.ok){setStatus(result.error??'요청을 완료할 수 없습니다.');setIsError(true);return false}
      setStatus(success);router.refresh();return true
    }catch{setStatus('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');setIsError(true);return false}
    finally{setBusy(false)}
  }

  function chooseSchool(index:number){
    const school=schools.results[index]
    if(!school)return
    setSchoolId(school.id);setSelectedSchoolType(school.school_type);setGradeClassValues({});setSchoolQuery(`${school.school_name} · ${school.school_type} · ${school.sido} ${school.sigungu}`);setActiveSchool(-1)
  }

  async function redeemBetaInvite(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(inviteBusy)return
    setInviteBusy(true);setInviteStatus('');setInviteError(false)
    try{
      const response=await fetch('/api/beta/onboarding/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:inviteToken})})
      const result=await response.json().catch(()=>({})) as {status?:string;error?:string}
      if(!response.ok){
        setInviteStatus(result.error==='INVALID_INVITE'?'초대 토큰 형식을 확인해 주세요.':result.error==='AUTH_REQUIRED'?'로그인 세션을 다시 확인해 주세요.':'초대를 확인할 수 없습니다.')
        setInviteError(true);return
      }
      const messages:Record<string,string>={
        ONBOARDING_CLAIMED:'초대 확인 완료. 성인 확인, 필수 동의, 비공개 프로필과 대상 학교 등록을 진행해 주세요.',
        PENDING_REVIEW:'초대를 등록했습니다. 운영자 승인 후 베타 기능을 사용할 수 있습니다.',
        ACTIVE:'초대를 등록했습니다. 베타 기능을 사용할 수 있습니다.',
        ALREADY_REDEEMED:'이미 등록한 베타 초대입니다.',
        ADULT_CONSENT_REQUIRED:'성인 확인과 필수 동의를 먼저 완료해 주세요.',
        IDENTITY_MISMATCH:'이 계정에서 사용할 수 없는 초대입니다.',
        PROGRAM_FULL:'현재 베타 참여 인원이 모두 찼습니다.',
        PROGRAM_UNAVAILABLE:'현재 사용할 수 없는 베타 프로그램입니다.',
        PROGRAM_CONTRACT_UNAVAILABLE:'현재 사용할 수 없는 베타 프로그램입니다.',
        WAITLIST_DISABLED:'현재 베타 승인 대기를 사용할 수 없습니다.',
        UNAVAILABLE:'유효하지 않거나 만료되었거나 이미 사용된 초대입니다.',
        INVALID:'초대 토큰 형식을 확인해 주세요.',
        ACCESS_DENIED:'이 계정으로 초대를 등록할 수 없습니다.',
      }
      const success=['ONBOARDING_CLAIMED','PENDING_REVIEW','ACTIVE','ALREADY_REDEEMED'].includes(result.status??'')
      setInviteStatus(messages[result.status??'']??'초대를 등록할 수 없습니다.')
      setInviteError(!success)
      if(success){setInviteToken('');router.refresh()}
    }catch{setInviteStatus('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');setInviteError(true)}
    finally{setInviteBusy(false)}
  }

  async function finalizeBetaOnboarding(){
    if(inviteBusy)return
    setInviteBusy(true);setInviteStatus('');setInviteError(false)
    try{
      const response=await fetch('/api/beta/onboarding/finalize',{method:'POST'})
      const result=await response.json().catch(()=>({})) as {status?:string;error?:string}
      if(!response.ok){
        setInviteStatus(result.error==='ONBOARDING_REQUIRED'?'성인 확인, 필수 동의, 비공개 프로필과 대상 학교 등록을 모두 완료해 주세요.':'베타 참여 신청을 완료할 수 없습니다.')
        setInviteError(true);return
      }
      setInviteStatus('베타 참여 신청 완료. 운영자 승인 후 사람 찾기와 연결 요청을 사용할 수 있습니다.')
      router.refresh()
    }catch{setInviteStatus('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');setInviteError(true)}
    finally{setInviteBusy(false)}
  }

  return <main className="mx-auto max-w-2xl px-5 py-10">
    <div className="flex flex-wrap items-start justify-between gap-4"><div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Private account</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">내 계정</h1>
      <p className="mt-2 text-sm text-gray-600">Google 계정으로 로그인됨</p>
      <p className="mt-1 text-xs text-gray-500">로그인 세션은 서버에서 검증하며 만료 시 다시 로그인해야 할 수 있습니다.</p>
    </div><button type="button" disabled={busy} onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'}).catch(()=>undefined);router.push('/login');router.refresh()}}
      className="schoollove-focus min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">로그아웃</button></div>

    <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3" aria-label="온보딩 진행 상태">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-gray-900">온보딩 진행</span><span>{onboardingCompleted}/5 · {onboardingCompleted*20}%</span></div>
      <Link href="/onboarding" className="schoollove-focus mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-gray-900 underline">온보딩 진행 상태 보기</Link>
      {onboardingComplete?<div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3"><p className="font-semibold text-emerald-900">비공개 계정 준비 완료</p><p className="mt-1 text-xs leading-5 text-emerald-800">성인 확인, 필수 동의, 비공개 프로필과 학교 이력을 모두 저장했습니다.</p></div>:null}
    </section>
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5" aria-label="제한 베타 초대 등록">
      <h2 className="text-lg font-bold text-gray-950">제한 베타 초대 등록</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">운영자에게 받은 초대 토큰을 직접 제출할 때만 등록합니다. 토큰은 주소나 브라우저 저장소에 보관하지 않습니다.</p>
      {betaOnboardingState==='claimed'?<div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><p className="font-semibold">초대 확인 완료</p><p className="mt-1 leading-6">아래 온보딩 항목을 완료한 뒤 베타 참여를 신청해 주세요.</p>{onboardingComplete?<button type="button" disabled={inviteBusy} onClick={()=>void finalizeBetaOnboarding()} className="schoollove-dark-action schoollove-focus mt-3 min-h-12 rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:opacity-40">{inviteBusy?'신청 중…':'베타 참여 신청 완료'}</button>:null}</div>:betaOnboardingState==='pending_review'?<p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">베타 참여 신청 완료 · 운영자 승인 대기 중</p>:betaOnboardingState==='active'?<p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">People Discovery 베타 참여 승인 완료</p>:<form className="mt-4 space-y-3" onSubmit={redeemBetaInvite}>
        <label htmlFor="beta-invite-token" className="block text-sm font-medium text-gray-800">초대 토큰</label>
        <input id="beta-invite-token" type="password" required minLength={24} maxLength={256} autoComplete="off" spellCheck={false} value={inviteToken} onChange={(event)=>setInviteToken(event.target.value)} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/>
        <button disabled={inviteBusy||inviteToken.trim().length<24} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{inviteBusy?'초대 확인 중…':'초대 확인'}</button>
      </form>}
      {inviteStatus?<p role={inviteError?'alert':'status'} aria-live="polite" className={`mt-3 rounded-xl px-4 py-3 text-sm ${inviteError?'bg-red-50 text-red-900':'bg-emerald-50 text-emerald-900'}`}>{inviteStatus}</p>:null}
    </section>
    <MySchoolsPanel memberships={state.memberships} classHistoryWritable={classHistoryWritable}/>
    {!accountWritable&&!classHistoryWritable&&!deletionBlocked ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" role="status">계정 소프트런치를 준비 중이어서 현재 정보 저장은 닫혀 있습니다. 저장된 본인 정보 조회와 삭제·탈퇴 요청은 계속할 수 있습니다.</p>:null}
    {deletionBlocked ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900" role="status">{state.deletionStatus==='pending'?'탈퇴 요청이 접수되어 추가 정보 변경을 차단했습니다.':state.deletionStatus==='done'?'탈퇴 처리가 완료되었습니다.':'개인 데이터 삭제 또는 Auth identity 삭제를 진행 중이며 개인 기능 접근을 차단했습니다.'}</p>:null}

    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">1. 만 19세 이상 확인</h2>
      {state.adultEligible?<p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">현재 정책 기준 성인 확인 완료</p>:<form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();await submit('/api/account/eligibility',{dateOfBirth:birthDate})}}>
        <label htmlFor="birth-date" className="block text-sm font-medium text-gray-800">생년월일</label>
        <input id="birth-date" type="date" required value={birthDate} onChange={(event)=>setBirthDate(event.target.value)} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3" />
        <p className="text-xs leading-5 text-gray-500">KST 만 나이 판정에만 사용하며 원본 생년월일은 DB나 로그에 저장하지 않습니다. 자기진술은 신분증 기반의 강한 본인확인이 아닙니다.</p>
        <button disabled={busy||!privateProfileWritable} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">만 19세 이상 확인</button>
      </form>}
    </section>

    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">2. 필수 동의</h2>
      {state.consentsComplete?<p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">현재 정책 버전의 필수 동의 완료</p>:<form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();await submit('/api/account/consents',consents)}}>
        {([
          ['terms',<> <Link href="/terms" className="underline">이용약관</Link>에 동의합니다.</>],
          ['privacy_collection',<> <Link href="/privacy" className="underline">개인정보 수집·이용</Link>에 동의합니다.</>],
          ['adult_confirmation',<>만 19세 이상이며 본인 정보만 등록합니다.</>],
          ['private_by_default',<>개인 정보가 기본 비공개이며 사람 검색에 노출되지 않음을 확인했습니다.</>],
        ] as const).map(([key,label])=><label key={key} className="flex min-h-11 items-start gap-3 text-sm text-gray-700"><input type="checkbox" required checked={consents[key]} onChange={(event)=>setConsents((current)=>({...current,[key]:event.target.checked}))} className="mt-0.5 h-5 w-5"/><span>{label}</span></label>)}
        <button disabled={busy||!privateProfileWritable||!state.adultEligible} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">필수 동의 4개 기록</button>
      </form>}
    </section>

    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">3. 내 비공개 프로필</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">이름·Instagram·소개는 본인만 조회할 수 있습니다. Instagram은 사람 검색이나 공개 화면에 표시되지 않습니다. 안전한 업로드 경로가 준비되기 전까지 프로필 사진은 받지 않습니다.</p>
      <form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();await submit('/api/account/profile',{display_name:displayName,instagram_handle:instagram||null,introduction:introduction||null})}}>
        <label htmlFor="display-name" className="block text-sm font-medium text-gray-800">내 이름</label><input id="display-name" required maxLength={50} disabled={!privateProfileWritable} value={displayName} onChange={(event)=>setDisplayName(event.target.value)} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"/>
        <label htmlFor="instagram" className="block text-sm font-medium text-gray-800">Instagram 아이디 (선택·비공개)</label><input id="instagram" maxLength={30} pattern="[A-Za-z0-9._]{1,30}" disabled={!privateProfileWritable&&!instagramHandleSetWritable} value={instagram} onChange={(event)=>setInstagram(event.target.value.replace(/^@/,''))} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"/>
        <label htmlFor="introduction" className="block text-sm font-medium text-gray-800">소개 (선택·비공개)</label><textarea id="introduction" maxLength={300} disabled={!privateProfileWritable} value={introduction} onChange={(event)=>setIntroduction(event.target.value)} className="schoollove-focus min-h-24 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"/>
        <button disabled={busy||!privateProfileWritable||!state.adultEligible||!state.consentsComplete} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{state.profile?'내 프로필 수정 저장':'내 프로필 저장'}</button>
      </form>
      {state.profile&&(instagramHandleSetWritable||instagramHandleClearWritable)?<div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"><p className="text-xs leading-5 text-gray-600">이 동작은 Instagram 아이디만 저장하거나 삭제하며 이름·소개·학교 이력은 변경하지 않습니다.</p>{instagramHandleSetWritable?<button type="button" disabled={busy} onClick={()=>void submit('/api/account/instagram',{instagram_handle:instagram||null},'PATCH',instagram?'Instagram 아이디를 저장했습니다.':'Instagram 아이디를 삭제했습니다.')} className="schoollove-focus mt-2 min-h-11 rounded-lg border border-gray-900 px-3 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40">{instagram?'Instagram 값만 저장':'Instagram 값 삭제'}</button>:<button type="button" disabled={busy} onClick={()=>void submit('/api/account/instagram',{instagram_handle:null},'PATCH','Instagram 아이디를 삭제했습니다.')} className="schoollove-focus mt-2 min-h-11 text-sm font-medium text-red-700 disabled:opacity-40">Instagram 값 삭제</button>}</div>:null}
      {state.profile?<><p className="mt-4 text-xs leading-5 text-gray-500">프로필을 삭제하면 연결된 학교 이력도 함께 삭제됩니다.</p><button type="button" disabled={busy} onClick={async()=>{if(window.confirm('내 비공개 프로필과 연결된 학교 이력을 모두 삭제할까요?'))await submit('/api/account/profile',{},'DELETE','내 프로필과 학교 이력을 삭제했습니다.')}} className="schoollove-focus mt-2 min-h-11 text-sm font-medium text-red-700">내 프로필 삭제</button></>:null}
    </section>

    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">4. 내 학교 이력 <span className="text-sm font-normal text-gray-500">({state.memberships.length}/{membershipLimit})</span></h2>
      {state.memberships.length===0?<p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">아직 저장한 학교 이력이 없습니다.</p>:<ul className="mt-3 space-y-2">{state.memberships.map((membership)=><li key={membership.id} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm"><div className="min-w-0 break-keep"><p>{membership.school?.school_name??'학교'} · {membership.school?.school_type?SCHOOL_TYPE_LABELS[membership.school.school_type as SchoolType]??membership.school.school_type:'학교 유형 미상'} · {membership.school?.sido} {membership.school?.sigungu}</p><p className="mt-1">{membership.graduation_year}년 졸업</p>{membership.class_history.length>0?<p className="mt-1 text-gray-600">{formatGradeClassHistory(membership.class_history)}</p>:null}</div><button type="button" disabled={busy} onClick={()=>void submit('/api/account/memberships',{membership_id:membership.id},'DELETE','학교 이력을 삭제했습니다.')} className="schoollove-focus min-h-11 shrink-0 text-red-700">삭제</button></li>)}</ul>}
      <form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();if(!schoolId){setStatus('검색 결과에서 학교를 선택해 주세요.');setIsError(true);return}if(await submit('/api/account/memberships',{school_id:schoolId,graduation_year:Number(graduationYear),grade_classes:buildGradeClassPayload(gradeClassValues)},'POST','학교 이력을 저장했습니다.')){setSchoolQuery('');setSchoolId('');setSelectedSchoolType(null);setGraduationYear('');setGradeClassValues({})}}}>
        <label htmlFor="school-query" className="block text-sm font-medium text-gray-800">학교 검색</label>
        <input id="school-query" role="combobox" aria-expanded={schoolQuery.trim().length>=2&&schools.results.length>0} aria-controls="school-options" aria-activedescendant={activeSchool>=0?`school-option-${activeSchool}`:undefined} autoComplete="off" value={schoolQuery}
          onChange={(event)=>{setSchoolQuery(event.target.value);setSchoolId('');setSelectedSchoolType(null);setGradeClassValues({});setActiveSchool(-1)}}
          onKeyDown={(event)=>{if(!schools.results.length)return;if(event.key==='ArrowDown'){event.preventDefault();setActiveSchool((value)=>Math.min(schools.results.length-1,value+1))}else if(event.key==='ArrowUp'){event.preventDefault();setActiveSchool((value)=>Math.max(0,value-1))}else if(event.key==='Enter'&&activeSchool>=0){event.preventDefault();chooseSchool(activeSchool)}else if(event.key==='Escape'){setActiveSchool(-1)}}}
          className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/>
        {schoolQuery.trim().length>=2&&schools.status==='ok'&&schools.results.length>0?<div id="school-options" role="listbox" className="max-h-64 overflow-auto rounded-xl border border-gray-200 bg-white p-1">{schools.results.map((school,index)=><button id={`school-option-${index}`} role="option" aria-selected={activeSchool===index} type="button" key={school.id} onMouseDown={(event)=>event.preventDefault()} onClick={()=>chooseSchool(index)} className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm ${activeSchool===index?'bg-gray-100':'hover:bg-gray-50'}`}>{school.school_name} · {school.school_type} · {school.sido} {school.sigungu}</button>)}</div>:null}
        <label className="block text-sm text-gray-700">졸업연도<input type="number" min={1900} max={currentYear} required value={graduationYear} onChange={(event)=>setGraduationYear(event.target.value)} className="schoollove-focus mt-1 min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/></label>
        {selectedGradeNumbers.length>0?<fieldset className="space-y-3 rounded-xl border border-gray-200 p-4"><legend className="px-1 text-sm font-semibold text-gray-900">학년별 반 이력 (선택)</legend><p className="text-xs leading-5 text-gray-600">기억나는 학년의 반만 입력해도 됩니다.</p><div className="grid gap-3 sm:grid-cols-2">{selectedGradeNumbers.map((grade)=><label key={grade} className="text-sm text-gray-700">{grade}학년 반<input type="number" min={1} max={100} value={gradeClassValues[grade]??''} onChange={(event)=>setGradeClassValues((current)=>({...current,[grade]:event.target.value}))} className="schoollove-focus mt-1 min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/></label>)}</div></fieldset>:null}
        <button disabled={busy||!schoolMembershipWritable||!state.profile||state.memberships.length>=membershipLimit||!schoolId} className="schoollove-focus min-h-12 rounded-xl border border-gray-900 px-4 py-3 text-sm font-semibold text-gray-900 disabled:opacity-40">학교 이력 추가</button>
      </form>
    </section>

    <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="text-lg font-bold text-red-950">계정 탈퇴 요청</h2><p className="mt-2 text-sm leading-6 text-red-900">요청 즉시 추가 개인 정보 변경을 차단합니다. 운영 확인 후 공개 계정 데이터를 먼저 삭제하고 Auth identity 실제 삭제를 요청하는 2단계 절차를 사용합니다. Auth 삭제가 실패하면 계정은 차단된 재시도 대기 상태로 남으며 완료로 표시하지 않습니다.</p><p className="mt-2 text-xs text-red-800">처리 상태나 오류 접수는 <Link href="/contact" className="underline">운영자 문의</Link>로 알려 주세요. 완료된 비식별 처리 기록은 재시도·장애 확인 목적의 제한 기간 후 정리됩니다.</p><button type="button" disabled={busy||deletionBlocked} onClick={async()=>{if(window.confirm('탈퇴 요청 후에는 정보 변경이 차단됩니다. 계속할까요?'))await submit('/api/account/deletion-request',{confirm:true},'POST','탈퇴 요청을 접수했습니다.')}} className="schoollove-dark-action schoollove-focus mt-4 min-h-12 rounded-xl bg-red-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{state.deletionStatus==='pending'?'탈퇴 요청 접수됨':state.deletionStatus==='public_data_deleted'?'개인 데이터 삭제 완료 · Auth 삭제 대기':state.deletionStatus==='failed_safe'?'Auth 삭제 재시도 대기':state.deletionStatus==='auth_deletion_pending'?'Auth 삭제 처리 중':state.deletionStatus==='done'?'탈퇴 처리 완료':'계정 탈퇴 요청'}</button></section>

    <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600" aria-label="계정 도움말"><Link href="/privacy" className="underline">개인정보처리방침</Link><Link href="/terms" className="underline">이용약관</Link><Link href="/contact" className="underline">운영자 문의</Link></nav>
    {status?<p role={isError?'alert':'status'} aria-live="polite" className={`schoollove-dark-action sticky bottom-24 z-30 mt-5 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${isError?'bg-red-800':'bg-gray-950'}`}>{status}</p>:null}
  </main>
}
