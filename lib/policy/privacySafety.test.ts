import { describe, expect, it } from 'vitest'
import {
  getKoreanCalendarYear,
  getPublicRouteRobots,
  isFutureGraduationYear,
  isMinorLikelySchoolType,
  isPublicGrowthSchoolType,
  isPublicProfileRegistrationEnabled,
  isPublicSafeGraduationYear,
} from './privacySafety'

describe('PHASE 10A registration lock', () => {
  it('환경변수가 없거나 true여도 인증·소유권 전에는 항상 차단한다', () => {
    expect(isPublicProfileRegistrationEnabled()).toBe(false)
    expect(isPublicProfileRegistrationEnabled('false')).toBe(false)
    expect(isPublicProfileRegistrationEnabled('true')).toBe(false)
  })
})

describe('KST graduation-year safety', () => {
  const kstNewYear = new Date('2025-12-31T15:00:00.000Z')

  it('한국 시간 기준 연도를 사용한다', () => {
    expect(getKoreanCalendarYear(kstNewYear)).toBe(2026)
  })

  it('현재 연도보다 큰 졸업연도는 공개 안전 값이 아니다', () => {
    expect(isFutureGraduationYear(2027, kstNewYear)).toBe(true)
    expect(isPublicSafeGraduationYear(2027, kstNewYear)).toBe(false)
    expect(isPublicSafeGraduationYear(2026, kstNewYear)).toBe(true)
  })
})

describe('school type and indexing safety', () => {
  it('신뢰 가능한 school_type으로 초등·중등을 공개 성장 대상에서 제외한다', () => {
    expect(isMinorLikelySchoolType('elementary')).toBe(true)
    expect(isMinorLikelySchoolType('middle')).toBe(true)
    expect(isPublicGrowthSchoolType('elementary')).toBe(false)
    expect(isPublicGrowthSchoolType('middle')).toBe(false)
    expect(isPublicGrowthSchoolType(undefined)).toBe(false)
    expect(isPublicGrowthSchoolType('high')).toBe(true)
  })

  it('개인 관련 route는 noindex/nofollow/noarchive다', () => {
    for (const route of ['search', 'submit', 'year', 'class', 'profile', 'invite', 'connection'] as const) {
      const robots = getPublicRouteRobots(route)
      expect(robots).toMatchObject({ index: false, follow: false, noarchive: true })
    }
    expect(getPublicRouteRobots('school')).toMatchObject({ index: true, follow: true })
  })
})
