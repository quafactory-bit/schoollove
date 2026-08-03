# search_logs 원문 공개 조회 제거 및 집계 RPC 전환 결정

> PHASE 10L-C current status: the historical raw-query INSERT contract below is superseded. Application query persistence is removed, PUBLIC/anon/authenticated table and column INSERT is revoked, and `search_logs` is purged by the separately approved reset migration when applied. School search remains available. Any privacy-preserving search aggregate requires a new reviewed design and must not retain raw queries or person identifiers.

Date: 2026-07-17

## Decision

1. **`search_logs` 원본 행(query 원문, id, created_at 등)은 더 이상 anon/authenticated에게 공개하지 않는다.** School Hub가 실제로 필요로 하는 것은 "이 학교가 몇 번 검색됐는가"라는 숫자 하나뿐이며, 원본 로그 행을 그대로 노출할 이유가 없다.
2. **원본 조회 대신 `public.get_school_search_count(search_tokens text[])` 하나로 접근을 좁힌다.** `SECURITY DEFINER` + `SET search_path = ''`로 선언하고 `public.search_logs`를 스키마까지 명시해서 참조한다. 입력 토큰 배열을 앞에서부터 최대 8개로 제한 → btrim 후 길이 2~100인 토큰만 사용 → 중복 제거 → 각 토큰의 `query ILIKE '%' || token || '%'` 카운트 중 최댓값을 반환한다. `lib/api/searches.ts`의 기존 `getSchoolSearchCount()`가 여러 후보 토큰 중 가장 많이 잡힌 값을 쓰던 동작과 정확히 동일한 의미를 SQL에서 재현한 것이다.
3. **테이블 단위 SELECT 권한 자체를 회수한다(`REVOKE SELECT ... FROM anon, authenticated`).** RLS 정책의 존재 여부와 무관하게 동작하는 가장 확실한 차단이기 때문이다 — 이전 감사(Phase 5A)에서 저장소의 `supabase-schema.sql`이 운영 DB의 실제 RLS 정책과 다를 수 있음(schema drift)이 이미 확인된 바 있어, 정책 이름에만 의존하는 차단은 신뢰할 수 없다고 판단했다. 운영 대시보드에서 확인된 기존 공개 정책이 있다면 `DROP POLICY IF EXISTS`로 추가 제거하되, 이름이 실제와 다르더라도 no-op이라 안전하다.
4. **`logSearch()`의 INSERT 동작과 `search_logs_insert` 정책은 그대로 둔다.** 이번 변경은 읽기 경로에만 해당하며, 검색 로그를 기록하는 쓰기 경로는 기존과 동일하게 유지해야 State A 검색 수요 계산 등 후속 기능이 영향받지 않는다.
5. **`SECURITY DEFINER`를 선택한 이유**: 함수가 테이블 소유자(보통 `postgres`) 권한으로 실행되어, anon의 테이블 SELECT 권한을 회수해도 함수 자체는 계속 정상적으로 집계를 계산할 수 있다. `SECURITY INVOKER`였다면 SELECT 권한 회수와 동시에 함수도 깨졌을 것이다.

## Reason

- Phase 5A 감사에서 `search_logs`에 anon SELECT가 열려 있어 629건의 검색어 원문이 외부에 노출될 수 있음을 확인했다. 검색어 자체는 개인정보는 아니지만, 원본 로그를 무제한 공개 조회 가능하게 두는 것은 불필요한 노출이며 향후 개인 식별 가능한 검색(예: 특정 닉네임 검색)이 로그에 남을 가능성까지 고려하면 최소 권한 원칙에 맞지 않는다.
- 애플리케이션은 학교당 "검색 횟수" 숫자 하나만 쓰고 있었으므로(`app/school/[slug]/page.tsx` → `getSchoolSearchCount()`), 원본 테이블 접근을 완전히 막고 집계 결과만 반환하는 함수로 대체해도 기능 손실이 없다.
- 기존 `getSchoolSearchCount()`는 토큰별로 최대 8~9개의 개별 `.ilike` 카운트 쿼리를 왕복했는데, RPC 하나로 옮기면서 애플리케이션-DB 왕복 횟수도 함께 줄어드는 부수 효과가 있다(이번 결정의 주 목적은 아니지만 자연스럽게 얻어짐).
- `search_logs` 테이블 자체가 저장소의 `supabase-schema.sql`/`supabase/migrations/`에 없다(운영 DB에만 존재) — 이는 Phase 5A에서 이미 확인한 schema drift의 연장선이며, 이번 migration도 테이블을 새로 만들지 않고 기존 운영 테이블에 대한 함수/권한만 추가하는 형태로 작성했다.

## Impact

- 신규 파일: `supabase/migrations/20260717120000_search_logs_aggregate_rpc.sql`(+test), `lib/api/searches.test.ts`(신규 — 기존에 없었음).
- 수정 파일: `lib/api/searches.ts`(`getSchoolSearchCount()`가 직접 SELECT 대신 RPC 호출).
- 무수정: `lib/api/search.ts`의 `logSearch()`(INSERT), `schoolSearchTokens()`의 토큰 생성 로직, `app/school/[slug]/page.tsx`(호출부 시그니처 무변경), DB의 기존 629건 로그 데이터, rate limit/CAPTCHA/UI.

