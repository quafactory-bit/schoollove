import { describe, expect, it } from 'vitest'
import {
  aggregateClassCounts,
  classifyYearState,
  filterProfilesByNickname,
  normalizeYearSearchQuery,
  pickMostActiveClass,
  pickMostRecentRegistration,
  type YearHubProfile,
} from './yearHub'

function profile(overrides: Partial<YearHubProfile> & { id: string }): YearHubProfile {
  return {
    nickname: '테스트',
    grade: 1,
    class_number: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('normalizeYearSearchQuery', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeYearSearchQuery('  민준  ')).toBe('민준')
  })

  it('내부 공백도 제거한다(공백 정규화)', () => {
    expect(normalizeYearSearchQuery('김 민준')).toBe('김민준')
  })

  it('영문 대소문자를 무관하게 만든다', () => {
    expect(normalizeYearSearchQuery('MinJun')).toBe('minjun')
  })
})

describe('filterProfilesByNickname', () => {
  const profiles = [
    profile({ id: 'p1', nickname: '김민준' }),
    profile({ id: 'p2', nickname: '이서연' }),
    profile({ id: 'p3', nickname: '민준이형' }),
  ]

  it('빈 검색어면 전체 목록을 그대로 반환한다(검색어 없을 때 전체 명단 표시)', () => {
    expect(filterProfilesByNickname(profiles, '')).toEqual(profiles)
    expect(filterProfilesByNickname(profiles, '   ')).toEqual(profiles)
  })

  it('완전 일치하는 닉네임을 찾는다', () => {
    const result = filterProfilesByNickname(profiles, '이서연')
    expect(result.map((p) => p.id)).toEqual(['p2'])
  })

  it('부분 일치하는 닉네임을 모두 찾는다(한글 부분 일치)', () => {
    const result = filterProfilesByNickname(profiles, '민준')
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
  })

  it('공백이 섞인 검색어도 정규화 후 매칭한다', () => {
    const result = filterProfilesByNickname(profiles, '  민 준  ')
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
  })

  it('영문 닉네임은 대소문자와 무관하게 매칭한다', () => {
    const withEnglish = [profile({ id: 'p4', nickname: 'MinJun' })]
    expect(filterProfilesByNickname(withEnglish, 'minjun').map((p) => p.id)).toEqual(['p4'])
    expect(filterProfilesByNickname(withEnglish, 'MINJUN').map((p) => p.id)).toEqual(['p4'])
  })

  it('일치하는 닉네임이 없으면 빈 배열을 반환한다(0건 상태)', () => {
    expect(filterProfilesByNickname(profiles, '존재하지않는이름')).toEqual([])
  })

  it('빈 프로필 목록에서도 예외 없이 빈 배열을 반환한다', () => {
    expect(filterProfilesByNickname([], '아무개')).toEqual([])
    expect(filterProfilesByNickname([], '')).toEqual([])
  })
})

