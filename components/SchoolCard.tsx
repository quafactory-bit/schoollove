import Link from 'next/link'
import { Users, MapPin } from 'lucide-react'
import { schoolTypeBadgeColor, formatNumber, cn } from '@/lib/utils'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import type { School } from '@/types/school'

interface SchoolCardProps {
  school: School
  variant?: 'default' | 'compact'
}

export default function SchoolCard({ school, variant = 'default' }: SchoolCardProps) {
  if (variant === 'compact') {
    return (
      <Link
        href={`/school/${school.slug}`}
        className="block p-3 bg-white border border-gray-200 rounded-xl hover:border-schoollove-electric-blue hover:shadow-card transition-all"
      >
        <div className="flex items-start gap-2">
          <SchoolIcon type={school.school_type} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{school.school_name}</p>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {school.sido} {school.sigungu}
            </p>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/school/${school.slug}`}
      className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-schoollove-electric-blue hover:shadow-card transition-all group"
    >
      <SchoolIcon type={school.school_type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 transition-colors truncate">
            {school.school_name}
          </span>
          <span
            className={cn(
              'text-2xs font-medium px-1.5 py-0.5 rounded border',
              schoolTypeBadgeColor(school.school_type)
            )}
          >
            {SCHOOL_TYPE_LABELS[school.school_type]}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
          <MapPin size={11} />
          <span>{school.sido} {school.sigungu}</span>
          {school.profile_count !== undefined && school.profile_count > 0 && (
            <>
              <span className="mx-1 text-gray-300">·</span>
              <Users size={11} />
              <span>{formatNumber(school.profile_count as number)}명 등록</span>
            </>
          )}
        </div>
      </div>
      <span className="text-gray-400 group-hover:text-schoollove-electric-blue transition-colors text-lg shrink-0">›</span>
    </Link>
  )
}

export function SchoolIcon({
  type,
  size = 'md',
}: {
  type: School['school_type']
  size?: 'sm' | 'md'
}) {
  const emoji: Record<School['school_type'], string> = {
    elementary: '🏫',
    middle: '🏫',
    high: '🎓',
    university: '🎓',
    college: '📚',
  }

  const bgColor: Record<School['school_type'], string> = {
    elementary: 'bg-schoollove-surface-subtle',
    middle: 'bg-schoollove-surface-subtle',
    high: 'bg-schoollove-surface-subtle',
    university: 'bg-schoollove-surface-subtle',
    college: 'bg-schoollove-surface-subtle',
  }

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center shrink-0',
        bgColor[type],
        size === 'sm' ? 'w-8 h-8 text-base' : 'w-10 h-10 text-xl'
      )}
    >
      {emoji[type]}
    </div>
  )
}
