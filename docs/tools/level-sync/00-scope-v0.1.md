# SchoolLoveI Level Sync Tool v0.1 — Scope

Status: DRAFT (구현 전 범위 문서)

---

## 1. 목적

현재 구현된 Level Persistence 계층(`calculateLevelState`, `resolveLevelUpdate`, `syncSchoolLevel`)은 프로덕션 코드와 단위 테스트로만 존재하고, 이를 사람이 직접 조회·검증·실행할 수 있는 인터페이스가 없다.

Level Sync Tool v0.1의 목적은 운영자/개발자가 학교 단위로

- 저장된 Level 상태를 조회하고
- 계산된 Level과 비교하고
- 필요 시 `syncSchoolLevel`을 수동으로 1회 실행해 결과를 확인

할 수 있게 하는 것이다. 이 도구는 범용 `Integration Tool`이 아니라 Level Persistence 하나만을 위한 좁은 범위의 검증 도구다.

---

## 2. 현재 문제

- `schools.current_level`, `schools.level_updated_at`을 읽는 코드는 `lib/api/levels.ts` 내부(`syncSchoolLevel`)에만 존재하며, 그 값을 사람이 확인할 수 있는 화면이 없다.
- `syncSchoolLevel(schoolId, cumulativeXp)`는 구현·테스트가 완료되어 있으나 어디에서도 호출되지 않는 독립 모듈 상태다.
- cumulative XP를 계산하거나 조회하는 코드가 저장소 전체에 존재하지 않는다. XP Source는 `03-level-policy.md` §4에 따라 아직 미확정(Open) 상태다.
- 위 두 가지 때문에 Level Persistence 계층이 실제로 의도대로 동작하는지 사람이 눈으로 확인할 방법이 현재 전혀 없다.

---

## 3. v0.1 In Scope

- 학교 이름 검색
- School ID 직접 조회
- 학교 기본 정보 표시
- 저장된 `current_level` 조회
- 저장된 `level_updated_at` 조회
- cumulative XP 수동 입력
- `calculateLevelState(cumulativeXp)` 계산 미리보기
- 저장 Level과 계산 Level 비교
- `syncSchoolLevel(schoolId, cumulativeXp)` 수동 실행
- 실행 전 확인
- 실행 후 before/after 결과 표시

---

## 4. v0.1 Out of Scope

- XP Source 구현
- cumulative XP 자동 산출
- 대량 일괄 실행
- Register Flow 수정
- School Hub 수정
- Home Feed 수정
- `clicked_school_id` 수정
- DB Migration/RPC/Trigger 신규 작업
- 사용자 데이터 수정
- 감사 로그 시스템 구현
- 새 관리자 인증 체계

---

## 5. 기존 코드 재사용 목록

| 용도 | 재사용 대상 | 위치 |
|---|---|---|
| 학교 이름 검색 | `searchSchools(query, limit)` | `lib/api/schools.ts` |
| School ID 단건 조회 | `getSchoolById(id)` | `lib/api/schools.ts` |
| Level 계산 미리보기 | `calculateLevelState(cumulativeXp)` | `lib/policy/levelPolicy.ts` |
| Level 저장 판단(순수) | `resolveLevelUpdate(storedLevel, newState)` | `lib/policy/levelPersistence.ts` (간접 재사용, `syncSchoolLevel` 내부에서 사용) |
| Level 저장 I/O 실행 | `syncSchoolLevel(schoolId, cumulativeXp)` | `lib/api/levels.ts` |
| 관리자 세션 검증 | `verifySessionToken`, `ADMIN_COOKIE_NAME` | `lib/admin-auth.ts` |
| Route Handler 인증 재검증 패턴 | `requireAdmin(request)` 형태 (`app/api/admin/profiles/[id]/route.ts` 참고) | 신규 파일에서 동일 패턴 복제 |
| admin 경로 보호 | `/admin/:path*` matcher | `middleware.ts` (수정 없이 그대로 적용됨) |
| UI 레이아웃/스타일 관례 | `app/admin/_components/*` (StatCard 등) | 참고용 |

