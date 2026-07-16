# School Hub Growth UI (Phase 2A) 정책 결정

Date: 2026-07-16

## Decision

1. **School Hub가 성장 체감을 담당한다.** 학교 상세 페이지(`app/school/[slug]/page.tsx`)는 단순 정보 페이지가 아니라 "실제 사람들의 기여로 학교가 성장하는 공간"으로 전환한다. 상단에 School Growth Snapshot 기반 Level·진행률·상태별 성장 메시지·핵심 CTA를 배치한다.
2. **State A/B/C만 구현한다.** State D(대표학교)는 `03-level-policy.md` §6의 완성도(Completion) 계산식이 아직 확정되지 않아 구현하지 않는다. D처럼 보이는 배지·랭킹·대표학교 표현도 만들지 않는다.
3. **State D는 Completion 정책 확정 전까지 보류한다.** `types/schoolGrowth.ts::SchoolState`가 이미 `'A' | 'B' | 'C'`로만 정의되어 있어(Phase 1A) State D는 타입 시스템 차원에서 이번에도 존재하지 않는다.
4. **Level Up 임박 기준은 `remainingToNext <= 2`다.** `03-level-policy.md` §7의 확정값을 그대로 사용하며, `SchoolGrowthSnapshot.isNearLevelUp`을 재계산 없이 그대로 표시한다.
5. **실제 데이터만 표시한다.** 가짜 Level, 가짜 순위, 가짜 최근 활동, 존재하지 않는 활동 문구를 만들지 않는다. School Hub 조회 과정에서 `syncSchoolLevel`을 호출하지 않고, `current_level`을 임의로 DB에 기록하지 않는다(읽기·계산만 수행).
6. **State A의 "다음 Level까지" 표시는 `03-level-policy.md` §7의 "다음 레벨까지 1명" 카피 규칙을 그대로 따른다.** 실제 curve 값(예: 141)이 아니라 이 FROZEN 문구를 사용한다 — Phase 1B 코드 주석에서 이미 "화면 레이어(School Hub Phase 1B)에서 schoolState==='A'일 때만 별도로 적용한다"고 예고했던 내용을 실제로 구현한 것이다. State B/C는 `remainingToNext`를 그대로 사용한다(임의 보정 없음).
7. **등록이 학교 성장으로 연결된다는 행동 문구를 사용한다.** State A "첫 이름 남기기", State B "학교 키우기"(+"이름을 남기면 학교의 다음 Level에 가까워져요"), State C "사람 둘러보기"/"내 이름 남기기" — 모두 기존 Register Flow 목적지(`/submit?school=`, `/submit?school=&self=1`)만 재사용하고 새 query parameter를 만들지 않는다. "동창" 표현은 이번에 작성하는 새 카피에서 사용하지 않는다(기존에 이미 존재하던 `shareText`/일부 empty-state 카피는 "기존 기능 보존" 원칙에 따라 그대로 둔다 — 새로 쓰는 문구에만 적용되는 기준이다).
8. **Home Growth Feed보다 School Hub를 먼저 구현한 이유**: `03_MASTER_PROMPT.md`의 구현 순서(`School Hub → Home Feed`)를 따른다. Home Feed의 Feed Item(`FeedItemType: register|levelup|trace`)이 클릭 시 이동하는 목적지가 School Hub이므로(`04-home-feed.md` §5), School Hub가 실제 성장 상태를 보여주지 못하면 Home Feed를 먼저 만들어도 클릭 이후 경험이 비어 있다. `docs/decisions/2026-07-15-school-growth-foundation.md`에서 이미 이 순서를 한 번 확정했고, 이번 결정에서 재확인한다.
9. **State A 보조 CTA "학교 공유하기"는 기존 `ShareButton`(학교별 URL을 정확히 전달하는 기존 컴포넌트)을 재사용한다.** `/invite` 페이지는 학교를 특정할 방법이 없는 사이트 전체 공유 페이지라(`SITE_URL` 고정) School 컨텍스트를 정확히 유지할 수 없으므로 사용하지 않는다 — 이는 "잘못된 URL을 새로 만들지 않는다" 원칙에 따른 것이지 `/invite`의 내부 동작을 변경한 것이 아니다.
10. **"최대 Level" 개념은 구현하지 않는다.** `03-level-policy.md` §1/§9가 "최대 레벨은 없다"를 명시적 불변 조건으로 확정하고 있어, `nextLevel`이 null이 되는 경우를 다루라는 지시는 이 FROZEN 정책과 충돌한다. `SchoolGrowthSnapshot.nextLevel`은 항상 `number`이며 null 분기를 만들지 않는다. "최대 Level 처리" 테스트는 대신 매우 높은 Level에서도 값이 정상적으로 계산되는지(오버플로/충돌 없음)를 검증하는 것으로 해석한다(Phase 1B의 동일 테스트 관례와 일치).

