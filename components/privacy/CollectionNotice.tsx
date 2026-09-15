import {
  COLLECTION_REFUSAL,
  COLLECTION_SCOPE_NOTICE,
  OPTIONAL_COLLECTION_REFUSAL,
  OPTIONAL_PROFILE_COLLECTION,
  PRIVATE_PROFILE_COLLECTION,
} from '@/lib/privacyNotice'

type Props = { optional?: boolean }

export default function CollectionNotice({ optional = false }: Props) {
  const rows = optional ? OPTIONAL_PROFILE_COLLECTION : PRIVATE_PROFILE_COLLECTION
  return <div className="space-y-4 text-sm leading-6 text-gray-700">
    <dl className="space-y-4">
      {rows.map(row => <div key={row.title} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <dt className="font-bold text-gray-950">{row.title}</dt>
        <dd className="mt-2"><span className="font-semibold">수집 항목: </span>{row.items}</dd>
        <dd className="mt-1"><span className="font-semibold">이용 목적: </span>{row.purpose}</dd>
        <dd className="mt-1"><strong className="text-gray-950">보유·이용 기간: {row.retention}</strong></dd>
      </div>)}
    </dl>
    <p className="font-semibold text-gray-950">{optional ? OPTIONAL_COLLECTION_REFUSAL : COLLECTION_REFUSAL}</p>
    {!optional && <p>{OPTIONAL_COLLECTION_REFUSAL}</p>}
    <p>{COLLECTION_SCOPE_NOTICE}</p>
  </div>
}
