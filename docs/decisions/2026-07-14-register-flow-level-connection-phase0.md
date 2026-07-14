# Register Flow → Level 실제 연결 — Phase 0 결정 문서

Date: 2026-07-14

Status: **APPROVED (Phase 0 — 방향/설계 결정만. 코드/DB 변경은 Phase 1 이후)**

## Context

Level Policy(`lib/policy/levelPolicy.ts`), Level 저장 계층(`lib/policy/levelPersistence.ts`, `lib/api/levels.ts::syncSchoolLevel`)은 구현·테스트가 완료되어 있으나, 실제 사용자가 쓰는 등록 경로(`app/submit/page.tsx`)와는 전혀 연결되어 있지 않다. `app/submit/page.tsx`는 `supabase.from('profiles').insert()`를 클라이언트에서 직접 호출하며, rate limit·서버 validation·Level 계산 어느 것도 거치지 않는다.

반면 저장소에는 이미 `app/api/profiles/route.ts`(Upstash rate limit + zod validation 포함 서버 라우트)와, 이를 호출하는 `lib/api/profiles.ts::insertProfile()` 함수가 존재한다. 다만 `insertProfile()`은 현재 `components/SubmitForm.tsx`에서만 참조되고, `SubmitForm.tsx` 자체는 `app/` 하위 어디에서도 import되지 않는 미사용(dead) 컴포넌트다. 즉 "서버 API를 경유하는 등록" 경로는 이미 한 번 시도됐지만 실제 화면과 연결되지 못한 상태로 남아 있다.

`07-register-flow.md` §9는 이런 미사용 구현체를 실제 라우트 기준(`app/submit/page.tsx`의 사용자 흐름)과 대조한 뒤 통합하라고 명시한다. `13-api.md` §4는 Register API의 책임으로 "LevelState 재계산 / level persistence / Feed event 생성 연결"을 명시한다.

### 확인된 사실 (코드 대조 결과)

1. **`app/submit/page.tsx` 현재 제출 데이터 구조**: `people` 배열을 순회하며 사람마다 개별로 `supabase.from('profiles').insert({ school_id, graduation_year, grade, class_number, department, student_year, nickname, instagram_id, is_self, message })`를 호출한다. 전체 성공/중복/실패 건수를 집계한 뒤, 마지막에 `getSchoolProfileCount`와 동일한 방식의 count 쿼리(`profiles` where `school_id` + `is_hidden=false`)를 1회 별도 호출해 `totalAtSchool`을 계산한다.
2. **`app/api/profiles/route.ts` request/response 구조**: `POST` 단일 프로필만 받는다. Zod 스키마는 `school_id, graduation_year, grade, class_number, department, student_year, nickname, instagram_id`만 정의하며 **`is_self`, `message` 필드가 빠져 있다.** 성공 시 `{ data }` 201, 실패 시 `{ error }` (400/409/429/500).
3. **두 경로 차이**:
   - Validation: submit page는 클라이언트 측 최소 체크만. route.ts는 zod 서버 validation을 거치지만 `is_self`/`message`를 검증·저장하지 못하는 상태(스키마 누락).
   - Rate limit: submit page는 rate limit이 전혀 걸리지 않음(직접 client insert). route.ts는 Upstash `slidingWindow(20, '60 s')`(IP 기준) 적용.
   - RLS/권한: 둘 다 `supabaseServer`/`supabase`(anon key, RLS 적용) 사용 — service role은 쓰지 않음. `syncSchoolLevel`만 `getSupabaseAdmin()`(service role, RLS 우회)을 쓴다.
4. **Level Sync 호출 위치**: `app/api/profiles/route.ts`의 `POST` 핸들러 내부, `profiles` insert 성공 직후(에러 응답 반환 이전 마지막 단계)로 결정한다. 상세는 "Level Sync insertion point" 참고.
5. **cumulativeXp 계산 재사용 함수**: `lib/api/profiles.ts::getSchoolProfileCount(schoolId)`가 이미 존재하며 `profiles` where `school_id` + `is_hidden=false` count를 반환한다. 이는 `03-level-policy.md` §5의 School State 기준("누적 등록 수 = visible profiles count")과 정확히 일치하고, `is_self` 여부를 구분하지 않아 Product Principle 4("본인 등록과 친구 등록을 철학상 분리하지 않는다")와도 정합한다. **신규 카운트 함수를 만들지 않고 이 함수를 그대로 재사용한다.**
6. **Level Sync 실패 처리**: 기존 FROZEN 문서(`07-register-flow.md`, `13-api.md`)는 Level 재계산 실패 시 프로필 등록 자체를 어떻게 처리할지 명시하지 않는다. 이 결정은 문서만으로 확정되지 않으므로 아래 "Failure semantics"에 권장안/대안을 구분해 기록한다.
7. **중복 제출/동시 등록 위험**: 아래 "Concurrency considerations" 참고. 결론적으로 `syncSchoolLevel`의 기존 조건부 UPDATE + bounded retry(이미 구현·테스트됨)가 동시 등록 경쟁을 이미 안전하게 처리하므로 추가 잠금 장치는 필요 없다고 판단한다. 단, 배치(여러 명 동시 등록) 시 인당 1회씩 `syncSchoolLevel`이 반복 호출되는 비효율은 Phase 1 설계 과제로 남긴다.
8. **다음 구현 Phase에서 수정할 파일**: 아래 "Files planned for next Phase" 참고.
9. **필요한 테스트**: 아래 "Test plan" 참고.

