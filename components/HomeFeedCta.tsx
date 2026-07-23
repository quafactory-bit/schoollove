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
    <div className="my-10 border-y border-schoollove-border py-8 text-center lg:my-12 lg:py-10">
      <p className="text-[16px] font-semibold leading-relaxed text-schoollove-text lg:text-[18px]">{title}</p>
      <Link
        href={href}
        className="schoollove-focus mt-5 inline-flex min-h-12 min-w-[160px] items-center justify-center border border-schoollove-text px-7 text-[15px] text-schoollove-text transition-colors hover:bg-schoollove-text hover:text-schoollove-bg"
      >
        {buttonLabel}
      </Link>
    </div>
  )
}
