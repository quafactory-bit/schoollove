// PHASE 6B — 등록 완료 화면에 표시할 growthReward 카피를 순수하게 계산한다.
// 여기서 새로운 성장/레벨 계산식을 만들지 않는다 — lib/policy/schoolGrowth.ts,
// lib/policy/schoolHubGrowthView.ts가 이미 검증한 순수 함수만 재사용한다(둘 다
// Supabase/server-only import가 없어 'use client' 트리에서 안전하다).
import type { RegistrationGrowthReward, RegistrationGrowthSnapshot } from '@/types/registration'
import { classifySchoolState } from '@/lib/policy/schoolGrowth'
import { calculatePeopleGrowthStage, formatPeopleGrowthRemainingLabel } from '@/lib/policy/schoolHubGrowthView'

export type GrowthRewardHeadline =
  | { kind: 'level'; before: number; after: number }
  | { kind: 'count'; before: number; after: number }
  | { kind: 'near'; remaining: number }
  | { kind: 'none' }

export type GrowthRewardProgress = {
  percent: number
  remainingLabel: string
}

export type GrowthRewardCopy = {
  title: string
  description: string
  shareLabel: string
  shareText: string
  headline: GrowthRewardHeadline
  progressBar: GrowthRewardProgress | null
}

// School Hub의 "사람 수 기반 성장 단계" 문구를 그대로 재사용한다(XP curve의
// remainingToNext를 그대로 노출해 오해를 주는 문제를 School Hub Phase 2B에서 이미 고친
// 방식과 동일). State C(다음 목표 없음)처럼 라벨이 없는 경우에만 정적 fallback을 쓴다.
function safeGrowthStageLabel(after: RegistrationGrowthSnapshot): string {
  const schoolState = classifySchoolState(after.visibleProfileCount)
  const stage = calculatePeopleGrowthStage(schoolState, after.visibleProfileCount)
  return formatPeopleGrowthRemainingLabel(schoolState, stage) ?? '우리 학교 기록이 한 명 더 늘었어요.'
}

function buildLevelUpCopy(
  before: RegistrationGrowthSnapshot,
  after: RegistrationGrowthSnapshot,
  schoolName: string
): GrowthRewardCopy | null {
  // 계약상(classifyRegistrationGrowthOutcome) level_up이면 after.effectiveLevel >
  // before.effectiveLevel이 항상 보장되지만, 배치 집계 등에서 어긋난 payload가 와도
  // 화면이 깨지지 않도록 방어한다 — 사람 수가 늘었으면 progress 카피로 대체하고,
  // 그마저 아니면 카드를 표시하지 않는다(null).
  if (after.effectiveLevel <= before.effectiveLevel) {
    if (after.visibleProfileCount > before.visibleProfileCount) {
      return buildProgressCopy(before, after, schoolName)
    }
    return null
  }

  return {
    title: `${schoolName}가 레벨업했어요`,
    description: '이름을 남긴 덕분에 학교가 한 단계 자랐어요.',
    shareLabel: '레벨업 소식 공유하기',
    shareText: `${schoolName}가 Lv.${after.effectiveLevel}로 레벨업했어요. 스쿨러브아이에서 우리 학교를 확인해보세요.`,
    headline: { kind: 'level', before: before.effectiveLevel, after: after.effectiveLevel },
    progressBar: null,
  }
}

function buildFirstRecordCopy(schoolName: string): GrowthRewardCopy {
  return {
    title: `${schoolName}의 첫 기록이 생겼어요`,
    description: '당신이 이 학교의 시작이 됐어요.',
    shareLabel: '우리 학교 첫 기록 알리기',
    shareText: `${schoolName}에 첫 기록이 생겼어요. 스쿨러브아이에서 우리 학교를 함께 채워주세요.`,
    headline: { kind: 'none' },
    progressBar: null,
  }
}

function buildProgressCopy(
  before: RegistrationGrowthSnapshot,
  after: RegistrationGrowthSnapshot,
  schoolName: string
): GrowthRewardCopy | null {
  // progress 계약상 after.visibleProfileCount >= before.visibleProfileCount여야 한다.
  // 어긋난 payload는 잘못된 before→after 숫자를 보여주는 대신 카드를 생략한다.
  if (after.visibleProfileCount < before.visibleProfileCount) return null

  if (after.remainingToNext === 1) {
    return {
      title: '한 명만 더 오면 레벨업',
      description: '지금 딱 한 명이 부족해요.',
      shareLabel: '한 명 더 불러오기',
      shareText: `${schoolName}, 한 명만 더 오면 레벨업해요. 스쿨러브아이에서 이름을 남겨주세요.`,
      headline: { kind: 'near', remaining: 1 },
      progressBar: null,
    }
  }

  if (after.isNearLevelUp && after.remainingToNext > 1) {
    return {
      title: '레벨업이 머지않았어요',
      description: '조금만 더 모이면 다음 레벨이에요.',
      shareLabel: '친구에게 알리기',
      shareText: `${schoolName}가 레벨업에 가까워지고 있어요. 스쿨러브아이에서 우리 학교를 확인해보세요.`,
      headline: { kind: 'near', remaining: after.remainingToNext },
      progressBar: null,
    }
  }

  const percent = Math.min(100, Math.max(0, after.progressPercent))
  const remainingLabel = safeGrowthStageLabel(after)

  return {
    title: `${schoolName}가 조금 더 자랐어요`,
    description: remainingLabel,
    shareLabel: '친구에게 알리기',
    shareText: `${schoolName}에 새로운 기록이 늘었어요. 스쿨러브아이에서 우리 학교를 확인해보세요.`,
    headline: { kind: 'count', before: before.visibleProfileCount, after: after.visibleProfileCount },
    progressBar: { percent, remainingLabel },
  }
}

export function getGrowthRewardCopy(
  reward: RegistrationGrowthReward | undefined,
  schoolName: string
): GrowthRewardCopy | null {
  if (!reward) return null
  const { before, after, outcome } = reward
  if (outcome === 'no_change') return null

  switch (outcome) {
    case 'level_up':
      return buildLevelUpCopy(before, after, schoolName)
    case 'first_record':
      return buildFirstRecordCopy(schoolName)
    case 'progress':
      return buildProgressCopy(before, after, schoolName)
  }
}
