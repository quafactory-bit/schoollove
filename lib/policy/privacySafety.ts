import type { Metadata } from 'next'
import type { SchoolType } from '@/types/school'

/**
 * PHASE 10A emergency boundary.
 *
 * Authentication, adult eligibility and profile ownership do not exist yet, so
 * no environment variable may reopen public profile registration. PHASE 10B
 * must replace this hard lock only after those controls are implemented.
 */
export function isPublicProfileRegistrationEnabled(_configuredValue?: string): boolean {
  return false
}

export function getKoreanCalendarYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).format(now)
  return Number(year)
}

export function isFutureGraduationYear(year: number, now: Date = new Date()): boolean {
  return !Number.isFinite(year) || year > getKoreanCalendarYear(now)
}

export function isPublicSafeGraduationYear(year: number | null | undefined, now: Date = new Date()): boolean {
  return typeof year === 'number' && Number.isInteger(year) && !isFutureGraduationYear(year, now)
}

export function isPublicGrowthSchoolType(type: SchoolType | null | undefined): boolean {
  return type === 'high' || type === 'university' || type === 'college'
}

export function isMinorLikelySchoolType(type: SchoolType | null | undefined): boolean {
  return type === 'elementary' || type === 'middle'
}

export type SensitivePublicRoute = 'search' | 'submit' | 'year' | 'class' | 'profile' | 'invite' | 'connection'

export const PRIVATE_ROUTE_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  noarchive: true,
  googleBot: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

export function getPublicRouteRobots(route: 'school' | SensitivePublicRoute): NonNullable<Metadata['robots']> {
  if (route === 'school') {
    return { index: true, follow: true }
  }
  return PRIVATE_ROUTE_ROBOTS
}