## 남은 blocker

- 이번 세션에서 원격 Supabase에 migration을 적용하지 않았다. 적용 전 운영 대시보드에서 (1) `search_logs`의 실제 컬럼 구성이 `query`/`created_at`/`id`/`result_count`(+ 문서상 계획된 `clicked_school_id`)와 일치하는지, (2) 실제 존재하는 공개 조회 정책 이름이 이 migration의 `DROP POLICY IF EXISTS "anon can read search_logs counts"`와 일치하는지(달라도 no-op이라 안전하지만 실제로 제거되는지 확인 필요), (3) 함수 적용 후 `getSchoolSearchCount()`가 School Hub에서 실제로 0이 아닌 값을 반환하는지 smoke test가 필요하다.

## Status

APPROVED — 적용 대기(운영 반영 전 수동 검토 필요)

## Follow-up status — 2026-07-18

위 Decision/Reason/Impact/남은 blocker는 2026-07-17 작성 당시(원격 미적용 상태) 기록이며 수정하지 않는다. 이후 별도 세션에서 원격 상태를 읽기 전용으로 확인한 결과는 다음과 같다.

- `20260717120000_search_logs_aggregate_rpc.sql`이 원격 `supabase_migrations.schema_migrations`에 존재한다(`statements`가 로컬 파일과 일치).
- 원격 `public.get_school_search_count(text[])`의 실제 정의(`pg_get_functiondef`)가 로컬 migration 본문과 일치한다.
- `SECURITY DEFINER`, `SET search_path = ''`(빈 값 고정), 역할별 `EXECUTE` 권한(`anon`/`authenticated`/`service_role`만 허용, `PUBLIC` 회수)이 모두 의도와 일치한다.
- `anon`/`authenticated`는 `search_logs`를 직접 `SELECT`할 수 없다(테이블 권한과 RLS 정책 양쪽에서 확인).
- 정상 토큰(비매칭 문자열) 기준 SQL 직접 호출과 anon PostgREST 호출(`supabase.rpc('get_school_search_count', ...)`) 스모크 테스트가 모두 성공했다(에러 없음, 정수 반환).
- `20260717130000_rls_manual_security_sync.sql`도 원격에 적용돼 있으며, 최종 INSERT 컬럼 권한(`query`/`result_count`/`clicked_school_id`)·RLS 정책(`search_logs_insert`)·제약조건(길이/음수 방지/외래키)이 로컬 migration과 일치한다.
- 원본 `query`/`id`/`created_at` 등 개별 검색 로그 행은 어떤 경로로도 노출되지 않음을 확인했다.
- 후속 정적·원격 감사에서 `get_school_search_count`의 `ILIKE '%' || token || '%'`가 사용자 토큰의 `%`, `_`, `\`를 리터럴이 아닌 ILIKE 패턴 문자로 처리하는 문제가 발견됐다. **이는 SQL injection이 아니다** — 함수는 여전히 파라미터화된 SQL만 실행하고 원본 로그 행을 반환하지 않는다. 실질 영향은 **aggregate count 범위의 정확성**뿐이다: 이런 문자가 포함된 토큰이 들어오면 그 토큰의 매칭 범위가 의도보다 넓어져(예: `_`가 임의의 한 글자와 매칭) 카운트가 실제보다 크게 나올 수 있다.
- 이 문서와 `20260717120000_search_logs_aggregate_rpc.sql` 파일은 수정하지 않으며, 와일드카드 리터럴 처리는 별도의 새 보정 migration으로 해결할 예정이다(설계만 완료, 아직 구현·적용 전).
- `search_logs.query`용 trigram 인덱스는 이번 보안 보정과 분리된 별도 성능 작업으로 검토할 예정이다(적용 여부 미결정).

**Status (as of 2026-07-18): APPLIED / VERIFIED — corrective migration planned**

## Resolution — 2026-07-18(후속)

위 Follow-up 상태 기록 이후, 와일드카드 리터럴 처리 보정(`20260718100000_escape_search_log_count_wildcards.sql`)을 구현·로컬 검증·원격 적용까지 완료했다(상세 내역은 `docs/IMPLEMENTATION_LOG.md`의 "Migration B 원격 적용 및 최종 검증 완료" 참고). `%`, `_`, `\`가 리터럴로 처리됨을 원격 SQL 직접 호출과 anon PostgREST 호출로 모두 확인했으며(`'%%'`, `'__'` 같은 순수 와일드카드 조합도 더 이상 전체 로그와 매칭되지 않음), 기존 함수 계약·권한·RLS 상태는 전혀 변경되지 않았다. `search_logs` 데이터는 이번 적용에서도 변경되지 않았다.

**Status (as of 2026-07-18, 후속): RESOLVED — 검색 로그 집계 RPC·RLS·와일드카드 보정 작업 완료.** 남은 항목은 성능 전용 P2(trigram 인덱스, 별도 migration으로 추후 검토)뿐이며 보안·기능 미완료 항목은 없다.
