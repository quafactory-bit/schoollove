# School Growth Ranking RPC — 계약·보안 결정 (Phase 1B)

Date: 2026-07-15

## Decision

1. **주간/오늘 순위를 하나의 RPC로 통합**: `school_growth_ranking_v1(p_since, p_until, p_limit)` 하나만 만들고, "이번 주 학교 성장 순위"와 "오늘 가장 빠르게 성장한 학교"는 TypeScript 레이어에서 `p_since`/`p_limit`만 다르게 호출한다(주간 5개, 오늘 1개). 거의 동일한 RPC를 두 개 만들지 않기 위함이다.
2. **`SECURITY INVOKER`로 선언한다.** `schools_select_all(USING true)`과 `profiles_select_visible(USING is_hidden = false)` RLS 정책이 이미 anon/authenticated 역할에 필요한 접근을 정확히 제공하므로, RLS를 우회하는 `SECURITY DEFINER`를 쓸 이유가 없다. `is_hidden = false` 조건은 RLS에 의존하지 않고 함수 SQL에도 명시적으로 포함해 이중으로 보장한다.
3. **`anon`, `authenticated`에게 `EXECUTE` 권한을 부여하고 `PUBLIC` 기본 권한은 명시적으로 `REVOKE`한다.** `service_role` 전용으로 만들지 않는다 — 공개 Home에서 읽어야 하기 때문이다.
4. **RPC 출력에 `visible_profile_count`(학교의 전체 공개 프로필 수, 기간과 무관)를 추가로 포함한다.** `types/ranking.ts`의 `remainingToNext`는 기간 내 신규 수가 아니라 전체 누적 인원 기준으로 계산해야 하는데(`lib/policy/schoolGrowth.ts`와 동일 정의), 이를 애플리케이션에서 학교별로 다시 조회하면 N+1이 된다. RPC 안에서 이미 `p_limit`으로 좁혀진 최종 결과 행에 한해서만 상관 서브쿼리로 채워 N+1을 피한다.
5. **동률 정렬에 `school_id ASC`를 4번째 기준으로 추가한다.** 정책은 신규 수 → 최근 등록 시각 → 학교명 3단계만 요구하지만, 동명 학교가 존재할 수 있어 완전한 결정적 정렬을 보장하려면 UUID인 `school_id`를 마지막 기준으로 추가하는 것이 안전하다.
6. **`p_limit`은 SQL에서 1~50으로 clamp한다(`LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50)`).** 상한 50은 요청 정책에 명시되지 않았으나, 무제한 조회를 막기 위한 최소한의 방어적 상한이다.
7. **부분 인덱스 `idx_profiles_visible_created_school (created_at DESC, school_id) WHERE is_hidden = false`를 추가한다.** 기존 `idx_profiles_created(created_at DESC)`는 `is_hidden` 조건과 `school_id` 그룹화를 지원하지 못해 이 쿼리 패턴에 실질적으로 동일하지 않다.
8. **TypeScript 래퍼(`getWeeklySchoolGrowthRanking`, `getTodayFastestGrowingSchool`)는 RPC 결과를 받은 뒤 `lib/policy/schoolRanking.ts::topGrowthRanking()`을 다시 통과시켜 `rank`를 부여한다.** SQL이 이미 정렬을 보장하지만, Phase 1A에서 확정한 순수 정렬 계약과의 일관성을 위해 재사용한다(재정렬은 결과에 영향을 주지 않는 멱등적 연산).

## Reason

- 저장소 전체에서 기존 RPC(`search_schools_v2`)의 실제 SQL 정의는 커밋되어 있지 않아(Supabase에서 직접 생성된 것으로 추정) 보안 모드(INVOKER/DEFINER)를 코드로 확인할 수 없었다. 따라서 이번 신규 RPC는 기존 RLS 정책만 근거로 최소 권한 원칙에 따라 독자적으로 결정했다.
- `03-level-policy.md`/`docs/decisions/2026-07-15-school-growth-foundation.md`가 이미 확정한 `remainingToNext`(전체 누적 인원 기준)와 순위 정렬 규칙을 재구현하지 않고 그대로 재사용해야 하므로, RPC 출력과 TypeScript 계약 사이의 간극(visible_profile_count)을 메우는 결정이 필요했다.

## Impact

- `supabase/migrations/20260715120000_school_growth_ranking_rpc.sql`(신규)에 RPC와 인덱스가 정의되어 있으나, 이번 세션에서는 Supabase에 적용하지 않았다.
- `lib/api/schools.ts`의 `getWeeklySchoolGrowthRanking`/`getTodayFastestGrowingSchool`은 이 RPC가 실제로 존재해야 정상 동작한다 — migration 적용 전까지는 호출 시 RPC 오류로 빈 배열/`null`을 반환한다(예외를 던지지 않음, 안전).
- Home UI/School Hub UI는 이번 Phase에서 연결하지 않는다.

## Status

APPROVED
