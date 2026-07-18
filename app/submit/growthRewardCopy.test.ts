import { describe, expect, it } from 'vitest'
import { getGrowthRewardCopy } from './growthRewardCopy'
import type { RegistrationGrowthReward, RegistrationGrowthSnapshot } from '@/types/registration'

const SCHOOL_NAME = '개포고등학교'

function snapshot(overrides: Partial<RegistrationGrowthSnapshot>): RegistrationGrowthSnapshot {
  return {
    visibleProfileCount: 1,
    effectiveLevel: 1,
    nextLevel: 2,
    remainingToNext: 10,
    progressPercent: 0,
    isNearLevelUp: false,
    ...overrides,
  }
}

function reward(
  before: Partial<RegistrationGrowthSnapshot>,
  after: Partial<RegistrationGrowthSnapshot>,
  outcome: RegistrationGrowthReward['outcome']
): RegistrationGrowthReward {
  return {
    schoolId: 'school-1',
    before: snapshot(before),
    after: snapshot(after),
    outcome,
  }
}

const FORBIDDEN_WORDS = ['동창', 'XP', '퀘스트', '업적']

function allStrings(copy: NonNullable<ReturnType<typeof getGrowthRewardCopy>>): string[] {
  return [copy.title, copy.description, copy.shareLabel, copy.shareText]
}