## Reason

- `03-level-policy.md`, `05-school-hub.md`가 이미 State A/B/C 경계·임박 기준·저장값 우선 원칙을 FROZEN으로 확정하고 있어 이번 UI 구현은 그 계약을 그대로 노출하는 것 이상을 하지 않는다.
- School Growth Snapshot(Phase 1A/1B)이 이미 순수 계산·테스트를 마쳐, 이번 Phase는 이를 재사용하는 화면 계층만 추가하면 된다.
- 완성도(Completion) 계산식이 없는 상태에서 State D나 최대 Level 같은 미확정 개념을 구현하면 추측 구현이 되므로 명시적으로 보류한다.

## Impact

- `app/school/[slug]/page.tsx` 상단 구조가 바뀐다(장식용 배너 이미지 제거, `SchoolGrowthPanel`로 대체). 연도/반 탐색, 프로필 목록, SEO metadata, `notFound()` 처리, `SchoolWarmth`(온기 띠)는 그대로 유지된다.
- `types/school.ts`의 `School`에 `current_level`/`level_updated_at`(둘 다 optional)이 추가된다 — `getSchoolBySlug()`가 이미 `select('*')`로 가져오던 값을 타입에 반영한 것뿐이며 새 쿼리를 추가하지 않는다.
- `app/school/[slug]/[year]/page.tsx`, `app/school/[slug]/[year]/[class]/page.tsx`(Year/Class 페이지)는 이번 범위에 포함하지 않는다 — `05-school-hub.md`가 School Hub(최상위 페이지)만 State A/B/C/D 대상으로 정의하고, Product Constitution은 Year/Class를 "같은 사람 목록을 좁히는 필터"로 별도 취급하기 때문이다.
- Home Growth Feed UI, Home 순위 UI는 이번에도 구현하지 않는다.

## Status

APPROVED

---

## Addendum — Phase 2B: 내부 Level/XP와 공개 사람 수 성장 단계 분리

Date: 2026-07-16 (Phase 2B)

### Background

Phase 2A 배포 전 Level 정책 감사(코드 미수정, 감사 전용 세션)에서 실제 화면 수치를 재현한 결과, 공개 프로필 6명인 학교가 Lv.1, "다음 Level까지 135명", 진행률 4%로 계산되는데도(`lib/policy/levelPolicy.ts`의 `threshold(2) = round(50 * 2^1.5) = 141`, `calculateLevelState(6)` → `remainingToNext = 135`, `progressPercent = 4`) State B 화면 문구는 항상 "조금만 더 모이면 다음 Level로 올라가요."로 고정 표시되고 있었다. State B의 인원 상한(10명, `05-school-hub.md` §2)으로는 Level 2 threshold(141)에 구조적으로 도달할 수 없어(10/141 ≈ 7%), 이 고정 문구는 State B 전 구간에서 사실과 어긋난다. State A의 "다음 레벨까지 1명"은 `03-level-policy.md` §7이 명시적으로 요구하는 FROZEN 카피라 정책과 충돌하지 않지만, State B의 "조금만 더 모이면"은 그런 근거 없이 XP curve와 사람 수 State 경계라는 서로 다른 두 축을 하나의 문장으로 섞어서 발생한 실제 불일치였다.

