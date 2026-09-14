'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleHelp, Heart, School, UsersRound, X } from 'lucide-react'

type Props = {
  autoShow: boolean
  adultReady: boolean
  consentsReady: boolean
  profileReady: boolean
  schoolCount: number
  peopleSearchEnabled: boolean
  accountAvailable: boolean
}

const SEEN_KEY = 'schoollove:welcome-guide:v1'
const sections = ['환영', '가입 단계', '학교 상태', '내 연결']

export default function AccountWelcomeGuide({ autoShow, adultReady, consentsReady, profileReady, schoolCount, peopleSearchEnabled, accountAvailable }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const checks = [
    { label: 'Google 계정으로 로그인', ready: true },
    { label: '만 19세 이상 자기진술', ready: adultReady },
    { label: '필수 동의 4개 확인', ready: consentsReady },
    { label: '내 비공개 프로필 만들기', ready: profileReady },
    { label: '내가 다닌 학교 등록', ready: schoolCount > 0 },
  ]
  const completed = checks.filter(item => item.ready).length

  useEffect(() => {
    if (!autoShow) return
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return
      sessionStorage.setItem(SEEN_KEY, '1')
      setOpen(true)
    } catch {
      // A blocked browser store must not prevent account use or manual help.
    }
  }, [autoShow])

  useEffect(() => {
    const modal = dialog.current
    if (!open || !modal) return
    modal.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      modal.close()
      document.body.style.overflow = previousOverflow
      trigger.current?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (open) {
      if (content.current) content.current.scrollTop = 0
      heading.current?.focus({ preventScroll: true })
    }
  }, [open, step])

  function showGuide() {
    setStep(0)
    setOpen(true)
  }

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return <>
    <button ref={trigger} type="button" onClick={showGuide} aria-haspopup="dialog" className="schoollove-focus inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
      <CircleHelp className="h-4 w-4" aria-hidden="true" />이용 안내
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onKeyDown={keepFocusInside} onCancel={event => { event.preventDefault(); setOpen(false) }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-3xl border-0 bg-white p-0 text-gray-950 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm">
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold"><Heart className="h-4 w-4 text-pink-500" fill="currentColor" aria-hidden="true" />SchoolLove <span className="font-normal text-gray-500">이용 안내</span></p>
          <button type="button" onClick={() => setOpen(false)} aria-label="이용 안내 닫기" className="schoollove-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div ref={content} className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <nav aria-label="이용 안내 단계" className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-50 p-1">
            {sections.map((label, index) => <button type="button" key={label} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} className={`schoollove-focus min-h-11 rounded-xl px-1 text-xs font-semibold ${step === index ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:bg-white'}`}>{index + 1}. {label}</button>)}
          </nav>
          <div className="mt-6">
            <p className="text-xs font-semibold tracking-widest text-indigo-600">{String(step + 1).padStart(2, '0')} / 04</p>
            <h2 ref={heading} id={titleId} tabIndex={-1} className="mt-2 text-2xl font-bold leading-snug tracking-tight outline-none">{['스쿨러브아이에 오신 것을 환영해요', '가입은 이렇게 진행해요', '내 학교의 기록과 성장을 확인해요', '수락한 인연은 내 연결에서 만나요'][step]}</h2>
            {step === 0 ? <>
              <div className="mt-5 rounded-2xl bg-gradient-to-br from-indigo-50 via-violet-50 to-pink-50 p-6">
                <School className="h-10 w-10 text-indigo-600" aria-hidden="true" />
                <p className="mt-4 text-lg font-bold text-indigo-950">내 학교를 기록하는 일에서<br />다시 시작해요.</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">비공개 프로필을 만들고 내가 다닌 학교를 남겨 보세요. 학교의 성장과 연결된 사람을 어디서 확인하는지 알려드릴게요.</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-600">안내는 언제든 닫아도 괜찮아요. 내 계정의 ‘이용 안내’에서 다시 볼 수 있어요.</p>
            </> : null}
            {step === 1 ? <>
              <p className="mt-3 text-sm leading-6 text-gray-600">현재 내 기록을 기준으로 <strong className="text-indigo-700">{completed}/5단계</strong>를 완료했어요. 아직 남은 항목은 내 계정에서 이어서 진행해 주세요.</p>
              <ol className="mt-4 space-y-2">{checks.map((item, index) => <li key={item.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${item.ready ? 'bg-indigo-600 text-white' : 'border border-gray-300 bg-white text-gray-600'}`} aria-hidden="true">{item.ready ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className="min-w-0 flex-1 font-medium">{item.label}</span><span className="shrink-0 text-xs text-gray-500">{item.ready ? '완료' : '남음'}</span>
              </li>)}</ol>
              {!accountAvailable ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">현재 계정 정보 저장이 제한되어 있어요. 내 계정의 이용 상태 안내를 확인해 주세요.</p> : null}
            </> : null}
            {step === 2 ? <>
              <div className="mt-4 rounded-2xl bg-indigo-50 p-4"><p className="text-sm font-semibold text-indigo-700">내 학교 등록 상태</p><p className="mt-2 text-xl font-bold text-indigo-950">{schoolCount > 0 ? `${schoolCount}곳의 학교를 기록했어요` : '아직 등록한 학교가 없어요'}</p><p className="mt-2 text-sm leading-6 text-slate-600">{schoolCount > 0 ? '내 계정의 학교 카드에서 학교 정보와 졸업연도, 저장한 학년·반을 확인해요.' : '가입 단계를 따라 내가 다닌 학교를 등록하면 내 학교 카드가 생겨요.'}</p></div>
              <dl className="mt-5 space-y-4 text-sm leading-6"><div><dt className="font-bold">학교 레벨과 진행률</dt><dd className="mt-1 text-gray-600">학교 카드에서 현재 성장과 다음 레벨까지의 진행률을 확인해요. 공개 학교 화면은 집계 시점에 따라 내 계정과 다르게 보일 수 있어요.</dd></div><div><dt className="font-bold">내 학교 이력은 비공개</dt><dd className="mt-1 text-gray-600">졸업연도와 학년·반은 공개 명단에 표시되지 않아요. 학교 레벨이 올라가도 사람 찾기 권한이 자동으로 열리지는 않아요.</dd></div></dl>
            </> : null}
            {step === 3 ? <>
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-indigo-50 p-4"><UsersRound className="mt-1 h-6 w-6 shrink-0 text-indigo-600" aria-hidden="true" /><div><p className="font-bold text-indigo-950">한 사람씩, 서로 수락한 연결</p><p className="mt-2 text-sm leading-6 text-slate-600">안부를 수락하면 ‘내 연결 → 연결된 사람’에 상대 이름과 ‘연결 확인’ 카드가 나타나요. 여러 명과 연결되면 각각의 카드가 표시돼요.</p></div></div>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-600"><li>• 받은 안부, 보낸 안부와 새 소식도 내 연결에서 확인해요.</li><li>• 상대 카드를 누르면 그 사람과의 연결 상세로 이동해요.</li><li>• 연결 수락만으로 메시지나 Instagram이 자동 공개되지는 않아요.</li></ul>
              <p className="mt-4 rounded-xl border border-gray-200 p-3 text-sm leading-6 text-gray-600">{peopleSearchEnabled ? '현재 이 계정은 사람 찾기를 이용할 수 있어요. 상대의 수락이 있어야 연결돼요.' : '사람 찾기와 새 연결 요청은 별도 초대와 운영자 승인 후 이용할 수 있어요.'}</p>
            </> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-white px-5 py-4">
          <button type="button" onClick={() => step === 0 ? setOpen(false) : setStep(step - 1)} className="schoollove-focus inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-gray-600">{step > 0 ? <ArrowLeft className="h-4 w-4" aria-hidden="true" /> : null}{step === 0 ? '나중에 보기' : '이전'}</button>
          <button type="button" onClick={() => step === 3 ? setOpen(false) : setStep(step + 1)} className="schoollove-dark-action schoollove-focus inline-flex min-h-12 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white">{step === 3 ? '내 계정 둘러보기' : '다음'}{step < 3 ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}</button>
        </div>
      </div>
    </dialog>
  </>
}