## Decision

1. `app/api/profiles/route.ts`를 공식 프로필 등록 경로로 확정한다.
2. `app/submit/page.tsx`의 직접 Supabase insert는 Phase 1에서 이 라우트를 호출하는 방식(`fetch('/api/profiles', ...)` 또는 기존 `insertProfile()` 재평가)으로 교체한다. 여러 명을 등록하는 현재 UX(사람별 개별 insert 반복)는 유지하고, 반복 호출 대상만 client insert → server API로 바꾼다.
3. Register Flow의 화면, 문구, 입력 순서, 성공 화면(UX)은 변경하지 않는다. 이번 결정은 오직 "제출이 어떤 경로를 타는가"에 관한 것이다.
4. 기존 rate limit(Upstash `slidingWindow(20, '60 s')`)과 zod validation을 그대로 재사용한다. 단, 현재 zod 스키마에 없는 `is_self`, `message` 필드를 Phase 1에서 스키마에 추가해야 한다(현재 라우트로는 두 필드가 저장되지 않아 기존 submit page 동작과 동등하지 않음 — 이는 이번 phase 0에서 발견한 사실이며 새로운 정책이 아니라 기존 submit 동작을 그대로 유지하기 위한 필수 보완이다).
5. `syncSchoolLevel(schoolId, cumulativeXp)`, `calculateLevelState`, `resolveLevelUpdate`는 무수정 재사용한다. Level 공식이나 저장 판단 로직을 route에 복제하지 않는다.
6. cumulativeXp는 `getSchoolProfileCount(school_id)`(insert 성공 이후 재조회한 값)를 그대로 사용한다. 이는 `03-level-policy.md` §4의 잠정 소스("등록 1명 = 1 XP")를 코드로 그대로 구현한 것이며 새로운 가치 모델이 아니다.
7. XP Source 최종 제품 결정은 계속 보류 상태로 둔다. 이번 연결은 `14-open-issues.md`의 DEFERRED 상태를 변경하지 않는다.
8. Feed event 생성(`FEED_EVENT_CREATED`)은 이번 범위에 포함하지 않는다. `12-db-schema.md` §6("P1 신규 event table 추가 금지, Home Feed는 기존 이벤트 원천을 조합")과 상충하지 않도록 별도 Phase에서 설계한다.
9. DB 스키마 변경과 실제 코드 연결(라우트 수정, submit page 수정)은 Phase 0에서 수행하지 않는다. Phase 0은 이 결정 문서 작성으로 종료된다.

## Registration sequence

Phase 1에서 구현될 것으로 결정된 순서(코드는 이번에 작성하지 않음):

```text
클라이언트: 사람 1명 제출
  ↓
POST /api/profiles { school_id, graduation_year, grade, class_number, department, student_year, nickname, instagram_id, is_self, message }
  ↓
Route: rate limit 체크 (기존 20/60s, 무수정)
  ↓
Route: zod validation (기존 스키마 + is_self/message 추가)
  ↓
Route: supabaseServer.from('profiles').insert(...)
  ↓
insert 성공?
  ├─ 아니오(23505 등) → 기존과 동일한 에러 응답 (무수정)
  └─ 예
      ↓
    cumulativeXp = getSchoolProfileCount(school_id)  ← insert 이후 재조회
      ↓
    syncSchoolLevel(school_id, cumulativeXp)          ← 기존 함수, 무수정
      ↓
    Level Sync 성공/실패와 무관하게 profile insert 성공 응답 반환
    (실패 처리 세부는 "Failure semantics" 참고)
  ↓
클라이언트: 다음 사람 반복 (기존 submit page의 for 루프 구조 유지)
```

## Level Sync insertion point

`app/api/profiles/route.ts`의 `POST` 핸들러 내부, `profiles` insert가 성공한 직후, 함수가 `NextResponse.json({ data }, { status: 201 })`을 반환하기 직전 지점.