### Decision

11. **내부 Level/XP 계산과 공개 School Hub 성장 표시를 완전히 분리한다.** `lib/policy/levelPolicy.ts`(threshold 공식)와 `lib/api/levels.ts`(cumulativeXp, `syncSchoolLevel`)는 FROZEN 정책 그대로 무수정 유지한다. `SchoolGrowthPanel`은 더 이상 `Lv.N → Lv.N+1`, XP 기반 `remainingToNext`의 사람 단위 표시("다음 Level까지 135명" 같은 문구), XP 기반 `progressPercent`를 공개 성장 진행 바로 표시하지 않는다.
12. **Level은 "현재 상태 배지"로만 표시한다.** 학교 이름 옆의 `Lv.{snapshot.effectiveLevel}` 배지와, `snapshot.isNearLevelUp === true`일 때만 그 옆에 붙는 작은 "레벨업 임박" 표시만 유지한다. 이 배지는 XP curve의 존재를 완전히 숨기지 않되, 사람 수 성장 진행 바와는 시각적으로 분리한다(색상 트랙 분리: Level 배지는 indigo 계열, 사람 수 성장 진행 바는 blue 계열).
13. **공개 성장 진행률/문구는 State A/B/C의 사람 수 경계를 기준으로 새로 계산한다.** `lib/policy/schoolHubGrowthView.ts`에 순수 함수 `calculatePeopleGrowthStage(schoolState, visibleProfileCount)`를 추가한다 — XP/`remainingToNext`를 입력으로도, 내부 계산에도 전혀 사용하지 않는다(함수 시그니처가 `(schoolState, visibleProfileCount)` 2개 인자만 받는다는 사실 자체로 XP 비의존을 보장). State A는 `remainingPeople=1, progressPercent=0`(FROZEN "다음 레벨까지 1명"과 동일한 정신을 사람 수 트랙에서 반복하되, 이번엔 실제 목표(첫 기록 1명)와 정확히 일치하는 진짜 값이다). State B는 `remainingPeople = 11 - visibleProfileCount`, `progressPercent = round(((visibleProfileCount - 1) / 10) * 100)`(0~100 clamp), `remainingPeople <= 2`면 `isNearGrowth: true`("성장 임박"). State C는 `progressPercent = 100`, `isComplete: true`이며 임의의 다음 사람 수 목표를 만들지 않는다(`remainingPeople`은 의미 없는 0으로 고정, 화면에 다음 목표 문구를 표시하지 않음).
14. **State B의 다음 State 진입 기준은 11명이다.** 이는 새로 만든 값이 아니라 `lib/policy/schoolGrowth.ts::classifySchoolState`(State C 경계: 등록 11명 이상)와 `05-school-hub.md` §2("C: 등록 11명 이상")에 이미 확정되어 있던 값을 사람 수 성장 계산의 상수로 그대로 재사용한 것이다.
15. **State B의 고정 카피 "조금만 더 모이면 다음 Level로 올라가요."를 제거한다.** `getSchoolStateContent('B').description`은 `null`을 반환하고(정적 카피 없음을 명시), 실제 표시 문구는 `formatPeopleGrowthDescription(remainingPeople)`이 실제 남은 인원으로 "N명만 더 모이면 다음 성장 단계로 이어져요."를 만든다. "Level"이라는 표현은 이 문구와 State B `helperText`("이름을 남기면 다음 성장 단계에 가까워져요.") 모두에서 사용하지 않는다.
16. **State D는 계속 보류한다.** 이번 Phase 2B도 완성도(Completion) 계산식 미확정이라는 동일한 이유로 State D를 구현하지 않으며, `types/schoolGrowth.ts::SchoolState`도 그대로 `'A' | 'B' | 'C'`만 유지한다.
17. **State A 화면의 중복 행동을 상단 `SchoolGrowthPanel`로 집중한다.** School Hub 최상단(State A 주 CTA "첫 이름 남기기", 보조 CTA "학교 공유하기")과 기존 사람 발견 영역의 빈 상태(등록 0명)에 각각 존재하던 등록/공유 CTA 중복 중, 사람 발견 영역의 빈 상태 CTA(기존 "친구 이름 남기기" 버튼과 두 번째 `ShareButton`)를 제거하고 빈 상태는 설명 텍스트만 남긴다. `SchoolWarmth`(한 줄 흔적, 내 인스타 등록)는 School Hub의 등록 유도와는 다른 기능이므로 그대로 유지하며 내부 동작을 수정하지 않는다.
18. **디자인은 기존 카드 구조/여백을 유지하며 색상만 최소 보완한다.** `tailwind.config.ts`의 `brand.blue`는 "브랜드 컬러를 흑백 모노톤으로 통일"이라는 기존의 의도된 사이트 전역 결정에 따라 실제로는 거의 검정(`#0a0a0a`)이다 — 이 전역 토큰은 School Hub만을 위해 변경하지 않는다(다른 모든 페이지의 색상이 함께 바뀌는 것을 방지). 대신 `SchoolGrowthPanel.tsx` 안에서만 Tailwind 기본 팔레트의 `indigo`(Level 배지·레벨업 임박)와 `blue`(사람 수 성장 진행 바·성장 임박 배지)를 사용해 "브랜드 보라·파랑 계열"이라는 요청을 실제로 시각화한다. CTA 버튼(`btn-primary`, 보조 버튼 테두리)은 사이트 전역과 충돌하지 않도록 Phase 2A 스타일을 그대로 유지하고 이번에 재색칠하지 않는다.

