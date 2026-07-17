# Home Growth Feed v2 — Phase 3A 정책 결정

Date: 2026-07-17

## Decision

1. **Home은 검색 랜딩페이지가 아니라 실제 활동이 이어지는 성장 피드다.** `app/page.tsx`를 검색 Hero + 추억 슬라이더 + 정적 통계 중심 MVP에서, 실제 최근 등록/흔적 활동과 학교 성장 순위를 보여주는 연속 피드로 전환한다. `docs/design-package-v1.0/04-home-feed.md`(FROZEN)의 정의를 그대로 따른다.
2. **최근 활동 피드는 실제 공개 프로필 등록(`profiles`, `is_hidden=false`)과 실제 공개 흔적(`traces`, `is_hidden=false`)만 사용한다.** 두 원천을 `created_at` 내림차순으로 병합하고 `HOME_ACTIVITY_FETCH_LIMIT`(16)만큼만 제한 조회한다. 전체 `profiles`/`traces`를 무제한 조회하지 않으며, 학교 정보는 `school:schools(school_name, slug, current_level)` join으로 한 번에 가져와 학교별 추가 조회(N+1)를 만들지 않는다.
3. **trace 데이터는 이번 Phase에서 최근 활동 피드에 포함한다.** 제외 판단 기준(§5 지시사항)을 실제로 확인한 결과: `traces` 테이블은 이미 School Hub(`components/SchoolWarmth.tsx`)에서 `message`를 포함해 모든 방문자에게 공개 표시되고 있고(is_hidden=false 필터 재사용), `school_id`로 학교와 명확히 연결되며, `created_at`이 존재하고, 개인 식별 필드(IP, 작성자 ID 등)는 테이블에 아예 없다(`id, school_id, graduation_year, grade, class_number, message, report_count, is_hidden, created_at`). 즉 "실제 공개 여부"가 이미 프로덕션에서 검증된 기존 기능이라 새로운 노출을 만드는 것이 아니다. 다만 원문 그대로 노출하지 않고 `formatTraceActivityText`가 20자로 잘라 짧게만 표시하며(§5 "그대로 길게 노출하지 말고 짧게 표시"), 학년/반/졸업연도는 Home 피드에 노출하지 않는다(기존 `SchoolWarmth`도 이 필드들은 표시하지 않음 — 동일한 노출 범위를 유지).
4. **Level Up 활동은 이번 Phase에서 구현하지 않는다.** 저장소에는 `schools.current_level`/`level_updated_at`(현재 상태 스냅샷)만 있고 Level Up 이벤트 이력 테이블이 없어, "어느 학교가 언제 이전 Level에서 어떤 Level로 올랐는가"를 확정할 수 없다. 현재 상태를 이벤트처럼 위장하지 않는다는 지시에 따라 `levelup` 타입 피드 항목을 만들지 않는다. 대신 `current_level`을 각 활동/순위 행 옆에 `Lv.N` 보조 배지로만 표시한다 — 이미 활동/순위 조회의 동일 join·RPC 결과에 포함된 값이라 추가 조회(N+1)가 없다.
5. **오늘 가장 빠르게 성장한 학교는 기존 `getTodayFastestGrowingSchool`을 그대로 재사용한다.** 실제 오늘 등록이 없으면 `null`이 반환되고 `TodayGrowthStrip` 자체를 렌더링하지 않는다. 순위 상승/하락 화살표는 만들지 않는다(Phase 1A 결정과 동일).
6. **이번 주 학교 성장 순위 TOP 5는 기존 `getWeeklySchoolGrowthRanking`/RPC 계약을 그대로 재사용하되, Home 전용으로 오류와 실제 빈 순위를 구분하는 `getWeeklySchoolGrowthRankingWithStatus`를 추가한다.** 기존 `getWeeklySchoolGrowthRanking`(배열만 반환, 오류 시 `[]`)은 이미 테스트로 고정된 계약이라 그대로 두고, 내부 `fetchGrowthRanking`을 `{status:'ok', rows} | {status:'error'}`를 반환하도록 리팩터링한 뒤 기존 두 함수(`getWeeklySchoolGrowthRanking`, `getTodayFastestGrowingSchool`)는 결과를 unwrap만 하도록 바꿨다(외부에서 관찰 가능한 동작은 동일, 회귀 테스트로 확인). Home의 순위 섹션은 새 함수로 오류 상태를 실제 빈 상태와 구분해 표시한다.
7. **`GrowthRankingInput`/`GrowthRankingRow`(`types/ranking.ts`)에 `visibleProfileCount`를 추가한다.** RPC(`school_growth_ranking_v1`)는 Phase 1B 결정 문서에서 이미 이 값을 반환하도록 설계되어 있었지만(`visible_profile_count`, N+1 방지를 위한 상관 서브쿼리), TypeScript 매핑(`mapGrowthRankingRow`)이 내부적으로만 사용하고 반환 객체에 노출하지 않고 있었다. Home이 School Hub의 사람 수 성장 helper(`calculatePeopleGrowthStage`)를 재사용하려면 이 값이 필요해, 이미 계약된 값을 그대로 노출하는 것으로 채웠다(RPC/DB는 무수정).
8. **주간 순위의 사람 수 성장 표시는 School Hub와 동일한 helper를 그대로 재사용한다.** `lib/policy/homeFeed.ts::buildWeeklyRankingViewRow`가 `classifySchoolState`(schoolGrowth.ts)와 `calculatePeopleGrowthStage`/`formatPeopleGrowthRemainingLabel`(schoolHubGrowthView.ts)를 그대로 호출한다 — Level curve(XP 기반 `remainingToNext`/`progressPercent`)는 재사용하지 않는다. State A는 순위 결과에 나타나지 않으므로(신규 등록이 있어야 순위에 오르고, 그러면 `visibleProfileCount >= 1`이라 State B/C만 가능) 별도 분기를 만들지 않는다.
9. **내부 Level/XP와 공개 사람 수 성장 단계를 계속 분리한다(Phase 2B 원칙 유지).** Home 어디에도 XP 기반 `remainingToNext`/`progressPercent`를 사람 수처럼 표시하지 않는다. `Lv.N` 배지는 School Hub와 동일하게 "현재 상태" 표시로만 쓴다.
10. **CTA는 활동을 충분히 보여준 뒤에만 배치한다.** `getFeedCtaVisibility(itemCount)`가 검색 CTA는 활동 4개 이상, 등록 CTA는 활동 8개 이상일 때만 노출하도록 정의한다(등록 CTA 기준은 검색 CTA 기준의 2배 — "충분히"라는 요구를 구체적인 수치로 확정한 값). 레이아웃 순서 자체가 항상 피드 → 순위 → 피드 → CTA 순이라 CTA가 첫 활동보다 먼저 나오는 경우는 구조적으로 발생하지 않는다.
11. **개인 이름/Instagram ID는 Home 어디에도 노출하지 않는다.** `lib/api/homeFeed.ts`의 두 조회 함수는 애초에 `nickname`/`instagram_id`를 select하지 않는다(조회 대상에서 원천 배제). `lib/policy/homeFeed.ts`가 만드는 문구(`formatRegisterActivityText`/`formatTraceActivityText`)도 학교명·졸업연도·흔적 메시지만 입력으로 받는다.
12. **Upstash 방문자 카운트(`lib/api/views.ts`)는 이번 구현과 연결하지 않는다.** Home 어디에서도 `incrSchoolView`/`getSchoolView`를 호출하지 않는다.