describe('aggregateClassCounts', () => {
  it('같은 학년·반끼리 인원을 집계한다', () => {
    const profiles = [
      profile({ id: 'p1', grade: 1, class_number: 1 }),
      profile({ id: 'p2', grade: 1, class_number: 1 }),
      profile({ id: 'p3', grade: 1, class_number: 2 }),
    ]
    const result = aggregateClassCounts(profiles)
    expect(result).toEqual([
      { grade: 1, classNumber: 1, count: 2, mostRecentCreatedAt: '2026-01-01T00:00:00.000Z' },
      { grade: 1, classNumber: 2, count: 1, mostRecentCreatedAt: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('학년 오름차순 → 반 번호 오름차순으로 결정적으로 정렬한다', () => {
    const profiles = [
      profile({ id: 'p1', grade: 2, class_number: 1 }),
      profile({ id: 'p2', grade: 1, class_number: 3 }),
      profile({ id: 'p3', grade: 1, class_number: 1 }),
    ]
    const result = aggregateClassCounts(profiles)
    expect(result.map((c) => `${c.grade}-${c.classNumber}`)).toEqual(['1-1', '1-3', '2-1'])
  })

  it('grade 또는 class_number가 null인 프로필(대학교 등)은 집계에서 제외한다', () => {
    const profiles = [
      profile({ id: 'p1', grade: null, class_number: null }),
      profile({ id: 'p2', grade: 1, class_number: null }),
      profile({ id: 'p3', grade: 1, class_number: 1 }),
    ]
    const result = aggregateClassCounts(profiles)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ grade: 1, classNumber: 1, count: 1 })
  })

  it('같은 반 안에서 가장 최근 created_at을 반영한다', () => {
    const profiles = [
      profile({ id: 'p1', grade: 1, class_number: 1, created_at: '2026-01-01T00:00:00.000Z' }),
      profile({ id: 'p2', grade: 1, class_number: 1, created_at: '2026-01-05T00:00:00.000Z' }),
    ]
    const result = aggregateClassCounts(profiles)
    expect(result[0].mostRecentCreatedAt).toBe('2026-01-05T00:00:00.000Z')
  })

  it('빈 목록이면 빈 배열을 반환한다(예외 없음)', () => {
    expect(aggregateClassCounts([])).toEqual([])
  })
})

describe('pickMostActiveClass', () => {
  it('인원이 가장 많은 반을 고른다', () => {
    const classes = aggregateClassCounts([
      profile({ id: 'p1', grade: 1, class_number: 1 }),
      profile({ id: 'p2', grade: 1, class_number: 2 }),
      profile({ id: 'p3', grade: 1, class_number: 2 }),
    ])
    const result = pickMostActiveClass(classes)
    expect(result).toMatchObject({ grade: 1, classNumber: 2, count: 2 })
  })

  it('인원이 같으면 더 최근에 등록된 반을 고른다(동률 처리 1순위: 최근 등록)', () => {
    const classes = aggregateClassCounts([
      profile({ id: 'p1', grade: 1, class_number: 1, created_at: '2026-01-01T00:00:00.000Z' }),
      profile({ id: 'p2', grade: 1, class_number: 2, created_at: '2026-01-05T00:00:00.000Z' }),
    ])
    const result = pickMostActiveClass(classes)
    expect(result).toMatchObject({ grade: 1, classNumber: 2 })
  })

  it('인원과 최근 등록이 모두 같으면 반 번호가 낮은 쪽을 고른다(동률 처리 2순위)', () => {
    const classes = aggregateClassCounts([
      profile({ id: 'p1', grade: 1, class_number: 3, created_at: '2026-01-01T00:00:00.000Z' }),
      profile({ id: 'p2', grade: 1, class_number: 1, created_at: '2026-01-01T00:00:00.000Z' }),
    ])
    const result = pickMostActiveClass(classes)
    expect(result).toMatchObject({ grade: 1, classNumber: 1 })
  })

  it('빈 목록이면 null을 반환한다(예외 없음)', () => {
    expect(pickMostActiveClass([])).toBeNull()
  })
})

describe('pickMostRecentRegistration', () => {
  it('가장 최근 created_at을 가진 프로필을 고른다', () => {
    const profiles = [
      profile({ id: 'p1', created_at: '2026-01-01T00:00:00.000Z' }),
      profile({ id: 'p2', created_at: '2026-01-10T00:00:00.000Z' }),
      profile({ id: 'p3', created_at: '2026-01-05T00:00:00.000Z' }),
    ]
    expect(pickMostRecentRegistration(profiles)?.id).toBe('p2')
  })

  it('빈 목록이면 null을 반환한다(예외 없음)', () => {
    expect(pickMostRecentRegistration([])).toBeNull()
  })
})

describe('classifyYearState', () => {
  it('0명 → empty', () => {
    expect(classifyYearState(0)).toBe('empty')
  })

  it('1~10명 → growing', () => {
    expect(classifyYearState(1)).toBe('growing')
    expect(classifyYearState(10)).toBe('growing')
  })

  it('11명 이상 → active', () => {
    expect(classifyYearState(11)).toBe('active')
    expect(classifyYearState(500)).toBe('active')
  })

  it('음수·비정상 입력에서도 예외를 던지지 않는다(기존 classifySchoolState의 방어 재사용)', () => {
    expect(() => classifyYearState(-5)).not.toThrow()
    expect(classifyYearState(-5)).toBe('empty')
  })
})
