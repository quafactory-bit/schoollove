import type { SchoolGrowthSnapshot, SchoolState } from '@/types/schoolGrowth'

// School Hub Growth Panel(components/SchoolGrowthPanel.tsx)이 사용하는
// State별 성장 메시지·CTA 순수 데이터. docs/design-package-v1.0/05-school-hub.md의
// State A/B/C 의미를 그대로 구현한다. State D는 SchoolState 타입 자체에 없어
// 이 맵에도 존재하지 않는다(컴파일 타임에 이미 보장됨).
export type SchoolStateCtaKind = 'register' | 'registerSelf' | 'discover' | 'share'

export type SchoolStateCta = {
  label: string
  kind: SchoolStateCtaKind
}

// description이 null인 State는 정적 카피가 없다는 뜻 — 실제 remainingPeople이 필요해
// formatPeopleGrowthDescription()으로 화면 레이어에서 동적으로 대체한다(State B, Phase 2B).
export type SchoolStateContent = {
  title: string
  description: string | null
  helperText: string | null
  primaryCta: SchoolStateCta
  secondaryCta: SchoolStateCta | null
}

const STATE_CONTENT: Record<SchoolState, SchoolStateContent> = {
  A: {
    title: '아직 이 학교에 남겨진 이름이 없어요',
    description: '첫 번째 기록이 이 학교의 시작이 됩니다.',
    helperText: null,
    primaryCta: { label: '첫 이름 남기기', kind: 'register' },
    secondaryCta: { label: '학교 공유하기', kind: 'share' },
  },
  B: {
    title: '이 학교에 사람들이 하나씩 다시 모이고 있어요',
    // 고정 카피였던 "조금만 더 모이면 다음 Level로 올라가요."는 Phase 2B에서 제거했다
    // (감사 결과: State B 상한 10명으로는 Level curve상 "임박"이 구조적으로 성립하지 않음).
    // 실제 remainingPeople 기반 문구는 formatPeopleGrowthDescription()이 담당한다.
    description: null,
    helperText: '이름을 남기면 다음 성장 단계에 가까워져요.',
    primaryCta: { label: '학교 키우기', kind: 'register' },
    secondaryCta: null,
  },
  C: {
    title: '이 학교는 지금 활발하게 이어지고 있어요',
    description: '같은 시절을 지나온 사람들을 살펴보세요.',
    helperText: null,
    primaryCta: { label: '사람 둘러보기', kind: 'discover' },
    secondaryCta: { label: '내 이름 남기기', kind: 'registerSelf' },
  },
}

export function getSchoolStateContent(schoolState: SchoolState): SchoolStateContent {
  return STATE_CONTENT[schoolState]
}

// CTA kind → 실제 목적지. 기존 /submit 쿼리 파라미터 관례(school, self)만 재사용하고
// 새 파라미터를 만들지 않는다. 'discover'는 같은 페이지 안의 기존 탐색 영역으로
// 스크롤하는 앵커, 'share'는 링크가 아니라 기존 ShareButton으로 렌더링하므로 null을 반환한다.
export function buildSchoolStateCtaHref(kind: SchoolStateCtaKind, slug: string): string | null {
  switch (kind) {
    case 'register':
      return `/submit?school=${slug}`
    case 'registerSelf':
      return `/submit?school=${slug}&self=1`
    case 'discover':
      return '#discover'
    case 'share':
      return null
  }
}

// "다음 Level까지 N명" 표시값.
// docs/design-package-v1.0/03-level-policy.md §7: "State A의 남은 수치는
// `다음 레벨까지 1명`으로 행동 가능하게 표현한다" — State A는 실제 curve 값(예: 141)
// 대신 이 FROZEN 카피 규칙을 그대로 따른다. State B/C는 snapshot.remainingToNext를
// 그대로 사용한다(가짜 숫자나 임의 보정 없음). 최대 Level 개념은 없으므로(§1 "최대 레벨은
// 없다") nextLevel이 null이 되는 경우를 다루지 않는다 — SchoolGrowthSnapshot.nextLevel은
// 항상 number다.
const STATE_A_REMAINING_DISPLAY = 1