## Reason

- `04-home-feed.md`(FROZEN)가 이미 Home을 "성장 순간이 이어지는 피드"로 정의하고 있고, `docs/decisions/2026-07-15-school-growth-foundation.md`/`2026-07-16-school-hub-growth-ui.md`가 실제 데이터 원천(`getTodayFastestGrowingSchool`, `getWeeklySchoolGrowthRanking`, `calculateSchoolGrowthSnapshot`, 사람 수 성장 helper)을 이미 순수 계산까지 마쳐 두어, 이번 Phase는 이를 그대로 재사용하는 화면 계층만 추가하면 된다.
- Level Up 이벤트 이력이 실제로 존재하지 않는 상태에서 "방금 Level Up했다"를 지어내면 `03-level-policy.md`/Foundation 문서가 금지하는 "실제 이벤트처럼 보이는 임시 문장"이 되므로, 확인된 사실(현재 상태 스냅샷)만 배지로 보여주고 이벤트 문구는 만들지 않는다.
- trace 포함 여부는 추측이 아니라 기존 코드(`components/SchoolWarmth.tsx`, `lib/api/traces.ts`, `app/api/traces/route.ts`)를 직접 읽어 "이미 공개된 필드·이미 공개된 노출 범위"임을 확인한 뒤 결정했다.