`current_level`/`level_updated_at`을 외부에서 읽는 함수는 현재 존재하지 않으므로 신규 작성이 필요하다 (§10 참고).

---

## 6. 화면 구조

```
/admin/tools/level-sync
├─ 검색 영역
│   ├─ 학교 이름 검색 입력 (searchSchools 재사용)
│   └─ School ID 직접 입력
├─ 검색 결과 리스트 → 선택
└─ 선택된 학교 패널
    ├─ 기본 정보 (school_name, school_type, sido/sigungu, slug)
    ├─ 저장된 current_level / level_updated_at (읽기 전용)
    ├─ cumulative XP 수동 입력 필드
    │   └─ 경고 문구: 개발 검증용 수동 입력 / XP Source 미연결 / 입력값이 계산·동기화에 직접 사용됨
    ├─ calculateLevelState(cumulativeXp) 기준 계산 Level 미리보기 (입력 즉시, 쓰기 없음)
    ├─ 저장 Level vs 계산 Level 비교 (예상 Level 변화 표시)
    └─ 실행 확인 영역
        ├─ 실행 전 확인 화면: 선택 학교 / 입력 cumulative XP / 저장 current_level / 계산 Level / 예상 Level 변화
        ├─ "동기화 실행" 버튼 (명시적 확인 후 1회 실행)
        └─ 실행 후 결과: before/after current_level, level_updated_at, 실패 시 에러 메시지
```

---

## 7. 데이터 흐름

1. 관리자가 기존 로그인 세션으로 `/admin/tools/level-sync` 접근 (middleware가 자동 보호).
2. 학교 검색: 클라이언트 → `searchSchools`(anon client, `schools_select_all` RLS 정책으로 읽기 허용) → 결과 표시.
3. 학교 선택: `getSchoolById`로 기본 정보 조회 + Level 스냅샷 조회(신규 함수, anon client로 `current_level`/`level_updated_at` 읽기 — RLS상 허용됨).
4. 운영자가 cumulative XP를 수동 입력.
5. 클라이언트에서 즉시 `calculateLevelState(cumulativeXp)` 호출 → 계산 Level 미리보기 표시 (DB 접근 없는 순수 계산).
6. 저장 Level과 계산 Level을 비교해 예상 변화(상승/변경없음/초기화) 표시.
7. 운영자가 실행 전 확인 화면(선택 학교/입력 XP/저장 Level/계산 Level/예상 변화)을 확인 후 "동기화 실행" 클릭.
8. 클라이언트 → `POST /api/admin/tools/level-sync { schoolId, cumulativeXp }`.
9. Route Handler: `requireAdmin(request)` 재검증 → zod 검증 → `syncSchoolLevel(schoolId, cumulativeXp)` 실행(service role 클라이언트, RLS 우회, 실제 조건부 UPDATE 수행) → 결과(`SchoolLevelPersistenceRow | null`) JSON 반환.
10. 클라이언트가 실행 전(before) 값과 응답(after) 값을 비교해 표시.

---

## 8. 인증/보안 구조

- 새 인증 체계를 만들지 않는다. 기존 `middleware.ts`의 `/admin/:path*` matcher가 `/admin/tools/level-sync`를 별도 설정 없이 그대로 보호한다.
- `POST /api/admin/tools/level-sync`는 `app/api/admin/profiles/[id]/route.ts`의 `requireAdmin(request)` 패턴을 그대로 복제해, 미들웨어 통과 여부와 무관하게 Route Handler 자체에서 세션 쿠키를 다시 검증한다.
- `syncSchoolLevel`은 `getSupabaseAdmin()`(service role, RLS 우회)을 사용하므로 반드시 이 Route Handler를 경유해야 하며, 클라이언트 컴포넌트에서 admin client를 직접 호출하지 않는다.
- 읽기 전용 조회(학교 검색, 기본 정보, 저장된 Level 값)는 `schools_select_all` RLS 정책에 의해 anon client로도 가능하므로 별도 인증 없이 클라이언트에서 직접 조회 가능하다. 단, 이 화면 자체는 `/admin` 하위이므로 미들웨어 보호를 받는다.
- 감사 로그는 v0.1 범위에 포함하지 않는다 (§4, §12).

