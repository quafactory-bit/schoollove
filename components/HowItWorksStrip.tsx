import { ChevronRight } from 'lucide-react'

// v2-04: 서비스 설명 4칸 띠 (목업 1번). 학교 찾고 › 졸업연도 고르고 › 이름 확인하고 › 인스타 서로 수락
export const HOW_IT_WORKS_STEPS = [
  { title: '학교', note: '찾고' },
  { title: '졸업연도', note: '고르고' },
  { title: '이름', note: '확인하고' },
  { title: '인스타', note: '서로 수락' },
] as const

export default function HowItWorksStrip() {
  return (
    <ol aria-label="이용 방법" className="mt-3.5 flex items-center rounded-[14px] bg-sl-bg2 px-2 py-2.5">
      {HOW_IT_WORKS_STEPS.map((step, index) => (
        <li key={step.title} className="flex min-w-0 flex-1 items-center">
          <span className="flex-1 text-center text-[12.5px] font-extrabold text-sl-ink">
            {step.title}
            <small className="mt-0.5 block text-[10.5px] font-semibold text-sl-ink3">{step.note}</small>
          </span>
          {index < HOW_IT_WORKS_STEPS.length - 1 ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sl-ink3" /> : null}
        </li>
      ))}
    </ol>
  )
}
