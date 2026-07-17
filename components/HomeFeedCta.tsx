import Link from 'next/link'

interface Props {
  title: string
  buttonLabel: string
  href: string
}

// 피드 안에 자연스럽게 섞이는 CTA. 첫 화면부터 큰 가입 CTA를 띄우지 않고,
// app/page.tsx가 활동을 충분히 보여준 뒤에만 이 컴포넌트를 렌더링한다.
export default function HomeFeedCta({ title, buttonLabel, href }: Props) {
  return (
    <div className="my-8 rounded-2xl border border-dashed border-neutral-200 px-5 py-7 text-center">
      <p className="text-[15px] font-bold leading-relaxed text-neutral-800">{title}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-xl bg-neutral-900 px-6 py-3 text-[14px] font-bold text-white transition active:scale-95"
      >
        {buttonLabel}
      </Link>
    </div>
  )
}