---

## 9. cumulative XP 수동 입력 정책

- v0.1은 XP Source를 구현하거나 추정하지 않는다.
- cumulative XP는 운영자가 화면에서 직접 입력하는 개발 검증용 값이다.
- 입력 필드 주변에 다음 의미가 명확히 드러나는 경고 문구를 표시한다:
  - 이 값은 개발 검증용 수동 입력이다.
  - 현재 XP Source는 연결되어 있지 않다.
  - 입력한 값이 Level 계산과 실제 동기화(DB 저장)에 그대로 사용된다.
- 참고용으로 학교의 등록 인원 수(프로필 수) 등을 화면에 함께 표시할 수는 있으나, 이 값을 cumulative XP로 자동 대입하거나 코드에서 계산해 넣지 않는다 — 운영자가 참고만 하고 직접 입력해야 한다.
- 실행은 실행 전 확인 화면을 반드시 거친 뒤 명시적 확인 후 1회만 수행한다 (재시도/반복 실행 UI를 자동화하지 않는다).

---

## 10. 예상 신규/수정 파일

**신규**
- `app/admin/tools/level-sync/page.tsx`
- `app/admin/tools/level-sync/_components/*.tsx` (검색 폼, 상세 패널, 확인 화면, 실행 버튼 등 세부 구성은 구현 단계에서 결정)
- `app/api/admin/tools/level-sync/route.ts` (`requireAdmin` + zod + `syncSchoolLevel` 호출)
- `lib/api/levels.ts`에 읽기 전용 Level 스냅샷 조회 함수 추가 여부 검토 (현재 `current_level`/`level_updated_at`을 외부에서 읽는 export가 없음)

**수정 없음 (예상)**
- `middleware.ts`
- `lib/admin-auth.ts`
- `types/school.ts`
- `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`
- `syncSchoolLevel`의 기존 로직 (`lib/api/levels.ts`)

---

## 11. 구현 순서

1. Level 스냅샷 읽기 전용 조회 함수 설계 확정 (신규 함수 필요 여부와 위치)
2. `POST /api/admin/tools/level-sync` Route Handler 설계 확정 (`requireAdmin` 재사용, zod 스키마)
3. UI 뼈대 구현 (검색 → 선택 → 상세 표시, 실행 버튼은 비활성 상태로 시작)
4. `calculateLevelState` 클라이언트 미리보기 연결
5. 실행 전 확인 화면 구현 (선택 학교/입력 XP/저장 Level/계산 Level/예상 변화)
6. 실행 버튼 + Route Handler 연결 + 실행 후 before/after 결과 표시
7. 수동 QA (실제 로그인 후 학교 1건으로 null 초기화 시나리오, 상승 시나리오 각각 확인)
8. `docs/IMPLEMENTATION_LOG.md` 기록

---

## 12. 알려진 리스크

- 단일 공유 관리자 비밀번호로 콘텐츠 운영 권한과 Level 강제 동기화 권한이 분리 없이 묶여 있다 (v0.1에서는 그대로 수용, 별도 논의 필요 사항으로 남김).
- cumulative XP가 수동 입력값이라는 점 자체가 구조적 위험이다 — XP Source가 미확정 상태이므로 근거 없는 값을 입력하면 실제 활동과 무관하게 Level이 올라갈 수 있다. v0.1의 유일한 방어는 실행 전 확인 화면(휴먼 게이트)뿐이다.
- 로그인 브루트포스 방어는 기존 500ms 지연 하나뿐이며 별도 rate limit이 없다 (기존 admin 인증 구조를 그대로 상속하는 데서 오는 리스크).
- 감사 로그가 없어 "누가 언제 어떤 학교를 어떤 cumulative XP로 동기화했는지"를 사후에 추적할 수 없다.
- `searchSchools`가 `lib/api/schools.ts`와 `lib/api/search.ts`에 동명이인으로 존재한다 — 구현 단계에서 어느 쪽을 쓸지 명시적으로 결정해야 하며, 잘못 import하면 검색 결과 특성(ilike vs RPC prefix 매칭)이 달라질 수 있다.
