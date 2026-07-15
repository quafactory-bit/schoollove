# School Growth Foundation — Phase 1A 정책 결정

Date: 2026-07-15

## Decision

1. **Home은 검색 랜딩페이지가 아니라 성장 피드다.** SchoolLoveI는 사람들의 실제 기여로 학교가 성장하고 그 변화가 흐르는 커뮤니티이며, Home의 핵심 순환은 "사람 발견 → 이름 남기기 → 학교 성장 → Level Up·순위·임박 상태 노출 → 새로운 사람의 재방문과 발견"이다.
2. **구현 순서는 School Hub가 Home Growth Feed보다 먼저다.** `03_MASTER_PROMPT.md`의 구현 순서(`School Hub → Home Feed`)를 그대로 따른다. Home Growth Feed UI는 School Hub와 이번 Foundation(성장 정책·데이터 계약)이 먼저 갖춰진 뒤 별도 단계에서 구현한다.
3. **Home Final Design v1.1(검색 랜딩 초안)은 채택하지 않는다.** 이전에 미커밋 상태로 작성됐던 큰 Hero·검색 중심 Home 구현과 관련 문서(`docs/design-package-v1.1/01-home-final-design.md`, 舊 `docs/decisions/2026-07-15-home-final-design-v1.md`)는 이번 결정으로 대체(superseded)되며, `app/page.tsx`는 기준 커밋(`7f335f7`) 상태로 되돌렸다. 단, `components/TabBar.tsx`의 "홈 `/` / 학교 찾기 `/search`" 2축 구조는 FROZEN `04-home-feed.md` §6과 일치하므로 그대로 유지한다.
4. **이번 주 학교 성장 순위(Home 중간 배너, TOP 5)**: 최근 7일 동안 새로 등록된 공개(`is_hidden=false`) 프로필 수 기준. 정렬은 (1) 최근 7일 신규 공개 프로필 수 내림차순 (2) 동률이면 가장 최근 등록 시각 내림차순 (3) 그래도 같으면 학교명 오름차순. 가짜 학교나 빈 순위를 채우지 않으며, 실제 대상이 5개 미만이면 그 수만큼만 표시하고 0건이면 빈 상태를 표시한다.
5. **오늘 가장 빠르게 성장한 학교**: Asia/Seoul 기준 오늘 00:00부터 현재까지 추가된 공개 프로필 수 기준. 정렬 기준은 4번과 동일한 우선순위 구조(신규 수 내림차순 → 최근 등록 시각 내림차순 → 학교명 오름차순)를 오늘 하루로 좁혀 적용한다. 실제 데이터가 없으면 배너를 숨기거나 명확한 빈 상태를 사용하며 가짜 학교를 표시하지 않는다.
6. **순위 변화(상승/하락) 표시는 이전 기간과 현재 기간을 정확히 비교할 수 있을 때만 노출한다.** 신뢰할 수 있는 기간 비교 계산이 없는 v1에서는 화살표나 `+3위` 같은 값을 만들지 않는다.
7. **실제 데이터만 사용한다.** Home Growth Feed v2(향후 구현)가 사용할 수 있는 활동은 신규 프로필 등록, 공개 인스타 연결, 실제 Level Up, 실제 trace 데이터뿐이다. 가짜 Level Up, 가짜 trace, 하드코딩 활동, 실제 이벤트처럼 보이는 임시 문장을 금지한다.
8. **School Growth Snapshot**(`lib/policy/schoolGrowth.ts::calculateSchoolGrowthSnapshot`)을 School Hub와 Home이 공유하는 읽기 전용 성장 계산 계약으로 확정한다. 이 함수는 DB를 수정하거나 `syncSchoolLevel`을 호출하지 않고, 이미 조회된 값만으로 순수 계산한다.
9. **School State는 A/B/C까지만 이번 단계에서 판정한다.** State D(대표학교)는 `03-level-policy.md` §6의 완성도(Completion) 계산식이 FROZEN 문서에 없어 임의로 구현하지 않는다(아래 blocker 참고).
10. **주간/오늘 성장 랭킹의 실제 DB 집계(RPC/view)는 이번 Phase 1A에서 생성하지 않는다.** 순수 정렬 로직(`lib/policy/schoolRanking.ts`)과 데이터 계약만 확정하고, 실제 집계 인프라는 별도 blocker로 설계안까지만 준비한다(아래 참고).

## Reason

- 사용자가 이번 지시에서 제품 방향(성장 순환)과 정렬·기간 기준을 명시적으로 확정했다.
- `03-level-policy.md` §1/§8("레벨은 절대 내려가지 않는다", "저장값 우선")과 §7("remainingToNext ≤ 2 임박", "State A는 다음 레벨까지 1명으로 표현")이 이미 FROZEN으로 확정돼 있어 `isNearLevelUp` 기준은 추측 없이 그대로 적용할 수 있었다.
- `03-level-policy.md` §5가 State A/B/C 경계(0명/1~10명/11명 이상)는 확정했지만 §6의 완성도 계산식은 "세부 집계 구현은 Policy 계층이 소유한다"고만 되어 있고 실제 공식이 없어, State D 판정과 완성도 % 계산은 추측 구현하지 않는다.
- 저장소 전체에서 `.rpc(...)` 호출은 `search_schools_v2`(학교 이름 검색) 하나뿐이며, 주간/오늘 신규 등록 집계용 RPC나 view는 존재하지 않는다. 이 상태에서 전체 `profiles`를 무제한으로 내려받아 JS에서 집계하거나 학교별 N+1 count를 반복 호출하는 것은 금지 조건에 해당해, 새 RPC 설계안을 blocker로 남기고 실제 생성은 하지 않는다.

## Impact

- `app/page.tsx`는 기준 커밋 상태(기존 MVP Home)로 유지된다. Home Growth Feed UI 재구현은 이번 Foundation 이후 별도 단계다.
- `components/TabBar.tsx`의 2축 구조(`/`, `/search`)는 그대로 유지된다. `/submit`, `/invite` 라우트는 삭제되지 않는다.
- School Hub(`app/school/[slug]/page.tsx`)는 이번 단계에서 UI를 변경하지 않는다. `getSchoolGrowthSnapshot`(신규, `lib/api/schools.ts`)을 재사용할 수 있는 상태로만 준비되어 있다.
- DB schema, migration, RPC는 생성하지 않는다. Register Flow, Level 정책 계산(`lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`), Admin 도구는 무수정이다.
- `docs/design-package-v1.1/01-home-final-design.md`, `docs/decisions/2026-07-15-home-final-design-v1.md`는 SUPERSEDED로 표시되어 있으며, 이 환경의 도구 권한상 `rm`을 실행할 수 없어 실제 삭제는 사용자가 직접 수행해야 한다(각 파일에 정확한 삭제 명령을 남겨 두었다).

## Status

APPROVED