## Impact

- `app/page.tsx`가 검색 Hero/추억 슬라이더/정적 통계/기존 "방금 연결됨" 목록에서 실제 활동 피드 + 오늘 성장 스트립 + 주간 순위 + CTA 구조로 전면 교체된다. `components/TabBar.tsx`(홈/학교 찾기 2축)와 `app/layout.tsx`의 `Footer`/`TabBar` 배치는 무수정이다.
- 신규 파일: `types/homeFeed.ts`, `lib/policy/homeFeed.ts`(+test), `lib/api/homeFeed.ts`(+test), `components/TodayGrowthStrip.tsx`, `components/HomeActivityFeed.tsx`, `components/HomeActivityItem.tsx`, `components/WeeklyGrowthRanking.tsx`, `components/HomeFeedCta.tsx`.
- `types/ranking.ts`에 `visibleProfileCount` 필드가 추가된다(기존 소비자에 영향 없음 — 기존 테스트 전부 통과 확인).
- `lib/api/schools.ts`의 `fetchGrowthRanking`이 내부적으로 상태를 반환하도록 리팩터링되고 `getWeeklySchoolGrowthRankingWithStatus`가 추가된다. `getWeeklySchoolGrowthRanking`/`getTodayFastestGrowingSchool`의 외부 계약(반환 타입·오류 시 동작)은 동일하게 유지된다.
- School Hub(`app/school/[slug]/page.tsx`, `components/SchoolGrowthPanel.tsx`), Level 정책(`lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`), Register Flow(`app/api/profiles/route.ts`, `app/submit/*`), Admin, DB/migration/RPC SQL은 이번에도 무수정이다.
- `components/Header.tsx`, `components/SearchBar.tsx`는 이번에도 어디에도 연결하지 않는다(기존에 이미 미사용 상태였고, 이번 Home 헤더는 `<form method="get" action="/search">` 순수 GET 폼으로 구현해 `/search` 페이지의 기존 검색 폼 패턴을 그대로 따른다 — 새 클라이언트 컴포넌트나 새 훅을 추가하지 않았다).

## 남은 blocker

- Level Up 이벤트 이력 테이블/스키마가 없다. 실제 "Lv.N → Lv.N+1로 상승한 시각" 활동을 Home Feed에 넣으려면 별도 이벤트 로그(예: `school_level_events`) 설계·migration이 필요하며, 이는 이번 Phase 범위(DB 변경 금지) 밖이라 blocker로만 남긴다.
- `supabase/migrations/20260715120000_school_growth_ranking_rpc.sql`은 Phase 1B 결정 문서 기준으로 아직 Supabase에 적용되지 않은 상태다(파일 자체 주석에 명시됨). 적용 전까지는 주간 순위/오늘 성장 스트립이 RPC 오류로 인해 항상 "오류" 또는 빈 상태로만 보인다 — 이번 Phase의 코드 결함이 아니라 인프라 적용 여부의 문제이며, Supabase 적용은 이번 작업 범위(migration 실행 금지) 밖이다.

## Status

APPROVED