describe('getGrowthRewardCopy', () => {
  it('1. reward가 없으면 null', () => {
    expect(getGrowthRewardCopy(undefined, SCHOOL_NAME)).toBeNull()
  })

  it('2. outcome이 no_change면 null', () => {
    const r = reward({ visibleProfileCount: 3 }, { visibleProfileCount: 3 }, 'no_change')
    expect(getGrowthRewardCopy(r, SCHOOL_NAME)).toBeNull()
  })

  it('3. level_up: 제목·레벨 headline·공유 라벨·progressBar 없음', () => {
    const r = reward(
      { effectiveLevel: 1, visibleProfileCount: 5 },
      { effectiveLevel: 2, visibleProfileCount: 6 },
      'level_up'
    )
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy).not.toBeNull()
    expect(copy?.title).toBe(`${SCHOOL_NAME}가 레벨업했어요`)
    expect(copy?.headline).toEqual({ kind: 'level', before: 1, after: 2 })
    expect(copy?.shareLabel).toBe('레벨업 소식 공유하기')
    expect(copy?.progressBar).toBeNull()
  })

  it('4. first_record: 제목·설명·headline none·progressBar 없음', () => {
    const r = reward({ visibleProfileCount: 0 }, { visibleProfileCount: 1 }, 'first_record')
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy).not.toBeNull()
    expect(copy?.title).toBe(`${SCHOOL_NAME}의 첫 기록이 생겼어요`)
    expect(copy?.description).toBe('당신이 이 학교의 시작이 됐어요.')
    expect(copy?.headline).toEqual({ kind: 'none' })
    expect(copy?.progressBar).toBeNull()
  })

  it('5. progress + remainingToNext=1: "한 명만 더 오면 레벨업", near headline, progressBar 없음', () => {
    const r = reward(
      { visibleProfileCount: 8 },
      { visibleProfileCount: 9, remainingToNext: 1, isNearLevelUp: true },
      'progress'
    )
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy?.title).toBe('한 명만 더 오면 레벨업')
    expect(copy?.headline).toEqual({ kind: 'near', remaining: 1 })
    expect(copy?.progressBar).toBeNull()
  })

  it('6. progress + isNearLevelUp && remainingToNext=2: 임박 문구, near headline(하드코딩 없이 데이터에서 파생)', () => {
    const r = reward(
      { visibleProfileCount: 8 },
      { visibleProfileCount: 9, remainingToNext: 2, isNearLevelUp: true },
      'progress'
    )
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy?.title).toBe('레벨업이 머지않았어요')
    expect(copy?.headline).toEqual({ kind: 'near', remaining: 2 })

    const r3 = reward(
      { visibleProfileCount: 8 },
      { visibleProfileCount: 9, remainingToNext: 3, isNearLevelUp: true },
      'progress'
    )
    const copy3 = getGrowthRewardCopy(r3, SCHOOL_NAME)
    expect(copy3?.headline).toEqual({ kind: 'near', remaining: 3 })
  })

  it('7. 일반 progress: count headline, progressBar 존재', () => {
    const r = reward(
      { visibleProfileCount: 3 },
      { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: 40 },
      'progress'
    )
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy?.headline).toEqual({ kind: 'count', before: 3, after: 4 })
    expect(copy?.progressBar).not.toBeNull()
    expect(typeof copy?.progressBar?.remainingLabel).toBe('string')
  })

  it('8. 일반 progress percent 값 검증(clamp 포함)', () => {
    const normal = reward(
      { visibleProfileCount: 3 },
      { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: 42 },
      'progress'
    )
    expect(getGrowthRewardCopy(normal, SCHOOL_NAME)?.progressBar?.percent).toBe(42)

    const over = reward(
      { visibleProfileCount: 3 },
      { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: 130 },
      'progress'
    )
    expect(getGrowthRewardCopy(over, SCHOOL_NAME)?.progressBar?.percent).toBe(100)

    const under = reward(
      { visibleProfileCount: 3 },
      { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: -10 },
      'progress'
    )
    expect(getGrowthRewardCopy(under, SCHOOL_NAME)?.progressBar?.percent).toBe(0)
  })

  it('9. 모든 outcome 카피에 학교 이름이 등장한다', () => {
    const levelUp = getGrowthRewardCopy(
      reward({ effectiveLevel: 1 }, { effectiveLevel: 2, visibleProfileCount: 2 }, 'level_up'),
      SCHOOL_NAME
    )
    const firstRecord = getGrowthRewardCopy(
      reward({ visibleProfileCount: 0 }, { visibleProfileCount: 1 }, 'first_record'),
      SCHOOL_NAME
    )
    const near1 = getGrowthRewardCopy(
      reward({ visibleProfileCount: 8 }, { visibleProfileCount: 9, remainingToNext: 1, isNearLevelUp: true }, 'progress'),
      SCHOOL_NAME
    )
    const generalProgress = getGrowthRewardCopy(
      reward(
        { visibleProfileCount: 3 },
        { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: 40 },
        'progress'
      ),
      SCHOOL_NAME
    )

    for (const copy of [levelUp, firstRecord, near1, generalProgress]) {
      expect(copy).not.toBeNull()
      const joined = allStrings(copy!).join(' ')
      expect(joined).toContain(SCHOOL_NAME)
    }
  })

  it('10. 금지 단어(동창/XP/퀘스트/업적)가 어떤 상태의 카피에도 없다', () => {
    const scenarios: [Partial<RegistrationGrowthSnapshot>, Partial<RegistrationGrowthSnapshot>, RegistrationGrowthReward['outcome']][] = [
      [{ effectiveLevel: 1 }, { effectiveLevel: 2, visibleProfileCount: 2 }, 'level_up'],
      [{ visibleProfileCount: 0 }, { visibleProfileCount: 1 }, 'first_record'],
      [{ visibleProfileCount: 8 }, { visibleProfileCount: 9, remainingToNext: 1, isNearLevelUp: true }, 'progress'],
      [{ visibleProfileCount: 8 }, { visibleProfileCount: 9, remainingToNext: 2, isNearLevelUp: true }, 'progress'],
      [
        { visibleProfileCount: 3 },
        { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: 40 },
        'progress',
      ],
    ]

    for (const [before, after, outcome] of scenarios) {
      const copy = getGrowthRewardCopy(reward(before, after, outcome), SCHOOL_NAME)
      expect(copy).not.toBeNull()
      const joined = allStrings(copy!).join(' ') + (copy!.progressBar?.remainingLabel ?? '')
      for (const word of FORBIDDEN_WORDS) {
        expect(joined).not.toContain(word)
      }
    }
  })

  it('11. level_up payload 불일치 방어: effectiveLevel이 오르지 않으면 progress로 강등하거나 null', () => {
    const countIncreased = reward(
      { effectiveLevel: 2, visibleProfileCount: 5 },
      { effectiveLevel: 2, visibleProfileCount: 6, remainingToNext: 6, isNearLevelUp: false, progressPercent: 30 },
      'level_up'
    )
    const degraded = getGrowthRewardCopy(countIncreased, SCHOOL_NAME)
    expect(degraded).not.toBeNull()
    expect(degraded?.headline.kind).not.toBe('level')

    const countSame = reward(
      { effectiveLevel: 2, visibleProfileCount: 5 },
      { effectiveLevel: 2, visibleProfileCount: 5 },
      'level_up'
    )
    expect(getGrowthRewardCopy(countSame, SCHOOL_NAME)).toBeNull()

    const countDecreased = reward(
      { effectiveLevel: 3, visibleProfileCount: 6 },
      { effectiveLevel: 2, visibleProfileCount: 5 },
      'level_up'
    )
    expect(() => getGrowthRewardCopy(countDecreased, SCHOOL_NAME)).not.toThrow()
    expect(getGrowthRewardCopy(countDecreased, SCHOOL_NAME)).toBeNull()
  })

  it('12. 비정상 progress payload(인원 감소) 방어: 카드 대신 null', () => {
    const decreased = reward(
      { visibleProfileCount: 6 },
      { visibleProfileCount: 5, remainingToNext: 6, isNearLevelUp: false, progressPercent: 30 },
      'progress'
    )
    expect(() => getGrowthRewardCopy(decreased, SCHOOL_NAME)).not.toThrow()
    expect(getGrowthRewardCopy(decreased, SCHOOL_NAME)).toBeNull()
  })

  it('13. shareText에 개인정보(닉네임/인스타 계정)가 섞이지 않는다', () => {
    const r = reward(
      { visibleProfileCount: 3 },
      { visibleProfileCount: 4, remainingToNext: 6, isNearLevelUp: false, progressPercent: 40 },
      'progress'
    )
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy?.shareText).toBe(`${SCHOOL_NAME}에 새로운 기록이 늘었어요. 스쿨러브아이에서 우리 학교를 확인해보세요.`)
    expect(copy?.shareText).not.toMatch(/@/)
    expect(copy?.shareText).not.toMatch(/instagram/i)
  })

  it('14. State C(다음 목표 없음)에서도 일반 progress 카피가 안전한 fallback으로 렌더된다', () => {
    const r = reward(
      { visibleProfileCount: 10 },
      { visibleProfileCount: 12, remainingToNext: 20, isNearLevelUp: false, progressPercent: 10 },
      'progress'
    )
    const copy = getGrowthRewardCopy(r, SCHOOL_NAME)
    expect(copy).not.toBeNull()
    expect(copy?.description).toBe('우리 학교 기록이 한 명 더 늘었어요.')
    expect(copy?.progressBar?.remainingLabel).toBe('우리 학교 기록이 한 명 더 늘었어요.')
  })
})
