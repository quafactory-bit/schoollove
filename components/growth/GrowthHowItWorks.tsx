import Link from 'next/link'

export default function GrowthHowItWorks() {
  return <section className="rounded-2xl bg-[var(--schoollove-game-surface)] p-5 sm:p-8" aria-labelledby="growth-how">
    <p className="text-xs font-semibold tracking-widest text-[var(--schoollove-game-accent)]">작은 시작, 학교의 다음 레벨</p>
    <h2 id="growth-how" className="mt-2 text-2xl font-bold">내 학교를 키우는 세 걸음</h2>
    <ol className="mt-6 grid gap-5 sm:grid-cols-3">
      {[
        ['01', '내 학교 등록', '만 19세 이상 본인이 다닌 학교를 등록해요. 해당 학교의 첫 참여 조건을 충족하면 +100 XP. 기존 등록에는 다시 지급하지 않아요.'],
        ['02', '성장 확인', '내 계정에서 학교의 실시간 성장과 다음 레벨을 확인해요. 공개 순위는 개인 참여가 드러나지 않도록 모아서 반영해요.'],
        ['03', '친구와 함께', '공유할 내용을 확인하고 친구에게 전해요. 조건을 충족한 신규 같은 학교 친구의 추천 가입은 +50 XP. 링크 복사만으로 지급되지는 않아요.'],
      ].map(([n,title,text]) => <li key={n}><span className="text-sm font-bold text-[var(--schoollove-game-accent)]">{n}</span><h3 className="mt-2 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-schoollove-secondary">{text}</p></li>)}
    </ol>
    <Link href="/search" className="schoollove-focus mt-5 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">내 학교부터 찾아보기</Link>
  </section>
}
