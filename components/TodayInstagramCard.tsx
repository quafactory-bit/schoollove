import { ExternalLink } from 'lucide-react'
import type { PublicPromotion } from '@/lib/promotions'
import PromotionImpression from './PromotionImpression'

export default function TodayInstagramCard({ promotion }: { promotion: PublicPromotion }) {
  return (
    <aside className="overflow-hidden border border-schoollove-border bg-white" aria-label={promotion.label}>
      {promotion.kind === 'sponsored' ? <PromotionImpression placementId={promotion.placementId} /> : null}
      <div className="grid sm:grid-cols-[180px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={promotion.imageUrl} alt="" className="aspect-square h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        <div className="p-5 sm:p-6">
          <p className="text-[11px] font-bold tracking-[0.14em] text-gray-500">{promotion.label}</p>
          <p className="mt-2 text-sm font-semibold text-gray-700">@{promotion.accountName}</p>
          <h2 className="mt-3 text-xl font-bold text-gray-950">{promotion.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{promotion.body}</p>
          <a href={promotion.clickHref} target="_blank" rel={promotion.kind === 'sponsored' ? 'noopener noreferrer sponsored' : 'noopener noreferrer'} className="schoollove-focus mt-5 inline-flex min-h-11 items-center gap-2 bg-gray-950 px-4 text-sm font-semibold text-white">
            Instagram 보기 <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          {promotion.kind === 'sponsored' ? <p className="mt-3 text-[11px] text-gray-500">유료 프로모션 · 서비스의 추천이나 학교의 공식 인증이 아닙니다.</p> : null}
        </div>
      </div>
    </aside>
  )
}