근거:
- `syncSchoolLevel`은 `getSupabaseAdmin()`(service role)을 사용하므로 반드시 서버 실행 컨텍스트 안에서 호출해야 한다 — 클라이언트나 `app/submit/page.tsx`에서 직접 호출 불가.
- insert가 실패(중복/validation 오류 등)한 경우에는 애초에 학교 등록 수가 늘지 않았으므로 Level Sync를 시도하지 않는다.
- Level Sync는 insert 트랜잭션의 일부가 아니라 insert 이후의 후행 단계로 둔다 (아래 Failure semantics 참고).

## Failure semantics

FROZEN 문서(`07-register-flow.md`, `13-api.md`)는 "Level 재계산 실패 시 등록 자체를 어떻게 처리할지"를 명시하지 않는다. 아래는 권장안과 대안을 구분한다.

### 권장안 — Level Sync 실패는 프로필 등록 성공 응답을 막지 않는다

- `syncSchoolLevel`이 `null`(읽기 오류/쓰기 오류/재시도 소진)을 반환해도, 프로필 insert는 이미 성공했으므로 라우트는 여전히 `201 { data }`를 반환한다. 서버 로그(`console.error`)로만 실패를 남긴다.
- **근거**:
  - `03-level-policy.md`의 불변 조건("레벨은 절대 내려가지 않는다")과 cumulativeXp를 매번 `getSchoolProfileCount`로 다시 계산하는 방식 덕분에, 이번 Level Sync가 실패해도 **다음 등록 시점의 Level Sync가 자동으로 누락분을 포함해 재계산**한다. 즉 Level 값은 자기 치유(self-healing)되며 별도 보정 로직이 필요 없다.
  - `00-product-constitution.md` §2의 핵심 약속은 "등록은 기여"이지 "Level 계산은 기여"가 아니다. 사용자의 실제 행동(프로필 등록)이 성공했다면 그 자체로 기여는 완료된 것이며, 부차 지표인 Level 표시 갱신이 일시적으로 지연되는 것이 등록 자체를 실패시킬 이유가 되지 않는다.
  - 이미 존재하는 관리자용 Level Sync Tool로 개별 학교의 Level을 수동 재동기화할 수 있어, 실패가 장기간 방치될 경우의 최후 수단이 확보되어 있다.

### 대안 — 등록 응답에 Level Sync 성공 여부를 포함해 클라이언트에 알린다

- 라우트가 `{ data, levelSyncFailed: true }`처럼 부가 필드를 반환하고, `app/submit/page.tsx`가 이를 감지해 로그를 남기거나(사용자 노출 없이) 향후 모니터링에 활용.
- 장점: 실패를 조기에 가시화할 수 있음.
- 단점: `13-api.md` §1의 Response Convention(`{ data, error }`)을 벗어난 필드를 추가하는 것이므로 API 계약 확장에 대한 별도 결정이 필요하고, Register Flow 화면에 새로운 상태를 노출하면 안 된다는 "화면 변경 없음" 제약과 충돌할 수 있음.
- Phase 1에서 이 대안을 채택하려면 별도 결정 문서가 필요하다.

**본 문서는 권장안을 Phase 1의 기본 구현 방향으로 채택할 것을 제안하되, 최종 채택 여부는 Phase 1 착수 시 다시 확인한다.**

## Concurrency considerations

- **동일 학교 동시 등록(여러 사용자)**: `syncSchoolLevel` 내부에 이미 구현·테스트된 조건부 UPDATE(`current_level IS NULL` 또는 `current_level < target`) + bounded retry(`MAX_RETRIES = 5`) 로직이 경쟁을 처리한다. 두 요청이 서로 다른 cumulativeXp(예: 카운트 read 타이밍 차이로 N, N+1)를 계산해 동시에 `syncSchoolLevel`을 호출해도, 낮은 target이 먼저 반영된 뒤 refetch → 재판단을 거쳐 결국 더 높은 target으로 수렴하는 시나리오가 이미 코드 주석과 테스트로 확인되어 있다(`lib/api/levels.ts` 상단 주석, `lib/api/levels.test.ts`). Phase 1에서 이 로직을 재사용하는 한 추가 잠금 장치는 필요 없다.
- **동일 요청 내 다건 등록(친구 여러 명 한 번에 제출)**: 현재 submit page는 사람마다 개별 insert를 순차 반복한다. Phase 1에서 각 insert가 각각 `/api/profiles`를 호출하고 각각 내부에서 `syncSchoolLevel`을 실행하면, N명 등록 시 `syncSchoolLevel`이 N번 순차 호출된다. 안전하지만(매번 최신 count를 다시 읽으므로 최종값은 정확) 불필요하게 반복적이다. **이 비효율을 이번 Phase 0에서 해결하지 않는다** — 단일 프로필 API 계약(`13-api.md` §4, §10 "API route별 Level 공식 금지"와 별개로 "신규 P1 데이터 모델/배치 API 임의 추가 금지" 원칙과의 정합을 봐야 하므로) 개선 여부는 Phase 1에서 별도로 판단한다.
- **Rate limit과의 상호작용**: 현재 submit page는 rate limit을 전혀 거치지 않아 여러 명을 빠르게 반복 제출해도 막히지 않는다. Phase 1에서 `/api/profiles`를 경유하면 기존에 이미 승인된 rate limit(`13-api.md` §8, `20회/60초/IP`)이 처음으로 실제 사용자 등록 흐름에 적용된다. 이는 새로운 정책이 아니라 기존 FROZEN 문서에 이미 명시된 제어를 실제로 작동시키는 것이지만, 한 번에 등록 가능한 친구 수가 사실상 이 한도 안으로 제한된다는 실질적 변화가 생긴다. Phase 1 구현/QA 시 확인이 필요하다.
- **read-after-write**: `getSchoolProfileCount`가 방금 커밋된 insert를 즉시 반영해서 읽는지는 Supabase(Postgres) 기본 동작상 문제없을 것으로 예상되나, Phase 0에서 실측 검증하지 않았다. Phase 1 테스트 계획에 포함한다.

