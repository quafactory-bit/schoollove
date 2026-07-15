# SchoolLoveI Implementation Log

개발 구현 진행 상황을 기록합니다.

Decisions는 "왜 이렇게 결정했는가"를 기록합니다.

Implementation Log는 "실제로 무엇을 구현했는가"를 기록합니다.

---

## 기록 규칙

각 개발 작업 완료 후 아래 형식으로 기록합니다.

### YYYY-MM-DD

#### 구현

- 구현한 기능
- 변경한 화면
- 수정한 구조

#### 관련 파일

- 변경 파일 경로

#### 검증

- 테스트 결과
- 확인한 상태

#### 비고

- 남은 문제
- 후속 작업

---

## 2026-07-09

### 구현

- Design Package v1.0 개발 기준 확정
- Design Package FROZEN 상태 적용
- Product Principles 문서 추가
- Decisions 기록 구조 추가

### 관련 파일

- docs/design-package-v1.0/
- docs/decisions/

### 검증

- Design Package README 확인
- FROZEN 상태 확인
- Decisions 폴더 구조 확인

### 비고

- 이후 실제 기능 구현 완료 내역부터 순차 기록

---

## 2026-07-09 (2)

### 구현

- Level Policy 순수 모듈 구현 (docs/design-package-v1.0/03-level-policy.md 기준)
- threshold(1) = 0 명시적 예외, L >= 2는 `round(50 * L^1.5)` 공식 적용
- cumulativeXp를 입력받아 LevelState(level, xpIntoLevel, xpForNextLevel, remainingToNext)를 반환하는 `calculateLevelState` 구현
- 음수/NaN/Infinity cumulativeXp 입력을 0으로 클램프하여 음수 레벨이 발생하지 않도록 처리
- remainingToNext가 항상 1 이상의 정수가 되도록 ceil 적용
- 레벨 탐색을 지수 확장 + 이분 탐색으로 구현하여 매우 큰 cumulativeXp에서도 안전하게 동작
- 프로젝트에 테스트 러너가 없어 vitest를 devDependency로 추가하고 `test`, `typecheck` npm script 추가
- calculateLevelState 단위 테스트 11개 작성 (threshold 경계값, 음수/비정상 입력, 매우 큰 값, level >= 1 / remainingToNext >= 1 불변 조건 포함)

### 관련 파일

- types/level.ts (신규)
- lib/policy/levelPolicy.ts (신규)
- lib/policy/levelPolicy.test.ts (신규)
- package.json (`test`, `typecheck` script 추가, vitest devDependency 추가)
- package-lock.json (vitest 설치 반영)

### 검증