### Reason

- 감사에서 발견된 실제 불일치(State B "조금만 더 모이면" 고정 카피가 XP curve상 성립할 수 없는 구간에서도 항상 표시됨)를 근본 원인(Level curve와 사람 수 State 경계가 서로 다른 스케일이라는 사실)에서 해결한다.
- `03-level-policy.md` §9("API route마다 다른 레벨 계산 금지", "화면 컴포넌트에서 threshold 재구현 금지")를 그대로 지키면서, Level 공식 자체는 건드리지 않고 화면 표시 레이어만 분리한다.
- Level 정책 감사 보고서의 대안 비교(A: 프로필 수를 Level 계산값으로 사용/B: 프로필당 고정 XP 부여/C: 내부 Level 유지 + 별도 사람 수 성장 목표 표시)에서 대안 C를 채택 — DB/`current_level`/Register Flow/Admin 도구를 전혀 건드리지 않고도 관찰된 불일치를 해소할 수 있는 유일한 대안이었다.

### Impact

- `lib/policy/schoolHubGrowthView.ts`에 `PeopleGrowthStage` 타입과 `calculatePeopleGrowthStage`/`formatPeopleGrowthRemainingLabel`/`formatPeopleGrowthDescription`이 추가된다. 기존 `formatRemainingToNextLabel`/`formatProgressPercentLabel`(XP 기반)은 삭제하지 않고 그대로 남겨두되(다른 잠재적 소비자를 위해), `SchoolGrowthPanel`은 더 이상 이 두 함수를 호출하지 않는다.
- `components/SchoolGrowthPanel.tsx`의 성장 진행 영역이 XP 기반에서 사람 수 기반으로 교체된다.
- `app/school/[slug]/page.tsx`의 프로필 빈 상태(0명) 블록에서 중복 CTA 2개(등록 버튼, 공유 버튼)가 제거된다. `Link`/`ShareButton` 사용처가 줄어들며 `ShareButton` import 자체는 더 이상 필요 없어 제거한다(해당 컴포넌트는 `SchoolGrowthPanel.tsx`가 계속 사용).
- Level 계산(`lib/policy/levelPolicy.ts`), XP 저장(`lib/api/levels.ts`), Register Flow(`app/api/profiles/route.ts`), Admin Level Sync(`app/api/admin/tools/level-sync/*`), DB/RPC/migration, Home UI는 이번에도 무수정이다.
- `tailwind.config.ts`(전역 브랜드 토큰)는 무수정이다.

### Status

APPROVED