// Phase 2B(docs/decisions/2026-07-16-school-hub-growth-ui.md Addendum)부터
// SchoolGrowthPanel은 이 두 함수를 더 이상 호출하지 않는다 — 공개 성장 표시는
// XP curve(remainingToNext/progressPercent)가 아니라 아래 calculatePeopleGrowthStage()의
// 사람 수 기준 값을 사용한다. 함수 자체는 Level 값을 그대로 노출하는 유효한 계산이라
// 삭제하지 않고 남겨둔다(예: 향후 내부/관리자 화면에서 재사용 가능).
export function formatRemainingToNextLabel(snapshot: SchoolGrowthSnapshot): string {
  const remaining = snapshot.schoolState === 'A' ? STATE_A_REMAINING_DISPLAY : snapshot.remainingToNext
  return `다음 Level까지 ${remaining}명`
}

export function formatProgressPercentLabel(snapshot: Pick<SchoolGrowthSnapshot, 'progressPercent'>): string {
  return `${snapshot.progressPercent}%`
}

// ─── 사람 수 기반 공개 성장 단계 (Phase 2B) ────────────────────────
// docs/decisions/2026-07-16-school-hub-growth-ui.md Addendum 기준.
// School Hub의 공개 성장 진행률/문구는 XP Level curve(threshold/cumulativeXp)가 아니라
// State A/B/C 경계(사람 수, 03-level-policy.md §5 / lib/policy/schoolGrowth.ts::classifySchoolState와
// 동일한 0 / 1~10 / 11+ 경계)를 기준으로 별도 계산한다. Level 공식은 여기서 재구현하지 않는다 —
// 이 모듈은 snapshot.effectiveLevel/isNearLevelUp을 그대로 표시용으로만 참조할 뿐,
// remainingToNext/progressPercent(XP 기반)는 입력으로 받지도, 반환하지도 않는다.
export type PeopleGrowthStage = {
  remainingPeople: number
  progressPercent: number
  isNearGrowth: boolean
  isComplete: boolean
}

// State B → C 진입 기준. 05-school-hub.md §2 "C: 등록 11명 이상"과
// schoolGrowth.ts::classifySchoolState의 경계(<=10 → B, 그 외 → C)에서 그대로 가져온 상수다.
const NEXT_STATE_ENTRY_COUNT = 11

// docs/design-package-v1.0/03-level-policy.md §7의 "remainingToNext <= 2 임박" 확정값을
// 사람 수 성장 단계에도 동일하게 적용한다(감사 결과에서 Level curve와는 별도 트랙임을 확정).
const NEAR_GROWTH_THRESHOLD = 2

export function calculatePeopleGrowthStage(
  schoolState: SchoolState,
  visibleProfileCount: number
): PeopleGrowthStage {
  if (schoolState === 'A') {
    return { remainingPeople: 1, progressPercent: 0, isNearGrowth: false, isComplete: false }
  }

  if (schoolState === 'C') {
    // "다음 사람 수 목표를 임의로 만들지 않는다" — remainingPeople은 0(목표 없음)으로 고정.
    return { remainingPeople: 0, progressPercent: 100, isNearGrowth: false, isComplete: true }
  }

  const remainingPeople = NEXT_STATE_ENTRY_COUNT - visibleProfileCount
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((visibleProfileCount - 1) / (NEXT_STATE_ENTRY_COUNT - 1)) * 100))
  )

  return {
    remainingPeople,
    progressPercent,
    isNearGrowth: remainingPeople <= NEAR_GROWTH_THRESHOLD,
    isComplete: false,
  }
}

// "다음 성장 단계까지 N명" / State A "첫 기록까지 1명" 표시값.
// State C는 다음 목표가 없어 null(화면 레이어가 완료 문구로 대체, remainingPeople 줄 자체를 표시하지 않음).
export function formatPeopleGrowthRemainingLabel(
  schoolState: SchoolState,
  stage: PeopleGrowthStage
): string | null {
  if (schoolState === 'A') return '첫 기록까지 1명'
  if (schoolState === 'C') return null
  return `다음 성장 단계까지 ${stage.remainingPeople}명`
}

// State B 성장 메시지. "Level"이라는 표현을 쓰지 않고 실제 remainingPeople만 사용한다.
export function formatPeopleGrowthDescription(remainingPeople: number): string {
  return `${remainingPeople}명만 더 모이면 다음 성장 단계로 이어져요.`
}