- `npx vitest run lib/policy/levelPolicy.test.ts` → 11 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` (현재 저장소의 유일한 테스트 스위트) → 11 passed

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id 로직은 이번 범위에 포함하지 않음
- 저장된 schools.current_level과의 비교/보존(레벨 하락 방지 저장 규칙, §8)은 이번 순수 계산 모듈 범위 밖이며 별도 구현 필요
- XP Source 연결(등록 1명 = 1 XP 등)은 이번 범위에 포함하지 않음 — calculateLevelState는 cumulativeXp만 입력으로 받음

---

## 2026-07-10

### 구현

- Level 저장/보존 계층 구현 (docs/design-package-v1.0/03-level-policy.md §8 기준)
- 순수 판단 함수 `resolveLevelUpdate(storedLevel, newState)` 구현 — Level 공식은 재구현하지 않고 `calculateLevelState()` 결과만 입력으로 받음
- 저장 판단 결과 계약 `LevelPersistenceDecision { level, shouldPersistLevel, levelIncreased }` 정의
  - `storedLevel = null`(미초기화/backfill 상태) → 최초 계산 Level 저장은 초기화이며 Level Up이 아님 (`shouldPersistLevel: true`, `levelIncreased: false`)
  - 저장된 유효 Level N → 더 높은 Level M(M > N) → 실제 Level Up (`shouldPersistLevel: true`, `levelIncreased: true`)
  - 그 외(하락 포함) → 변경 없음 (`shouldPersistLevel: false`, `levelIncreased: false`)
- FROZEN 문서 §8이 null 초기화와 실제 Level Up의 경계를 명시하지 않던 정책 공백을 확인하고, 위 판단 기준을 §8에 최소 문구로 명시함 (기존 학교 최초 backfill 시점이 "최근 레벨업" 신호를 오염시키지 않도록 하기 위함)
- Supabase I/O wrapper `syncSchoolLevel(schoolId, cumulativeXp)` 구현 (`lib/api/levels.ts`)
  - `calculateLevelState`는 최초 1회만 호출, 판단은 매 재시도마다 `resolveLevelUpdate`로 재실행
  - null 초기화는 `current_level IS NULL` 조건부 UPDATE로 `current_level`만 저장 (`level_updated_at` 미포함)
  - 실제 Level Up은 `current_level < target` 조건부 UPDATE로 `current_level`과 `level_updated_at`을 함께 저장
  - 조건부 UPDATE가 경쟁으로 0건이 되면 즉시 실패 처리하지 않고 최신 row를 refetch하여 `resolveLevelUpdate`로 재판단 후 재시도 (bounded retry, `MAX_RETRIES = 5`)
  - null 초기화 경쟁 시 낮은 target이 먼저 반영되어도, 재판단을 통해 결국 더 높은 target으로 수렴함을 시나리오 주석과 테스트로 확인
  - read error / init update error / increase update error / refetch error / retry 소진 모두 `null` 반환으로 통일 (완료되지 않은 상태를 정상 row처럼 반환하지 않음)
- Vitest가 `tsconfig.json`의 `@/*` path alias를 런타임에 resolve하지 못하던 테스트 인프라 공백을 발견하고 `vitest.config.ts`에 동일한 alias(`@` → repo root)를 추가해 해결 (기존 테스트들은 전부 `import type`만 사용해 alias가 컴파일 시 제거되는 바람에 이 공백이 드러나지 않았음)
- `resolveLevelUpdate` 단위 테스트 9개, `syncSchoolLevel` 단위 테스트(Supabase mock, 실제 DB 호출 없음) 12개 작성

### 관련 파일

- docs/design-package-v1.0/03-level-policy.md (§8 null 초기화 vs 실제 Level Up 구분 명시)
- types/level.ts (`LevelPersistenceDecision`, `SchoolLevelPersistenceRow` 추가)
- lib/policy/levelPersistence.ts (신규 — `resolveLevelUpdate`)
- lib/policy/levelPersistence.test.ts (신규 — 9 tests)
- lib/api/levels.ts (신규 — `syncSchoolLevel` Supabase I/O wrapper)
- lib/api/levels.test.ts (신규 — 12 tests, Supabase mock)
- vitest.config.ts (신규 — `@/*` alias를 Vitest 런타임에서도 resolve하도록 추가)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/levelPersistence.test.ts` → 9 passed
- `npx vitest run lib/api/levels.test.ts` → 12 passed
- `npm test` (전체 스위트: levelPolicy 11 + levelPersistence 9 + levels 12) → 3 test files, 32 passed

### 비고

- Register Flow 연결, XP Source 구현, profile count → XP 계산, School Hub/Home Feed/Feed Event 수정, clicked_school_id 로직, DB migration/RPC/trigger 실행, live Supabase 데이터 수정은 이번 범위에 포함하지 않음
- 기존 `School` 타입은 수정하지 않음 — Level 저장 projection은 `SchoolLevelPersistenceRow`라는 별도 타입으로 분리
- `syncSchoolLevel`은 아직 어디에서도 호출되지 않음 (Register Flow 등과 연결되지 않은 독립 모듈 상태)

---

## 2026-07-10 (2)

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 1: Level Snapshot Read Layer 구현
  - `getSchoolLevelSnapshot(schoolId)` 추가 (`lib/api/levels.ts`) — `current_level`, `level_updated_at`만 읽는 읽기 전용 조회, `syncSchoolLevel`/`resolveLevelUpdate`/`calculateLevelState`는 무수정
  - row 없음과 조회 오류 모두 `null`로 통일하는 단순 계약 유지, 별도 Result 타입 도입하지 않음
- SchoolLoveI Level Sync Tool v0.1 — Phase 2/3: Admin Level Sync Route 계약 설계 및 구현
  - Admin Level Sync Route 구현 완료
  - `POST /api/admin/tools/level-sync`
  - `cumulativeXp` nonnegative safe integer validation (`z.number().int().nonnegative().safe()`)
  - snapshot null → 500 `Snapshot failed`
  - sync null → 500 `Sync failed`
  - before/after는 초기 조회 상태와 최종 저장 상태 (didPersist/changed 필드 없음)
  - 기존 `requireAdmin(request)` 패턴을 그대로 복제해 재검증, 새 인증 체계 도입하지 않음
  - route test 12개 추가

### 관련 파일

- lib/api/levels.ts (`getSchoolLevelSnapshot` 추가)
- lib/api/levels.test.ts (`getSchoolLevelSnapshot` 테스트 5개 추가)
- app/api/admin/tools/level-sync/route.ts (신규)
- app/api/admin/tools/level-sync/route.test.ts (신규 — 12 tests)
- docs/tools/level-sync/00-scope-v0.1.md (신규 — v0.1 범위 문서)
- docs/decisions/2026-07-10-level-sync-xp-safe-integer.md (신규)
- docs/decisions/2026-07-10-level-sync-no-404.md (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- route test 12/12 통과
- 전체 `npm test` 49/49 통과

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id, XP Source, cumulative XP 자동 산출은 이번 범위에 포함하지 않음
- `/admin/tools/level-sync` UI는 아직 구현하지 않음 — 다음 단계는 Phase 4: UI 뼈대 구현 (`docs/tools/level-sync/00-scope-v0.1.md` §11 step 3)
- `getSchoolLevelSnapshot`/`syncSchoolLevel`의 null 계약(row 없음과 오류를 구분하지 않음)으로 인해 Level Sync Route는 404를 만들지 않고 원인 불명 실패를 전부 500으로 처리하기로 결정함 (decision 문서 참고)

---

## 2026-07-11

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 4: UI 뼈대 구현
  - `/admin/tools/level-sync` 페이지 구현 — 검색 → 선택 → 상세 표시
  - 학교 이름 검색: `searchSchools(query, 10)` 재사용
  - School ID 직접 조회: `getSchoolById(id)` 재사용
  - 선택된 학교 기본 정보 표시(school_name/school_type/sido·sigungu/slug/id)
  - 저장된 `current_level` / `level_updated_at` 표시
  - `getSchoolLevelSnapshot`은 service role 기반 서버 전용 함수라 클라이언트 컴포넌트에서 재사용하지 않음 — 기존 RLS(`schools_select_all`)와 `app/admin/profiles/page.tsx` 전례에 따라 anon Supabase client로 `current_level`, `level_updated_at` 두 컬럼만 명시적으로 select
  - 신규 조회 API Route는 추가하지 않음
  - sync 실행 UI, cumulativeXp 입력, 계산 미리보기, POST 연결은 포함하지 않음 (Phase 5/6으로 남김)

### 관련 파일

- app/admin/tools/level-sync/page.tsx (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npm test` → 4 test files, 49 tests 통과 (Phase 4는 신규 테스트 추가 없이 기존 테스트 회귀 없음만 확인)
- `.env.local` 부재로 실제 Supabase/admin 로그인 기반 브라우저 smoke test는 미실행
- 학교 이름 검색 결과 표시 / 검색 결과 클릭 선택 / School ID 직접 입력 조회 / 선택 학교 기본 정보 표시 / current_level·level_updated_at 표시 / 검색 결과 없음 상태 / 조회 오류 상태 — 7개 항목은 코드 정적 검토로만 확인, 라이브 브라우저 검증 아님

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id, XP Source, cumulative XP 자동 산출은 이번 범위에 포함하지 않음
- `getSchoolLevelSnapshot`/`syncSchoolLevel`/기존 Route 계약은 수정하지 않음
- 다음 단계는 Phase 5: `calculateLevelState` 클라이언트 미리보기 연결 + 실행 전 확인 화면 (`docs/tools/level-sync/00-scope-v0.1.md` §11 step 4-5)

---

## 2026-07-11 (2)

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 5: cumulativeXp 입력 + 계산 미리보기 + 실행 전 확인 화면
  - cumulativeXp 수동 입력 필드 추가 (XP Source는 아직 미연결이라는 경고 문구 포함)
  - `validateCumulativeXp`로 0 이상 safe integer validation — 빈 문자열은 미입력 상태(에러 아님)로 처리
  - 기존 `calculateLevelState` 재사용 — 계산 로직을 page.tsx에 복제하지 않음
  - 기존 `resolveLevelUpdate` 재사용 — 저장 판단 로직을 page.tsx에 복제하지 않음
  - UI 표시용 `compareStoredAndCalculatedLevel` 4분류(`uninitialized` / `increase` / `same` / `lower`) 추가 — 문구 결정용일 뿐, 실제 persistence 판단은 `resolveLevelUpdate`의 `shouldPersistLevel`/`levelIncreased` 반환값을 그대로 표시
  - 현재 저장 Level과 계산 Level 비교 표시
  - 실행 전 확인 영역 구현(선택 학교/입력 XP/저장 Level/계산 Level)
  - 동기화 실행 버튼은 disabled 상태로만 존재 — POST 연결 없음, DB 저장 없음
  - 학교를 새로 선택하면 `xpInput`을 초기화해 이전 학교의 입력값이 새 학교 미리보기에 남지 않도록 처리

### 관련 파일

- app/admin/tools/level-sync/validation.ts (신규)
- app/admin/tools/level-sync/validation.test.ts (신규)
- app/admin/tools/level-sync/page.tsx (Phase 5 UI 수정)

### 검증

- `npx tsc --noEmit` → 오류 없음
- Phase 5 validation test → 11/11 통과
- `npm test` → 5 test files, 60 tests 통과
- `.env.local` 부재로 실제 Supabase/admin 로그인 기반 브라우저 smoke test는 미실행

### 비고

- 다음 단계는 Phase 6: 실행 버튼 활성화 + 기존 Level Sync Route Handler 연결 + 실행 후 before/after 결과 표시

---

## 2026-07-13

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 6: 실행 버튼 활성화 + Route 연결 + 실행 후 before/after 결과 표시
  - 기존 `POST /api/admin/tools/level-sync` Route를 그대로 재사용 — Route 계약 변경 없음
  - request body `{ schoolId, cumulativeXp }`로 POST 호출
  - 실제 DB update는 client에서 직접 수행하지 않음 — 기존 Route Handler를 통해서만 수행
  - 실행 중 중복 클릭 방지 (`executing` 상태 + 버튼 disabled)
  - 실행 중에는 학교 검색 결과 선택 및 School ID 조회도 차단 — 응답 도착 시점에 다른 학교를 가리키는 race condition을 원천 차단
  - 새 학교를 선택하면 기존 입력값, 실행 결과, 실행 오류를 초기화
  - 새 실행을 시작하면 이전 실행 결과와 오류를 초기화
  - 성공 응답의 `before`/`after`/`cumulativeXp`를 그대로 저장하고 표시 — 실행 후 client에서 Level을 재계산하지 않음
  - 결과 문구는 `before`/`after`의 확정 사실만으로 판단 (최초 초기화 / 실제 저장 Level 상승 / 저장 Level 변경 없음) — 동일 Level과 downgrade 방지는 임의로 구분하지 않음
  - 성공 후 기존 `loadLevelSnapshot(schoolId)`을 재사용해 저장 상태 재조회
  - 실행 결과 패널은 Phase 5 미리보기 조건(`calculatedState`/`decision`/`comparison`)과 독립적으로 유지 — 실행 후 입력값을 바꿔도 결과가 사라지지 않음
  - 실패 시 `xpInput`과 기존 미리보기는 그대로 유지

### 관련 파일

- app/admin/tools/level-sync/page.tsx (Phase 6 UI 수정)

### 검증

- `npx tsc --noEmit` → 오류 없음
- Level Sync Route test → 12/12 통과
- `npm test` → 5 test files, 60 tests 통과
- `.env.local` 부재로 실제 Supabase/admin 로그인 기반 브라우저 smoke test는 미실행

### 비고

- Level Sync Tool v0.1은 코드 범위 완료
- 실제 Supabase/admin 환경 smoke test 완료
- 운영 승인만 남음

---

## 2026-07-14

### 구현

- Level Sync Tool v0.1 smoke test 수행
- 실제 Supabase 환경에서 검증
- 관리자 UI에서 검증
- 검증 경로:
  - `/admin/tools/level-sync`

- 더미 학교:
  - 이름: 스모크테스트더미학교
  - slug:
    - `smoke-test-level-sync-20260714`

- 시나리오 1:
  - 유형: 최초 초기화
  - cumulativeXp: 100
  - before.current_level: null
  - after.current_level: 1
  - level_updated_at: null 유지
  - 결과: 최초 초기화

- 시나리오 2:
  - 유형: 실제 저장 Level 상승
  - cumulativeXp: 141
  - before.current_level: 1
  - after.current_level: 2
  - after.level_updated_at:
    - `2026-07-14T06:26:20.583+00:00`
  - 결과: 실제 저장 Level 상승

- 시나리오 3:
  - 유형: 저장 Level 변경 없음
  - cumulativeXp: 200
  - before.current_level: 2
  - after.current_level: 2
  - before.level_updated_at:
    - `2026-07-14T06:26:20.583+00:00`
  - after.level_updated_at:
    - `2026-07-14T06:26:20.583+00:00`
  - UPDATE는 발생하지 않음
  - 결과: 저장 Level 변경 없음

- 테스트 종료 후 더미 학교 삭제
- 삭제 전 profile_count: 0
- 삭제 후 동일 slug 조회: 0 rows

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 개발 서버 재시작 완료
- `/admin/login` HTTP 200 확인
- 변경한 ADMIN_PASSWORD로 인증 성공
- smoke test 3개 모두 통과
- TypeScript 검증 통과
- Route 테스트 12/12 통과
- 전체 테스트 60/60 통과
- 테스트 데이터 삭제 완료

### 비고

- Level Sync Tool v0.1 기능 검증 완료
- 남은 단계는 운영 승인
- 다른 학교 선택 차단 검증은 선택 사항
- 해당 선택 사항은 완료 판단을 막지 않음

---

## 2026-07-14 (2)

### 구현

- Register Flow → Level 연결 Phase 1 (`docs/decisions/2026-07-14-register-flow-level-connection-phase0.md` Phase 0 결정 문서 기준)
- `app/submit/page.tsx`의 클라이언트 직접 `supabase.from('profiles').insert()` 호출을 제거하고, 공식 서버 Route `POST /api/profiles` 호출로 교체
- Register Flow의 화면, 문구, 입력 순서, 로딩 상태, 성공 UX는 무수정
- `POST /api/profiles`에서 프로필 insert 성공 직후, 해당 학교의 실제 프로필 수(`getSchoolProfileCount`)를 다시 조회해 `cumulativeXp`로 사용하고 기존 `syncSchoolLevel`을 호출 — 등록 1명 = 1 XP 잠정 정책만 사용
- Level Sync 실패(내부 오류 반환 또는 예외 발생)는 서버 로그만 남기고 프로필 등록 성공 응답(201)을 취소하지 않는 non-blocking 방식으로 구현
- 프로필 insert 자체가 실패한 경우(중복/validation/DB 오류)는 Level Sync를 호출하지 않음
- 기존 Zod validation과 Upstash rate limit(20회/60초/IP)은 무수정 재사용
- Route validation과 실제 submit 페이지 필드를 대조해 두 가지 불일치를 보완:
  - `is_self`, `message` 필드가 Zod 스키마에 없어 저장되지 않던 문제를 보완(FROZEN `12-db-schema.md`의 기존 `profiles` 컬럼 목록에 이미 존재하는 필드)
  - `graduation_year` 서버 validation 범위(1990~2035)가 submit 페이지의 실제 졸업년도 드롭다운 범위(1970~2032)와 달라 1970~1989년 졸업자가 서버에서 거부되던 문제를 실제 범위(1970~2032)로 보정
- `types/profile.ts`의 `Profile`/`ProfileInsert`에 누락되어 있던 `is_self`, `message` 필드 보완(DB에는 이미 존재하는 필드, 타입 정의만 실제와 불일치했음)

### 관련 파일

- `app/submit/page.tsx`
- `app/api/profiles/route.ts`
- `app/api/profiles/route.test.ts` (신규, 14 tests)
- `types/profile.ts`
- `docs/decisions/2026-07-14-register-flow-level-connection-phase0.md` (Phase 0 결정 문서, 별도 커밋 전 작성)

### 검증

- `npx vitest run app/api/profiles/route.test.ts` → 14 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` → 6 test files, 74 tests 통과 (기존 60 + 신규 14)
- `.env.local` 부재로 실제 Supabase/브라우저 기반 smoke test는 미실행

### 비고

- Feed event 생성(`FEED_EVENT_CREATED`)과 XP Source 최종 확정은 이번 범위에 포함하지 않음 — `14-open-issues.md`의 DEFERRED 상태 유지
- `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`, `lib/api/levels.ts`는 무수정 재사용
- School Hub, Home Feed, `search_logs.clicked_school_id`는 이번 범위 밖
- 배치 등록(여러 명 동시 제출) 시 인당 1회씩 Level Sync가 반복 호출되는 비효율 최적화는 후속 과제로 남김(Phase 0 결정 문서에 이미 기록됨)
- 실제 Supabase 환경에서의 수동 QA(더미 학교로 실제 `/submit` 등록 → `current_level` 변화 확인)는 아직 수행하지 않음

---

## 2026-07-14 (3)

### 구현

- Register Flow → Level Phase 1 실제 smoke test 준비 과정에서 발견된 실제 결함 2건 수정
- **결함 1 — Upstash rate limit 환경변수 누락 시 500**: 로컬 `.env.local`에 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`이 없을 때 `app/api/profiles/route.ts`의 `ratelimit.limit(ip)`에서 `Failed to parse URL from /pipeline` 예외가 발생해 `POST /api/profiles`가 처리되지 않은 500으로 끝나던 것을 확인
  - `app/api/profiles/route.ts`에 `checkRateLimit(ip)` helper를 분리해 Upstash 설정 여부를 먼저 확인
  - production: 설정 누락을 우회하지 않고 `console.error` 로그 후 명확한 `500 { error: '서버 설정 오류입니다.' }`로 fail-closed (`app/api/admin/auth/route.ts`의 `ADMIN_PASSWORD` 누락 처리와 동일 관례)
  - development/test: `console.warn` 경고만 남기고 rate limit을 건너뛰어 로컬 개발과 smoke test가 막히지 않도록 함
  - Upstash가 정상 설정된 경우(production 포함)의 기존 rate limit 정상/초과 동작은 무수정 유지
  - 실제 환경변수 값은 로그에 남기지 않음(존재 여부만 확인)
  - 저장소 내 다른 rate limit 사용처(`app/api/traces/route.ts`)를 조사했으나 동일한 fallback 관례가 없었음을 확인 — 이번 수정은 `app/api/profiles/route.ts`에만 적용하고 `app/api/traces/route.ts`는 이번 범위에 포함하지 않음(확인된 실제 결함이 아님)
- **결함 2 — 전체 실패 시 "완료" 문구 오표시**: `app/submit/page.tsx`에서 프로필 등록이 전부 실패(성공 0명 + 실패 1명 이상)해도 결과 화면 제목이 `연결 완료!`/`등록 완료!`로 표시되던 것을 확인
  - `app/submit/resultText.ts`(신규, `app/admin/tools/level-sync/validation.ts`와 동일한 "페이지 옆 순수 함수 모듈" 관례를 따름)에 `isAllFailed`, `resultHeading` 순수 함수 분리
  - 성공 0명 + 실패 1명 이상일 때만 제목을 `등록하지 못했어요`/`연결하지 못했어요`로 변경, 그 외(전체 성공/부분 성공/중복만 있는 경우)는 기존 `완료!` 문구 그대로 유지
  - 전체 실패 시 본문의 "N명 등록/연결됐어요" 줄만 숨기고, 기존 중복/실패 안내 줄과 레이아웃·재시도 버튼(`계속 등록하기`)은 무수정

### 관련 파일

- `app/api/profiles/route.ts` (rate limit fallback 추가)
- `app/api/profiles/route.test.ts` (신규 rate limit fallback 테스트 3개 추가, 기존 테스트는 Upstash 설정 상태를 명시적으로 stub하도록 보완)
- `app/submit/page.tsx` (전체 실패 시 문구 수정)
- `app/submit/resultText.ts` (신규)
- `app/submit/resultText.test.ts` (신규)

### 검증

- `npx vitest run app/api/profiles/route.test.ts app/submit/resultText.test.ts` → 23 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` → 7 test files, 83 tests 통과 (기존 74 + 신규 9)
- `.env.local` 부재로 실제 Supabase/브라우저 기반 재현 smoke test(수정 후)는 미실행

### 비고

- DB 변경, FROZEN 문서 변경, Level Policy/Persistence 수정, Feed event는 이번 범위에 포함하지 않음
- `app/api/traces/route.ts`에도 동일한 Upstash 설정 누락 패턴이 존재하나 이번에 확인된 실제 결함 범위가 아니므로 수정하지 않음 — 후속 검토 대상으로 남김
- 수정 후 실제 로컬 `.env.local` 없는 상태에서의 브라우저 재현 smoke test는 아직 수행하지 않음

---

## 2026-07-14 (4)

### 구현

- 결함 1(Upstash rate limit 환경변수 누락 시 500)과 결함 2(전체 실패 시 `연결 완료!` 오표시) 수정에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 검증 경로:
  - `localhost:3001` (`npm run dev`)
- 시나리오 1 — 정상 등록:
  - `/submit` 화면과 CSS 정상 렌더링 확인
  - `POST /api/profiles` → 201 응답
  - Upstash 환경변수가 없는 development 환경에서 rate limit 우회 warning 출력, 요청은 정상 처리됨(결함 1 수정 확인)
  - 결과 화면: `연결 완료!` + `1명 연결됐어요` 정상 표시
- 시나리오 2 — 전체 실패(브라우저 Network를 Offline으로 설정해 재현):
  - 성공 0명 · 실패 1명 상태 재현
  - 결과 화면: `연결하지 못했어요` + `1명은 등록에 실패했어요` 표시(결함 2 수정 확인)
  - 기존의 잘못된 `연결 완료!` 및 성공 인원 문장은 표시되지 않음
  - 테스트 후 Network 설정을 No throttling으로 복구

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 시나리오 2개 모두 통과(운영자 보고 기준)
- rate limit fallback(development 우회) 실제 동작 확인
- 전체 실패 결과 화면 문구 실제 동작 확인

### 비고

- Register Flow → Level Phase 1 및 rate limit/전체 실패 화면 수정의 수동 smoke test 완료
- 이번 smoke test는 `POST /api/profiles` 응답과 화면 문구만 확인했으며, `schools.current_level`/`level_updated_at`이 실제로 갱신됐는지는 이번 시나리오에 포함되지 않음 — DB 레벨 확인은 이전 턴에서 준비한 더미 학교 SQL을 사용한 별도 확인이 필요
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15

### 구현

- Register Flow → Level 연결 Phase 2 — 데이터 정합성·중복 처리·실패 처리 검증
- 기준 커밋 `c077c31`(Phase 1 완료 상태) 기준으로 `app/api/profiles/route.ts`, `lib/api/levels.ts`, `types/profile.ts`, 기존 테스트를 코드 레벨로 재분석한 결과, 코드 로직 자체의 결함은 발견되지 않음(상세는 아래 "확인된 사실" 참고)
- 다만 (a) 여러 명을 한 번에 등록할 때 학교당 신규 성공 건수만큼 `syncSchoolLevel`이 반복 호출되는 동작과 (b) 성공/중복/실패 배치 분류 로직이 `app/submit/page.tsx`의 `handleSubmit` 클로저 내부에 인라인되어 있어 자동 테스트가 불가능했던 두 가지 실제 확인 공백을 발견
- `app/submit/page.tsx`의 등록 루프(사람별 `POST /api/profiles` 순차 호출 + 성공/중복/실패 집계)를 `app/submit/registerPeople.ts`로 분리 — 동작은 100% 동일(로직 이동만), fetch 호출 순서/횟수/바디, 카운트 규칙 무변경
- `normalizeInsta`도 함께 이동(등록 루프와 강하게 결합된 순수 함수)
- 분리로 확보된 테스트 가능성을 이용해 배치 시나리오(신규 1명/중복만/신규+중복 혼합/여러 신규/실패/재시도) 테스트 8개를 `app/submit/registerPeople.test.ts`에 신규 작성
- `app/api/profiles/route.test.ts`에 배치·재시도 관점 테스트 2개 추가(같은 학교 신규 성공 2건 연속 시 `syncSchoolLevel`이 정확히 2번, 각기 다른 cumulativeXp로 호출되는지 / 성공 후 동일 등록 재시도 시 `syncSchoolLevel`이 최초 1회만 호출되는지)
- 코드 변경 없음: `app/api/profiles/route.ts`, `lib/api/levels.ts`, `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`, `types/profile.ts` — 분석 결과 기존 로직이 이미 정책을 만족해 수정 불필요로 판단

### 확인된 사실

- 신규 프로필 등록 성공 시: `app/api/profiles/route.ts`의 `profiles` insert 성공 직후(에러 없음)에만 `syncSchoolLevel` 호출. 중복(23505→409)과 그 외 실패(400/429/500)는 Level Sync 도달 전에 응답이 반환되어 호출되지 않음(회귀 테스트로 재확인)
- 여러 명 등록 시: 사람 1명 = `POST /api/profiles` 1회 = (성공 시) `syncSchoolLevel` 1회. N명 신규 성공이면 동일 학교에 대해 `syncSchoolLevel`이 N번 순차 호출됨(비효율이지만 데이터 정합성 문제는 아님 — 아래 "남은 blocker" 참고)
- Level Sync 실패 시: `try/catch`로 감싸져 있어 API 응답은 항상 `201 { data }` 유지(새 필드 추가 없음), 화면은 `res.ok` 여부만으로 success를 집계하므로 Level Sync 실패는 사용자에게 노출되지 않음(Phase 0 결정 문서의 채택된 권장안과 일치, 회귀 없음 확인)
- 재시도 시 XP/Level 중복 반영 가능성: 없음. `cumulativeXp`가 `getSchoolProfileCount`(실제 DB row count)로 매번 새로 계산되는 파생값이라 "누적 합산"이 아니며, `resolveLevelUpdate`의 저장 판단이 저장된 Level 이상으로만 갱신되는 단조 증가 정책이라 동일 값으로 재호출해도 재저장이 일어나지 않음(`lib/api/levels.test.ts` 기존 테스트 1·2로 이미 검증됨). 또한 `profiles` 테이블의 기존 unique index(`uq_profiles_identity`)가 동일 학교/졸업년도/학년/반/이름 조합의 재삽입을 DB 레벨에서 차단해, 재시도가 성공 응답을 두 번 받는 경우 자체가 발생하지 않음
- 부분 성공 시 success/dup/fail 카운트: `registerPeople`가 매 요청의 실제 HTTP 상태(201/409/그외)만으로 집계하므로 항상 실제 DB 결과와 일치하며, `success + dup + fail`이 시도 인원수와 항상 같음(신규 테스트로 검증)

### 관련 파일

- `app/submit/registerPeople.ts` (신규)
- `app/submit/registerPeople.test.ts` (신규, 8 tests)
- `app/submit/page.tsx` (등록 루프를 `registerPeople` 호출로 교체 — 동작 무변경)
- `app/api/profiles/route.test.ts` (배치/재시도 테스트 2개 추가)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run app/api/profiles/route.test.ts app/submit/registerPeople.test.ts app/submit/resultText.test.ts` → 35 passed
- `npm test` → 8 test files, 95 tests 통과 (기존 83 + 신규 12)
- `git diff --check` → 공백 오류 없음

### 비고

- 남은 blocker(정책 미확정, 임의 구현하지 않음): 여러 명 일괄 등록 시 학교당 `syncSchoolLevel`이 인당 1회씩 반복 호출되는 비효율은 Phase 0 결정 문서(`Concurrency considerations`)에서 이미 식별된 사항으로, 이번 Phase 2에서도 재확인만 하고 해결하지 않음. 해결하려면 `POST /api/profiles`를 배치 API로 바꾸거나(FROZEN `13-api.md` §10 "신규 P1 데이터 모델/배치 API 임의 추가 금지"와 상충 가능, 별도 결정 필요) 요청 간 상태를 공유하는 새 인프라가 필요해 이번 Phase 2의 "기존 정책 안에서 최소 구현" 범위를 벗어난다고 판단
- FROZEN `07-register-flow.md` §5의 "동명이인 허용 + 확인 후 등록 계속" 흐름은 현재 코드에 없고(DB unique index가 동일 이름을 즉시 차단), 이는 Phase 1 이전부터 존재하던 기존 Register Flow의 완성도 공백이며 Level Sync 연결과는 무관 — 이번 Phase 2 범위 밖으로 남김
- `app/api/traces/route.ts`, admin Level Sync 도구, 다른 rate limit 사용처는 무수정
- DB migration/schema 변경 없음
- Feed event, XP Source 최종 확정은 이번 범위에 포함하지 않음
- collector/BoostKitchen 관련 내용 없음
- 새로운 정책 결정이 없어 `docs/decisions/`에 신규 문서를 추가하지 않음

---

## 2026-07-15 (2)

### 구현

- Register Flow → Level Phase 2(배치 등록 정합성/중복 처리 검증, `registerPeople` 분리)에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 시나리오 — 같은 학교에 친구 3명 동시 제출(신규 2명 + 기존 인물과 동일한 중복 1명):
  - 결과 화면: `2명 등록됐어요` 정확히 표시(신규 성공 카운트 일치)
  - 결과 화면: `1명은 이미 등록되어 있었어요` 정확히 표시(중복 카운트 일치)
  - 학교 전체 인원: 기존 1명 + 신규 성공 2명만 반영되어 `3명이 함께 있어요` 표시 — 중복 1명은 전체 인원에 추가 반영되지 않음
  - 실패 문구·500 오류 없음
  - `registerPeople` 모듈 분리 이후에도 기존 등록 UI와 부분 중복 집계 정상 동작 확인

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 1개 시나리오 통과(운영자 보고 기준)
- 신규 2명/중복 1명 배치 등록의 성공·중복 카운트, 학교 전체 인원 반영이 모두 실제 화면에서 기대값과 일치함을 확인

### 비고

- Register Flow → Level Phase 2의 배치(신규+중복 혼합) 등록 시나리오 수동 smoke test 완료
- 이번 smoke test는 화면 카운트와 학교 전체 인원 표시만 확인했으며, `schools.current_level`/`level_updated_at`이 신규 성공 2건 기준으로 정확히 갱신됐는지는 DB 레벨로 별도 확인되지 않음(이전 턴에서 준비한 더미 학교 SQL로 별도 확인 필요)
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15 (3)

### 구현

- Register Flow → Level 연결 Phase 3 — 학교 실제 profile count, 저장된 Level 상태, 학교 페이지 표시 간 정합성 분석
- 기준 커밋 `934c26e` 기준으로 `app/school/[slug]/page.tsx`, `app/school/[slug]/[year]/page.tsx`, `app/school/[slug]/[year]/[class]/page.tsx`, `lib/api/schools.ts`, `lib/api/profiles.ts`, `lib/api/levels.ts`, `types/school.ts`, `next.config.ts`, `app/admin/tools/level-sync/page.tsx`(읽기 전용 확인, 무수정)를 코드 레벨로 분석
- **핵심 발견 — 코드 결함 없음**: School/Year/Class 페이지 어디에도 `current_level`/`level_updated_at`을 표시하는 코드가 없음(`current_level`/`level_updated_at`을 참조하는 곳은 `lib/api/levels.ts`, `lib/policy/levelPersistence.ts`, admin Level Sync 도구뿐). 즉 이번 Phase 3이 검증 대상으로 삼은 시나리오 f/g/h(Level null 처리, 저장값 vs 계산값 우선순위, Level Sync 성공 후 화면이 최신 저장값을 읽는지)는 **공개 학교 페이지에는 적용 대상 자체가 없음** — Level 표시는 Phase 0 결정 문서에서 이미 "School Hub 화면 변경"으로 범위 밖 처리된 항목이며, 구현 원칙 2("정책에 명확히 없으면 임의로 UI를 추가하지 않는다")에 따라 이번에도 추가하지 않음
- profile count(화면에 유일하게 표시되는 정합성 대상)는 School/Year/Class 세 페이지 모두 `lib/api/profiles.ts`의 count 함수(`getProfilesBySchool`/`getYearProfileCount`/`getClassProfileCount`/`getSchoolProfileCount`)를 통해 매 요청마다 `is_hidden=false` 기준으로 DB에서 새로 계산되며, 이는 Level Sync의 `cumulativeXp` 소스(`getSchoolProfileCount`)와 완전히 동일한 정의를 공유함 — 화면 인원 수와 Level 계산의 count 정의가 서로 다를 경로 없음
- 캐시/정적 렌더링으로 인한 staleness 위험 재확인: School 페이지는 `headers()` 사용으로, School/Year/Class 페이지 모두 `searchParams` 사용으로 Next.js가 자동으로 동적 렌더링을 강제함(둘 다 Next.js App Router에서 정적 캐싱을 무효화하는 API). 추가로 이 저장소의 Next.js 버전(`^15.3.8`)은 fetch 요청이 기본적으로 캐시되지 않는 버전이라 서버 측 캐싱으로 인한 stale 데이터 경로는 발견되지 않음. 다만 클라이언트 라우터 캐시(Link를 통한 소프트 내비게이션)는 정적 코드 분석만으로 100% 확증할 수 없어 "수동 smoke test 필요 여부"에 별도로 남김
- admin Level Sync 도구(무수정, 읽기 전용 확인만)는 이미 `current_level: null`을 "미초기화 (null)"로 명시 표시하고, 저장값을 우선 표시하며 계산값이 더 낮을 때 "하락 없음"을 명시하는 등 구현 원칙 7·8을 이미 만족하고 있음을 확인
- 코드 변경 없음(결함 미발견) — `lib/api/profiles.ts`(테스트 신규 추가는 있으나 함수 로직 무수정 회귀 테스트만 작성)를 포함해 이번 Phase 3에서 실제 소스 코드는 수정하지 않음
- `lib/api/profiles.ts`의 count 함수들(School Hub/Year/Class 화면과 Level Sync가 공유하는 유일한 profile count 소스)에 대한 테스트가 전무했던 공백을 발견해 `lib/api/profiles.test.ts` 신규 작성 — 쿼리 필터(`school_id`/`graduation_year`/`grade`/`class_number`/`is_hidden=false`)가 의도한 그대로인지, 오류·null 시 0/빈 배열로 안전하게 처리되는지 회귀 고정

### 관련 파일

- `lib/api/profiles.test.ts` (신규, 8 tests)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/api/profiles.test.ts` → 8 passed
- `npm test` → 9 test files, 103 tests 통과 (기존 95 + 신규 8)
- `git diff --check` → 공백 오류 없음

### 비고

- 결함 없음 — School/Year/Class 페이지의 profile count 표시는 이미 항상 최신 DB 값을 정확한 필터로 읽고 있으며, Level Sync와 동일한 count 정의를 공유함
- Level 표시(f/g/h 시나리오)는 공개 페이지에 아직 노출되지 않아 검증 대상이 없음 — School Hub에 Level을 실제로 노출하려면 별도의 School Hub 화면 변경 결정이 선행되어야 하며, 이는 Phase 0에서 이미 범위 밖으로 명시된 항목이라 이번 Phase 3에서 임의로 추가하지 않음(blocker로 보고, 새 정책 결정 없이는 구현하지 않음)
- admin Level Sync 도구는 읽기 전용으로만 확인했고 무수정
- DB migration/schema 변경 없음, FROZEN 문서 무수정
- collector/BoostKitchen 관련 내용 없음
- 코드 결함이 없어 `docs/decisions/`에 신규 문서를 추가하지 않음

---

## 2026-07-15 (4)

### 구현

- Register Flow → Level Phase 3(학교 페이지 profile count 정합성 분석)에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 시나리오 — 학교 페이지 → 등록하기 링크 이동 → 신규 1명 등록 → 성공 화면의 `우리 학교 페이지에서 확인하기` 링크(소프트 내비게이션)로 복귀:
  - 브라우저 새로고침 없이 등록 인원이 기존 3명 → 4명으로 즉시 반영됨
  - 학교 카드에 `4명 등록` 표시
  - 안내 영역에 `이미 4명이 모였어요` 표시
  - 프로필 목록에도 실제 4개 항목 표시
  - 클라이언트 라우터 캐시로 인한 오래된 count 표시는 발생하지 않음 — Phase 3 분석에서 남겼던 유일한 미확증 항목(Client Router Cache staleness)이 실제로 문제없음을 확인

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 1개 시나리오 통과(운영자 보고 기준)
- 신규 등록 후 소프트 내비게이션으로 학교 페이지 복귀 시 최신 profile count가 즉시 반영됨을 확인

### 비고

- Register Flow → Level Phase 3의 남은 blocker 중 "클라이언트 라우터 캐시로 인한 stale count 가능성"이 이번 smoke test로 해소됨
- Level 표시(f/g/h 시나리오) 관련 blocker(School Hub 화면 변경 미착수)는 여전히 유효 — 이번 smoke test 범위 밖
- collector/BoostKitchen 관련 내용 없음
