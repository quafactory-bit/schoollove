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
import SchoolSelection from '@/components/growth/SchoolSelection'
import { clearSchoolIntent } from '@/lib/policy/schoolJourney'
import GameHeader from '@/components/game/GameHeader'
import AccountWelcomeGuide from '@/components/account/AccountWelcomeGuide'
import CollectionNotice from '@/components/privacy/CollectionNotice'

type Props={state:AccountState;launch:PublicAccountLaunch;controlledBetaAccess:boolean;peopleSearchBetaAccess?:boolean;instagramBetaAccess:boolean;betaOnboardingState:BetaOnboardingState;currentYear:number;selectionOwner?:string}

async function readResult(response:Response):Promise<{error?:string}>{
  try{return await response.json() as {error?:string}}catch{return {}}
}

export default function AccountClient({state,launch,controlledBetaAccess,peopleSearchBetaAccess=false,instagramBetaAccess,betaOnboardingState,currentYear,selectionOwner}:Props){
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
  const [schoolRosterConsent,setSchoolRosterConsent]=useState(true)
  const [activeSchool,setActiveSchool]=useState(-1)
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
      if(endpoint==='/api/account/memberships' && method==='POST') clearSchoolIntent()
      setStatus(success);router.refresh();return true
    }catch{setStatus('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');setIsError(true);return false}
    finally{setBusy(false)}
  }

  function chooseSchool(index:number){
    const school=schools.results[index]
    if(!school)return
    setSchoolId(school.id);setSelectedSchoolType(school.school_type);setGradeClassValues({});setSchoolQuery(`${school.school_name} · ${school.school_type} · ${school.sido} ${school.sigungu}`);setActiveSchool(-1)
  }

  return <main className="growth-journey sl-game sl-account mx-auto max-w-4xl px-5 pb-8">
    <GameHeader />
    <div className="mb-3 flex justify-end"><AccountWelcomeGuide autoShow={launch.registrationEnabled && !launch.emergencyStopped && !deletionBlocked && !onboardingComplete} adultReady={state.adultEligible} consentsReady={state.consentsComplete} profileReady={Boolean(state.profile)} schoolCount={state.memberships.length} peopleSearchEnabled={peopleSearchBetaAccess && !launch.emergencyStopped && !deletionBlocked} accountAvailable={privateProfileWritable && schoolMembershipWritable}/></div>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1">
      {!onboardingComplete && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--schoollove-game-accent)]">MY SCHOOL, NEXT LEVEL</p>}
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">내 계정</h1>
      <p className="mt-2 text-sm text-gray-600">Google 계정으로 로그인됨</p>
      {launch.registrationEnabled && !launch.emergencyStopped ? <p className="mt-3 text-sm leading-6 text-gray-600">스쿨러브아이는 현재 운영 중입니다. 친구가 나를 찾을 수 있도록 전체 이름과 학교를 등록하세요. 학교 명단 표시는 등록 전에 해제할 수 있고, 인스타그램주소는 내가 허용한 연결 상대에게만 보여요.</p> : null}
      {!onboardingComplete && <p className="mt-1 text-xs text-gray-500">로그인 세션은 서버에서 검증하며 만료 시 다시 로그인해야 할 수 있습니다.</p>}
    </div><button type="button" disabled={busy} onClick={async()=>{clearSchoolIntent();await fetch('/api/auth/logout',{method:'POST'}).catch(()=>undefined);router.push('/login');router.refresh()}}
      className="schoollove-focus min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">로그아웃</button></div>

    {onboardingComplete && <MySchoolsPanel memberships={state.memberships} classHistoryWritable={classHistoryWritable} peopleSearchEnabled={peopleSearchBetaAccess && !launch.emergencyStopped && !deletionBlocked}/>}
    <details open={!onboardingComplete} className="mt-5"><summary className="schoollove-focus min-h-12 cursor-pointer rounded-xl border border-gray-200 px-4 py-3 font-semibold">내 계정 준비 상태</summary><section className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3" aria-label="온보딩 진행 상태">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-gray-900">온보딩 진행</span><span>{onboardingCompleted}/5 · {onboardingCompleted*20}%</span></div>
      <Link href="/onboarding" className="schoollove-focus mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-gray-900 underline">온보딩 진행 상태 보기</Link>
      {onboardingComplete?<div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3"><p className="font-semibold text-emerald-900">계정 준비 완료</p><p className="mt-1 text-xs leading-5 text-emerald-800">성인 확인, 필수 동의, 프로필과 학교 이력을 모두 저장했습니다. 같은 학교 명단과 정확한 사람 찾기를 바로 이용할 수 있습니다.</p></div>:null}
    </section></details>
      {!onboardingComplete && <MySchoolsPanel memberships={state.memberships} classHistoryWritable={classHistoryWritable} peopleSearchEnabled={peopleSearchBetaAccess && !launch.emergencyStopped && !deletionBlocked}/>}
    {!onboardingComplete && <p className="mt-5 text-sm font-semibold text-[var(--schoollove-game-accent)]">{!state.adultEligible?'다음 단계 · 성인 확인':!state.consentsComplete?'다음 단계 · 필수 동의':!state.profile?'다음 단계 · 내 프로필':'다음 단계 · 내가 다닌 학교 등록'}</p>}
    <SchoolSelection owner={selectionOwner} registeredSlugs={state.memberships.flatMap(m => m.school?.slug ? [m.school.slug] : [])} writable={schoolMembershipWritable && Boolean(state.profile) && state.memberships.length < membershipLimit} hasInput={Boolean(schoolQuery || schoolId || graduationYear || Object.values(gradeClassValues).some(Boolean))} onSelect={school => {setSchoolId(school.id);setSelectedSchoolType(school.school_type);setSchoolQuery(`${school.school_name} · ${SCHOOL_TYPE_LABELS[school.school_type]} · ${school.sido} ${school.sigungu}`)}} />
    {!accountWritable&&!classHistoryWritable&&!deletionBlocked ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" role="status">현재 계정 정보를 저장하거나 변경할 수 없습니다. 저장된 본인 정보 조회와 삭제·탈퇴 요청은 계속할 수 있습니다.</p>:null}
    {deletionBlocked ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900" role="status">{state.deletionStatus==='pending'?'탈퇴 요청이 접수되어 추가 정보 변경을 차단했습니다.':state.deletionStatus==='done'?'탈퇴 처리가 완료되었습니다.':'개인 데이터 삭제 또는 Auth identity 삭제를 진행 중이며 개인 기능 접근을 차단했습니다.'}</p>:null}

    <details open={!onboardingComplete || Boolean(schoolId)} className="mt-6"><summary className="schoollove-focus min-h-12 cursor-pointer rounded-xl border border-schoollove-border px-4 py-3 font-semibold">계정 정보 관리 · 프로필·학교·탈퇴</summary>
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">1. 만 19세 이상 확인</h2>
      {state.adultEligible?<p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">현재 정책 기준 성인 확인 완료</p>:<form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();await submit('/api/account/eligibility',{dateOfBirth:birthDate})}}>
        <label htmlFor="birth-date" className="block text-sm font-medium text-gray-800">생년월일</label>
        <input id="birth-date" type="date" required value={birthDate} onChange={(event)=>setBirthDate(event.target.value)} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3" />
        <p className="text-xs leading-5 text-gray-500">KST 만 나이 판정에만 사용하며 원본 생년월일은 DB나 로그에 저장하지 않습니다. 자기진술은 신분증 기반의 강한 본인확인이 아닙니다.</p>
        <button disabled={busy||!privateProfileWritable} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">만 19세 이상 확인</button>
      </form>}
    </section>

    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">2. 필수 동의</h2>
      <div className="mt-4" id="account-collection-notice"><CollectionNotice /></div>
      {state.consentsComplete?<p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">현재 정책 버전의 필수 동의 완료</p>:<form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();await submit('/api/account/consents',consents)}}>
        {([
          ['terms',<> <Link href="/terms" className="underline">이용약관</Link>에 동의합니다.</>],
          ['privacy_collection',<> 위 수집 항목·이용 목적·보유기간·동의 거부 안내를 확인하고 <Link href="/privacy#collection" className="underline">필수 개인정보 수집·이용</Link>에 동의합니다.</>],
          ['adult_confirmation',<>만 19세 이상이며 본인 정보만 등록합니다.</>],
          ['private_by_default',<>소개·인스타그램주소 등 프로필 정보는 기본 비공개이며, 학교 등록 단계에서 명단 표시 여부를 선택하고 정확히 일치하는 조건으로만 연결을 요청할 수 있음을 확인했습니다.</>],
        ] as const).map(([key,label])=><label key={key} className="flex min-h-11 items-start gap-3 text-sm text-gray-700"><input type="checkbox" required checked={consents[key]} onChange={(event)=>setConsents((current)=>({...current,[key]:event.target.checked}))} className="mt-0.5 h-5 w-5"/><span>{label}</span></label>)}
        <button disabled={busy||!privateProfileWritable||!state.adultEligible} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">필수 동의 4개 기록</button>
      </form>}
    </section>

    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">3. 내 프로필</h2>
      <details className="mt-3 rounded-xl border border-gray-200 p-4"><summary className="schoollove-focus cursor-pointer font-semibold">선택 정보 수집·이용 안내 · 입력하지 않아도 가입할 수 있어요</summary><div className="mt-3"><CollectionNotice optional /></div></details>
      <p className="mt-2 text-sm leading-6 text-gray-600">프로필의 소개와 인스타그램주소는 비공개입니다. 학교 등록 단계에서 명단 표시에 직접 동의하면 입력한 전체 이름·졸업연도·학년별 반이 같은 학교 명단 참여자에게 표시됩니다. 이 이름은 신분증으로 확인한 실명이 아니라 본인이 입력한 이름입니다. 인스타그램주소는 연결 후 상대별 공개 승인 없이는 보이지 않습니다. 프로필 사진은 받지 않습니다.</p>
      <form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();await submit('/api/account/profile',{display_name:displayName,instagram_handle:instagram||null,introduction:introduction||null})}}>
        <label htmlFor="display-name" className="block text-sm font-medium text-gray-800">전체 이름</label><input id="display-name" required minLength={2} maxLength={50} disabled={!privateProfileWritable} value={displayName} onChange={(event)=>setDisplayName(event.target.value)} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"/>
        <label htmlFor="instagram" className="block text-sm font-medium text-gray-800">인스타그램주소 (아이디만 입력·선택·비공개)</label><input id="instagram" maxLength={30} pattern="[A-Za-z0-9._]{1,30}" disabled={!privateProfileWritable&&!instagramHandleSetWritable} value={instagram} onChange={(event)=>setInstagram(event.target.value.replace(/^@/,''))} className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"/>
        <label htmlFor="introduction" className="block text-sm font-medium text-gray-800">소개 (선택·비공개)</label><textarea id="introduction" maxLength={300} disabled={!privateProfileWritable} value={introduction} onChange={(event)=>setIntroduction(event.target.value)} className="schoollove-focus min-h-24 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"/>
        <button disabled={busy||!privateProfileWritable||!state.adultEligible||!state.consentsComplete} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{state.profile?'내 프로필 수정 저장':'내 프로필 저장'}</button>
      </form>
      {state.profile&&(instagramHandleSetWritable||instagramHandleClearWritable)?<div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"><p className="text-xs leading-5 text-gray-600">이 동작은 인스타그램주소만 저장하거나 삭제하며 이름·소개·학교 이력은 변경하지 않습니다.</p>{instagramHandleSetWritable?<button type="button" disabled={busy} onClick={()=>void submit('/api/account/instagram',{instagram_handle:instagram||null},'PATCH',instagram?'인스타그램주소를 저장했습니다.':'인스타그램주소를 삭제했습니다.')} className="schoollove-focus mt-2 min-h-11 rounded-lg border border-gray-900 px-3 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40">{instagram?'인스타그램주소 저장':'인스타그램주소 삭제'}</button>:<button type="button" disabled={busy} onClick={()=>void submit('/api/account/instagram',{instagram_handle:null},'PATCH','인스타그램주소를 삭제했습니다.')} className="schoollove-focus mt-2 min-h-11 text-sm font-medium text-red-700 disabled:opacity-40">인스타그램주소 삭제</button>}</div>:null}
      {state.profile?<><p className="mt-4 text-xs leading-5 text-gray-500">프로필을 삭제하면 연결된 학교 이력도 함께 삭제됩니다.</p><button type="button" disabled={busy} onClick={async()=>{if(window.confirm('내 프로필과 연결된 학교 이력을 모두 삭제할까요?'))await submit('/api/account/profile',{},'DELETE','내 프로필과 학교 이력을 삭제했습니다.')}} className="schoollove-focus mt-2 min-h-11 text-sm font-medium text-red-700">내 프로필 삭제</button></>:null}
    </section>

    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold text-gray-950">4. 내 학교 이력 <span className="text-sm font-normal text-gray-500">({state.memberships.length}/{membershipLimit})</span></h2>
      {state.memberships.length===0?<p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">아직 저장한 학교 이력이 없습니다.</p>:<ul className="mt-3 space-y-2">{state.memberships.map((membership)=><li key={membership.id} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm"><div className="min-w-0 break-words"><p>{membership.school?.school_name??'학교'} · {membership.school?.school_type?SCHOOL_TYPE_LABELS[membership.school.school_type as SchoolType]??membership.school.school_type:'학교 유형 미상'} · {membership.school?.sido} {membership.school?.sigungu}</p><p className="mt-1">{membership.graduation_year}년 졸업</p>{membership.class_history.length>0?<p className="mt-1 text-gray-600">{formatGradeClassHistory(membership.class_history)}</p>:null}<p className={`mt-2 font-semibold ${membership.roster_visible?'text-emerald-700':'text-gray-600'}`}>{membership.roster_visible?'학교 명단에 표시 중':'학교 명단에서 숨김'}</p><button type="button" disabled={busy} onClick={()=>void submit('/api/account/memberships',{membership_id:membership.id,visible:!membership.roster_visible},'PATCH',membership.roster_visible?'학교 명단에서 숨겼습니다.':'학교 명단 표시를 시작했습니다.')} className="schoollove-focus mt-1 min-h-11 text-sm font-semibold underline">{membership.roster_visible?'명단에서 숨기기':'명단에 다시 표시하기'}</button></div><button type="button" disabled={busy} onClick={()=>void submit('/api/account/memberships',{membership_id:membership.id},'DELETE','학교 이력을 삭제했습니다.')} className="schoollove-focus min-h-11 shrink-0 text-red-700">삭제</button></li>)}</ul>}
      <form className="mt-4 space-y-3" onSubmit={async(event)=>{event.preventDefault();if(!schoolId){setStatus('검색 결과에서 학교를 선택해 주세요.');setIsError(true);return}if(await submit('/api/account/memberships',{school_id:schoolId,graduation_year:Number(graduationYear),grade_classes:buildGradeClassPayload(gradeClassValues),show_in_school_roster:schoolRosterConsent},'POST',schoolRosterConsent?'학교 이력을 저장하고 학교 명단 표시를 시작했습니다.':'학교 이력을 비공개로 저장했습니다.')){setSchoolQuery('');setSchoolId('');setSelectedSchoolType(null);setGraduationYear('');setGradeClassValues({});setSchoolRosterConsent(true)}}}>
        <label htmlFor="school-query" className="block text-sm font-medium text-gray-800">학교 검색</label>
        <input id="school-query" role="combobox" aria-expanded={schoolQuery.trim().length>=2&&schools.results.length>0} aria-controls="school-options" aria-activedescendant={activeSchool>=0?`school-option-${activeSchool}`:undefined} autoComplete="off" value={schoolQuery}
          onChange={(event)=>{setSchoolQuery(event.target.value);setSchoolId('');setSelectedSchoolType(null);setGradeClassValues({});setActiveSchool(-1)}}
          onKeyDown={(event)=>{if(!schools.results.length)return;if(event.key==='ArrowDown'){event.preventDefault();setActiveSchool((value)=>Math.min(schools.results.length-1,value+1))}else if(event.key==='ArrowUp'){event.preventDefault();setActiveSchool((value)=>Math.max(0,value-1))}else if(event.key==='Enter'&&activeSchool>=0){event.preventDefault();chooseSchool(activeSchool)}else if(event.key==='Escape'){setActiveSchool(-1)}}}
          className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/>
        {schoolQuery.trim().length>=2&&schools.status==='ok'&&schools.results.length>0?<div id="school-options" role="listbox" className="max-h-64 overflow-auto rounded-xl border border-gray-200 bg-white p-1">{schools.results.map((school,index)=><button id={`school-option-${index}`} role="option" aria-selected={activeSchool===index} type="button" key={school.id} onMouseDown={(event)=>event.preventDefault()} onClick={()=>chooseSchool(index)} className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm ${activeSchool===index?'bg-gray-100':'hover:bg-gray-50'}`}>{school.school_name} · {school.school_type} · {school.sido} {school.sigungu}</button>)}</div>:null}
        <label className="block text-sm text-gray-700">졸업연도<input type="number" min={1900} max={currentYear} required value={graduationYear} onChange={(event)=>setGraduationYear(event.target.value)} className="schoollove-focus mt-1 min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/></label>
        {selectedGradeNumbers.length>0?<fieldset className="space-y-3 rounded-xl border border-gray-200 p-4"><legend className="px-1 text-sm font-semibold text-gray-900">학년별 반 이력 (선택)</legend><p className="text-xs leading-5 text-gray-600">기억나는 학년의 반만 입력해도 됩니다.</p><div className="grid gap-3 sm:grid-cols-2">{selectedGradeNumbers.map((grade)=><label key={grade} className="text-sm text-gray-700">{grade}학년 반<input type="number" min={1} max={100} value={gradeClassValues[grade]??''} onChange={(event)=>setGradeClassValues((current)=>({...current,[grade]:event.target.value}))} className="schoollove-focus mt-1 min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3"/></label>)}</div></fieldset>:null}
        <div className="rounded-xl border border-pink-200 bg-pink-50 p-4"><p className="text-sm font-semibold text-gray-950">학교에서 나를 표시하기</p><p className="mt-2 text-xs leading-5 text-gray-700">체크를 유지하면 입력한 전체 이름, 졸업연도, 저장한 학년별 반이 같은 학교에 등록하고 명단 공개에 동의한 만 19세 이상 회원에게 자동 표시됩니다. 공개 인터넷·검색엔진·인스타그램에는 표시되지 않습니다. 학교 이력을 삭제하거나 위의 ‘명단에서 숨기기’를 누를 때까지 표시됩니다.</p><label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-gray-800"><input type="checkbox" checked={schoolRosterConsent} onChange={(event)=>setSchoolRosterConsent(event.target.checked)} className="mt-0.5 h-5 w-5"/><span>학교 명단에 전체 이름·졸업연도·저장한 반을 표시합니다.</span></label><p className="mt-2 text-xs leading-5 text-gray-600">체크를 풀어도 학교는 등록할 수 있습니다. 이 경우 명단에 표시되지 않으며 학교 명단 열람과 사람 찾기는 이용할 수 없습니다.</p></div>
        <button disabled={busy||!schoolMembershipWritable||!state.profile||state.memberships.length>=membershipLimit||!schoolId} className="schoollove-focus min-h-12 rounded-xl border border-gray-900 px-4 py-3 text-sm font-semibold text-gray-900 disabled:opacity-40">학교 이력 추가</button>
      </form>
    </section>

    <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="text-lg font-bold text-red-950">계정 탈퇴 요청</h2><p className="mt-2 text-sm leading-6 text-red-900">요청 즉시 추가 개인 정보 변경을 차단합니다. 운영 확인 후 공개 계정 데이터를 먼저 삭제하고 Auth identity 실제 삭제를 요청하는 2단계 절차를 사용합니다. Auth 삭제가 실패하면 계정은 차단된 재시도 대기 상태로 남으며 완료로 표시하지 않습니다.</p><p className="mt-2 text-xs text-red-800">처리 상태나 오류 접수는 <Link href="/contact" className="underline">운영자 문의</Link>로 알려 주세요. 완료된 비식별 처리 기록은 재시도·장애 확인 목적의 제한 기간 후 정리됩니다.</p><button type="button" disabled={busy||deletionBlocked} onClick={async()=>{if(window.confirm('탈퇴 요청 후에는 정보 변경이 차단됩니다. 계속할까요?'))await submit('/api/account/deletion-request',{confirm:true},'POST','탈퇴 요청을 접수했습니다.')}} className="schoollove-dark-action schoollove-focus mt-4 min-h-12 rounded-xl bg-red-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{state.deletionStatus==='pending'?'탈퇴 요청 접수됨':state.deletionStatus==='public_data_deleted'?'개인 데이터 삭제 완료 · Auth 삭제 대기':state.deletionStatus==='failed_safe'?'Auth 삭제 재시도 대기':state.deletionStatus==='auth_deletion_pending'?'Auth 삭제 처리 중':state.deletionStatus==='done'?'탈퇴 처리 완료':'계정 탈퇴 요청'}</button></section>

    </details>
    <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600" aria-label="계정 도움말"><Link href="/privacy" className="underline">개인정보처리방침</Link><Link href="/terms" className="underline">이용약관</Link><Link href="/contact" className="underline">운영자 문의</Link></nav>
    {status?<p role={isError?'alert':'status'} aria-live="polite" className={`schoollove-dark-action sticky bottom-24 z-30 mt-5 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${isError?'bg-red-800':'bg-gray-950'}`}>{status}</p>:null}
  </main>
}