## Files planned for next Phase

**수정**
- `app/submit/page.tsx` — 사람별 `supabase.from('profiles').insert()` 직접 호출을 서버 API 호출로 교체. 화면/문구/입력 순서/성공 UX는 무수정.
- `app/api/profiles/route.ts` — insert 성공 후 `syncSchoolLevel` 호출 추가, zod 스키마에 `is_self`/`message` 필드 추가.
- `types/profile.ts` — `Profile`/`ProfileInsert`에 `is_self`, `message` 필드 누락 여부 재검토 후 필요 시 보완(현재 타입에 없으나 DB/화면에서는 이미 사용 중인 필드).

**신규(검토 대상, 확정 아님)**
- `app/api/profiles/route.test.ts` — 현재 존재하지 않음. Phase 1에서 추가 여부 결정.
- `lib/api/profiles.test.ts` — 현재 존재하지 않음. `getSchoolProfileCount` 등 재사용 함수의 회귀 테스트 부재 확인됨.

**수정 없음(예상)**
- `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`, `lib/api/levels.ts` — 기존 함수 그대로 재사용.
- `components/SubmitForm.tsx`, `lib/api/profiles.ts::insertProfile()` — 기존에 존재하지만 미사용인 구현체. Phase 1에서 이를 그대로 재사용할지, 아니면 submit page에 새 호출 로직을 작성할지는 Phase 1에서 결정한다(이번 문서는 결정하지 않음).
- `middleware.ts`, `lib/admin-auth.ts` — 관계 없음.

## Test plan

- `app/api/profiles/route.test.ts`(신규): 정상 등록 + Level Sync 성공 케이스, Level Sync 실패 시에도 프로필 등록 응답이 유지되는지(권장안 채택 시), 기존 rate limit(429)/validation(400)/중복(409) 회귀, `is_self`/`message` 필드 저장 확인.
- `lib/api/profiles.test.ts`(신규): `getSchoolProfileCount`가 Level Sync의 cumulativeXp 소스로 쓰일 때의 동작(빈 학교/기존 등록 학교) 검증.
- 기존 `lib/api/levels.test.ts`, `lib/policy/levelPolicy.test.ts`, `lib/policy/levelPersistence.test.ts`: 무수정, `npm test` 전체 회귀만 재확인.
- 동시성 회귀: `lib/api/levels.test.ts`에 이미 존재하는 경쟁 시나리오 테스트가 Register Flow 연결 이후에도 유효한지 확인(무수정이므로 통과 예상, 확인만).
- 수동 QA(Phase 1 완료 후, 기존 IMPLEMENTATION_LOG 패턴과 동일하게): 더미 학교에 실제 `/submit` 화면으로 1명/다건 등록 → `current_level` 변화 확인 → 화면 UX(문구/순서/성공 화면)가 이전과 동일한지 육안 확인 → 더미 데이터 삭제.
- read-after-write 실측: insert 직후 `getSchoolProfileCount` 호출이 방금 삽입된 행을 포함하는지 실제 Supabase 환경에서 확인.

## Out of scope

- XP Source 최종 제품 결정 (`14-open-issues.md` DEFERRED 유지)
- Feed event 생성(`FEED_EVENT_CREATED`) 및 Home Feed 반영
- School Hub 화면 변경
- `search_logs.clicked_school_id` 연결
- DB 스키마/마이그레이션 변경
- Register Flow 화면/문구/입력 순서/성공 UX 변경
- 실제 코드 수정(route.ts, submit page, types) — Phase 1로 이연
- 배치 등록 시 `syncSchoolLevel` 반복 호출 최적화(§ Concurrency considerations) — Phase 1 별도 판단
- Level Sync 실패 처리 대안(§ Failure semantics 대안)의 최종 채택 여부 — Phase 1 착수 시 재확인
