import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicSummons } from '@/lib/part2Public'
import { summonsCardTitle } from '@/lib/part2P3'
import { shortSchoolName } from '@/lib/push/contracts'
import PageNav from '@/components/PageNav'
import SummonsPublicActions from '@/components/part2/SummonsPublicActions'

export const dynamic = 'force-dynamic'

const NOINDEX: Metadata['robots'] = { index: false, follow: false, noarchive: true, nocache: true }

interface PageProps { params: Promise<{ code: string }> }

// Part 2 P3: 지명 소환장. Only school, graduation year and the target name. Never the creator, Instagram,
// contact, or whether the person is on the roster. Always noindex. Takedown link is required.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const summons = await getPublicSummons(code)
  if (!summons) return { title: '출석부 알림', robots: NOINDEX }
  const title = summonsCardTitle(shortSchoolName(summons.school_name), summons.graduation_year, summons.target_name)
  return {
    title: { absolute: title },
    description: `${summons.school_name} ${summons.graduation_year}년 졸업 출석부에서 옛 친구를 찾아보세요.`,
    robots: NOINDEX,
    openGraph: { title, url: `/summons/${code}`, siteName: '출석부', locale: 'ko_KR', type: 'website' },
    twitter: { card: 'summary_large_image', title },
  }
}

export default async function SummonsPage({ params }: PageProps) {
  const { code } = await params
  const summons = await getPublicSummons(code)
  if (!summons) notFound()
  const shortName = shortSchoolName(summons.school_name)
  return (
    <main className="mx-auto w-full max-w-content bg-[#fcfaf5] pb-8">
      <PageNav title="출석부 알림" />
      <div className="px-4 pt-2">
        <section aria-labelledby="summons-title" className="rounded-2xl border-[6px] border-[#8b5e34] bg-[#14532d] px-5 py-6 text-[#fcfaf5]">
          <p className="text-[13px] font-black tracking-[1px] text-[#fbbf24]">[출석부 알림]</p>
          <h1 id="summons-title" className="mt-2 break-keep text-[22px] font-black leading-[1.45]">
            {shortName} {summons.graduation_year}년 졸업생 누군가가 ‘{summons.target_name}’님을 찾고 있습니다
          </h1>
          <p className="mt-3 text-[13px] leading-[1.6] text-[#fcfaf5]/80">찾는 사람이 누구인지, 그 사람이 출석부에 있는지는 알려 드리지 않아요.</p>
        </section>
        <Link href={`/school/${encodeURIComponent(summons.school_slug)}/${summons.graduation_year}`} className="btn-primary schoollove-focus mt-4 w-full">
          {shortName} {summons.graduation_year}년 출석부 보러 가기
        </Link>
        <p className="mt-3 text-center text-[12.5px] leading-[1.55] text-sl-ink3">이름은 같은 학교 회원에게만, 인스타 주소는 서로 수락할 때만 보여요. 만 19세 이상.</p>
        <SummonsPublicActions code={code} />
      </div>
    </main>
  )
}
