import type { SchoolMembership } from '@/lib/account'
import { buildSchoolPath } from '@/lib/seo'
import { SCHOOL_TYPE_LABELS, type SchoolType } from '@/types/school'

export type MySchoolCard = {
  id: string
  schoolName: string
  schoolType: string | null
  region: string | null
  graduationYear: number
  classNumber: number | null
  href: string | null
}

export function buildSafeMySchoolHref(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug.length === 0) return null
  if (slug === '.' || slug === '..' || slug.includes('/') || slug.includes('\\')) return null

  try {
    return buildSchoolPath(encodeURIComponent(slug))
  } catch {
    return null
  }
}

export function buildMySchoolCards(memberships: SchoolMembership[]): MySchoolCard[] {
  return memberships.map((membership) => ({
    id: membership.id,
    schoolName: membership.school?.school_name ?? '학교 정보 확인 필요',
    schoolType: membership.school?.school_type
      ? SCHOOL_TYPE_LABELS[membership.school.school_type as SchoolType] ?? membership.school.school_type
      : null,
    region: membership.school
      ? [membership.school.sido, membership.school.sigungu].filter(Boolean).join(' ') || null
      : null,
    graduationYear: membership.graduation_year,
    classNumber: membership.class_number,
    href: buildSafeMySchoolHref(membership.school?.slug),
  }))
}
