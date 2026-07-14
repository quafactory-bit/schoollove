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
