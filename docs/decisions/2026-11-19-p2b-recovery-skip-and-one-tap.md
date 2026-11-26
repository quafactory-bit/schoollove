# P2b — 복구 이메일 "나중에 등록"과 Google One Tap (결정 초안)

상태: **승인됨(2026-11-19, 운영자 "응응 승인할게" — 9절 권장안 전부).** 구현은 `p2-P2b:` 커밋. push·Preview/운영 DB 적용·배포·Google 콘솔·환경변수는 계속 건별 승인.
근거: `AGENTS.md` A1(복구 이메일 단계는 기본 흐름에서만 제외)·A2 안전 조건 "복구 이메일"·D절, 지시서 `2026-11-11-part2-for-gpt.md` 4절 P2·6절 C, `reports/2026-11-19-part2-second-round.md` "P2 범위".
선행 결정: `2026-08-10-social-account-recovery-data-boundary.md`, `2026-08-19-first-social-login-recovery-finalization.md`, `2026-08-22-social-account-activation-bound-reauth.md`, `2026-08-24-google-only-auth-policy.md`.

## 0. 한 줄 요약

- 새 Google 계정은 복구 이메일 없이 바로 가입을 마친다. 복구 이메일(8자리 OTP)은 지우지 않고 `/account`에서 "나중에 등록"한다.
- 기존 DB 함수는 **하나도 고치지 않는다.** 복구 없이도 통과하는 **새 함수 4개를 추가**하고 앱 코드가 새 함수를 부르게 바꾼다. 되돌릴 때는 앱 코드만 되돌리면 옛 함수가 그대로 다시 쓰인다.
- 다만 **표 제약 2곳은 새 함수만으로 우회할 수 없어 "추가만" 원칙의 예외 승인이 필요하다**(3절).
- One Tap은 **로그인 수단이 아니라 "계정 고르기 단축키"로만** 쓴다. One Tap 토큰으로 로그인시키지 않고, 고른 계정을 기존 Google 리디렉션 로그인에 힌트로만 넘긴다. 실패하면 지금 버튼이 그대로 남는다.

## 1. 지금 상태 기계 (코드에서 확인한 사실)

| 단계 | 지금 | 근거 |
|---|---|---|
| Google 콜백 → 신원 판정 | 처음 보는 Google 신원이면 `upstream_pending → upstream_verified → recovery_required`, 결과 `RECOVERY_REQUIRED` → `/auth/social/recovery` | `20260821072212`의 `record_verified_social_identity_from_upstream_leg`(현재는 `private.record_verified_identity_before_bound_reauth`로 이름이 바뀐 내부 함수) |
| 복구 OTP 소비 | OTP 맞으면 이때 비로소 `private_accounts`(provisional, 복구 열 채움) + `social_identity_registry` 생성, `account_decided` | `20260811110000` `consume_recovery_and_decide_social_account` |
| 코드 발급 | `account_decided`/`auth_principal_bound`/`existing_primary`면 발급. **복구 열은 보지 않음** | `20260822022953` 발급 2함수 |
| 토큰 교환 | 복구 열을 보지 않음 | `20260908050649` `consume_broker_authorization_code` |
| 완료(세션 연결) | `bind_social_auth_principal_from_attempt` — **복구 열 필수** | `20260819120000` |
| 활성화 | `activate_social_account_from_attempt` → `activate_social_account` — **복구 열 필수** | `20260822022953` |
| 표 제약 | `private_accounts`의 CHECK: `status='active'`면 복구 열 6개 전부 NOT NULL | `20260810160000` 49~58행 |
| 재로그인(활성 전) | 묶인 provisional 계정 재로그인 `BOUND_PROVISIONAL_REAUTH_READY` — **복구 열 필수** | `20260822022953` 공개 래퍼 |
| 중단된 첫 가입 이어가기 | `PROVISIONAL_RESUME_READY` — **복구 열 필수**, 이전 시도가 `broker_code_ready`+만료일 때만 | `20260821072212` |
| 재로그인(활성 후) | `EXISTING_PRIMARY` — 복구 열 안 봄 | 같은 함수 |
| 탈퇴 | `revoke_social_identity_for_deletion`·정리 작업 — 복구 열이 NULL이어도 동작 | `20260810160000`, `20260915211712` |
| 복구 발송 기록 | `recovery_delivery_attempts.login_attempt_id NOT NULL` — 로그인 시도 없이 발송할 수 없음 | `20260811110000` 22~35행 |

## 2. 바뀌는 상태 전이

### 2-1. 신규 Google 신원 (기본 흐름)

```
지금:   upstream_pending ─▶ upstream_verified ─▶ recovery_required ─▶ recovery_pending ─▶ (OTP) account_decided ─▶ broker_code_ready ─▶ consumed ─▶ bind ─▶ active
변경:   upstream_pending ───────────────────────────────────────────────────────────────▶ account_decided ─▶ broker_code_ready ─▶ consumed ─▶ bind ─▶ active
                         (한 트랜잭션: 계정·신원 provisional 생성, 복구 열 NULL)
```

- 콜백 결과 새 값: `ACCOUNT_DECIDED_RECOVERY_DEFERRED`. 라우트는 `PROVISIONAL_RESUME_READY`와 똑같이 곧바로 코드 발급 → Supabase → `/auth/social/complete` → `/account`.
- `recovery_required` 이하 상태와 `/auth/social/recovery` 화면은 **지우지 않는다.** 기본 흐름이 더 이상 그쪽으로 보내지 않을 뿐이다.

### 2-2. 다시 로그인 / 중단 후 다시 시도

| 계정 상태 | 결과 | 비고 |
|---|---|---|
| active (복구 있음/없음) | `EXISTING_PRIMARY` | 지금과 같음 |
| provisional·묶임(auth_user_id 있음)·복구 없음 | `BOUND_PROVISIONAL_REAUTH_READY` | 지금 래퍼의 조건에서 복구 열 요구만 뺀 새 판정. 예: 가입 직후 운영이 `closed`라 활성화가 미뤄진 경우 |
| provisional·안 묶임·복구 없음 (가입 도중 창을 닫음) | `PROVISIONAL_RESUME_READY` | 새 규칙: 그 계정의 다른 시도가 모두 종료·만료이고, Supabase 신원 연결이 0개이거나 **정확히 이 Google 신원 1개**일 때만 이어받음. 그 외는 지금처럼 `IDENTITY_DECISION_IN_PROGRESS`(안전 실패) |
| provisional·복구 있음 (옛 흐름 사용자) | 옛 규칙 그대로 | 옛 함수로 위임 |
| deletion_pending / cleanup_failed_safe | 안전 실패 | 지금과 같음. 탈퇴 정리 완료 후 같은 Google로 새로 가입 가능 |

### 2-3. 나중에 복구 이메일 등록 (`/account`)

```
active·복구 없음 ─(이메일 입력)▶ 인증 대기(purpose='change', 10분, 8자리) ─(OTP 맞음)▶ active·복구 있음
                                     └ 5회 틀림 locked / 10분 만료 expired → 다시 요청
```

- 이미 쓰고 있는 기존 값 `purpose='change'`를 쓴다(표 CHECK에 이미 있음, 새 값 아님).
- 복구 이메일 변경·삭제는 이번 범위에서 빼고 "등록 1회"만 한다(변경은 추후 결정).

## 3. 기존 것 교체 목록 — "추가만" 원칙의 예외 (명시 승인 필요)

**기존 함수 교체(CREATE OR REPLACE): 0개.** 아래 2개는 표 제약이라 새 함수로 우회할 수 없다.

| # | 대상 | 지금 | 바꾸는 내용 | 왜 피할 수 없나 |
|---|---|---|---|---|
| E1 | `private.private_accounts`의 이름 없는 CHECK(`status<>'active' OR (복구 열 6개 NOT NULL …)`) | 활성 계정은 복구 이메일 필수 | 같은 이름으로 DROP 후 새 CHECK 추가: 활성이면 `auth_user_id`·`activated_at` 필수 + 복구 열은 **"전부 있거나 전부 없거나"** | 표 제약은 어떤 함수도 우회 못 함. 이게 남아 있으면 복구 없는 계정은 영원히 활성화 불가 |
| E2 | `private.recovery_delivery_attempts`의 CHECK `recovery_delivery_reserved_requires_owner` (예약 중이면 `login_attempt_id` 필수) | 발송 기록은 로그인 시도에만 붙음 | 그 CHECK를 DROP 후 `recovery_delivery_reserved_requires_single_owner`(예약 중이면 로그인 시도·계정 중 **정확히 하나**)로 다시 추가 + nullable `account_id` 열 추가 | `/account`의 나중 등록에는 로그인 시도가 없음. 발송 횟수 제한(같은 이메일·같은 계정)을 이 원장에 그대로 걸기 위해. **구현 중 확인:** `login_attempt_id`의 NOT NULL은 `20260915211712`에서 이미 풀려 있었고, 실제로 막는 것은 이 이름 있는 CHECK였다. 승인 범위(발송 원장의 소유자 조건 완화) 안의 같은 변경이다 |

- E1은 migration 안에서 **정의문으로 정확히 1개를 찾을 때만** 지우고, 0개·2개 이상이면 전체 rollback한다(이름을 추측하지 않음).
- E2 대안: 새 표 `private.account_recovery_deliveries`를 만든다. "신규 테이블 0" 원칙에 걸리고 발송 한도 계산이 두 표로 갈라져서 **E2(열 완화)를 권장**한다.
- 데이터 변경 없음: 기존 행을 고치거나 지우지 않는다. DROP TABLE/COLUMN·RENAME 없음. 기존 migration 파일 수정 없음.

### 추가하는 것 (모두 service_role 전용, 새 파일 1개)

| 새 함수 | 하는 일 | 옛 함수와 관계 |
|---|---|---|
| `public.record_verified_google_identity_recovery_optional(...)` | 2-1·2-2 판정. 같은 브로커 advisory lock과 같은 잠금 순서(거래→시도→leg→advisory→계정→신원). 복구 있는 옛 계정·애매한 경우는 **옛 함수에 위임** | 옛 공개 래퍼는 그대로 남음 |
| `public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid)` | 완료 시 Supabase 사용자 연결. 옛 함수와 같은 검사에서 "복구 열 필수"만 "전부 있거나 전부 없거나"로 | 옛 함수 그대로 |
| `public.activate_social_account_from_attempt_recovery_optional(uuid)` | 활성화. 운영 `open` 게이트·Auth 신원 1:1 검사 그대로, 복구 조건만 위와 같이 | 옛 2함수 그대로 |
| `public.create_and_reserve_account_recovery_delivery(...)` / `public.consume_account_recovery_verification(...)` / `public.fail_..`·`mark_..sent` 계정판 | `/account` 나중 등록: 발송 예약(한도 공유) → OTP 소비 → 복구 열 기록 | 로그인 시도용 옛 함수 그대로 |

(실제 이름·개수는 구현 때 확정하되 "옛 함수 교체 0" 원칙은 바꾸지 않는다. 앱 코드 쪽은 `preview-persistence.ts`·`preview-route-adapter.ts`·`preview-recovery-http.ts`·`dark-orchestrator.ts`의 RPC 이름·결과 처리, `/account` 화면 1구역, `/login` 안내 문구.)

## 4. 중복 계정 판정 기준

1. **같은 사람 = 같은 Google `sub`.** 브로커 subject(`slb:v1:k01:google:<HMAC>`)가 계정 1개에 대응한다. `social_identity_registry` 기본키, `private_accounts.primary_broker_subject` UNIQUE, Supabase `auth.identities`(provider+id) 유일성, 그리고 판정 전체를 같은 subject advisory lock 안에서 한다 → 같은 Google 계정으로 동시에 두 번 눌러도 계정은 1개.
2. 동시 첫 가입 2건: 먼저 들어간 쪽이 계정을 만들고, 뒤쪽은 잠금이 풀린 뒤 "provisional·진행 중 시도 있음"을 보고 안전 실패(`IDENTITY_DECISION_IN_PROGRESS`) → 사용자가 다시 누르면 `EXISTING_PRIMARY` 또는 이어받기.
3. **한 사람이 Google 계정 2개를 쓰면 출석부 계정도 2개**가 된다. 지금도 다른 복구 이메일을 넣으면 똑같이 2개가 되므로 실질 보호가 줄지는 않는다. 다만 이제는 "같은 이메일로 2번째 계정 차단"이 가입 시점에 없다 → **잔여 위험으로 수용 여부 승인 필요.** 나중 등록 때는 같은 복구 이메일을 다른 계정에 다시 쓸 수 없다(기존 UNIQUE 인덱스 그대로).
4. 나중 등록에서 이메일이 이미 다른 계정 것일 때: **OTP로 소유를 증명한 뒤에만** "이 이메일은 쓸 수 없어요"를 보여 준다(발송 단계에서는 구분하지 않음 → 남의 이메일 등록 여부 엿보기 방지).
5. 브로커 subject 키는 지금 `K01` 하나다. **키 회전 시 같은 사람이 새 계정이 되므로**, 복구 없는 계정이 있는 동안 subject 키 회전은 금지(회전하려면 별도 이전 설계).

## 5. Google One Tap

### 결정안 A (권장): "계정 고르기 단축키"

```
/login (또는 ?ref=ig 등) 화면
  └ Google 스크립트(accounts.google.com/gsi/client)로 One Tap 표시
       ├ 사용자가 계정 선택 → ID 토큰 → POST /auth/social/one-tap/google
       │     서버: Google 공개키로 서명·aud(공개 클라이언트 ID)·iss·exp 검증 → sub만 꺼냄(이메일·이름 버림, 저장 안 함)
       │     → 2분짜리 봉인 쿠키(login_hint=sub) → 303 /auth/social/start/google (지금 버튼과 같은 길)
       │     브로커가 Google로 보낼 때 그 쿠키가 있으면 login_hint=sub를 붙이고 prompt=select_account를 뺀다
       │     → Google 계정 선택 화면 없이 바로 돌아옴 → 이후는 지금과 100% 같음(nonce·PKCE·ID 토큰 재검증)
       └ 표시 안 됨/닫음/오류(인앱 브라우저, 서드파티 쿠키 차단, FedCM 미지원) → 아무것도 안 함. 지금 "Google로 계속하기" 버튼이 그대로 있고, 인앱이면 외부 브라우저 안내
```

- **로그인 권한은 여전히 기존 리디렉션 흐름의 Google ID 토큰만** 결정한다. One Tap 토큰은 힌트로만 쓰고, 위조돼도 결과는 "Google 화면에서 다른 계정이 미리 선택됨"뿐이다. 새 로그인 수단·새 신뢰 경로가 아니다(D절 유지).
- 브로커 변경: `buildProviderAuthorizationRequest`에 선택적 `loginHint` 1개(검증된 sub 형식만 허용). 이것도 인증 브로커 내부 변경이라 **명시 승인 대상**.

### 결정안 B (비권장): One Tap ID 토큰을 브로커에 직접 넣기
- Google 화면 왕복 1번을 더 줄이지만 Supabase 세션은 어차피 Supabase→브로커 리디렉션을 거쳐야 해서 체감 차이가 작다. 대신 상태 기계에 "리디렉션 없는 upstream leg"라는 새 신뢰 경로가 생겨 위험이 크다.

### One Tap에 필요한 운영자 작업 (건별 승인)
1. Google Cloud 콘솔: 기존 OAuth 클라이언트(또는 새 웹 클라이언트)의 **승인된 JavaScript 원본**에 Preview 주소와 `https://www.schoollove.kr` 추가.
2. Vercel 환경변수 `NEXT_PUBLIC_GOOGLE_ONE_TAP_CLIENT_ID`(공개값, Preview 먼저). 값이 없으면 One Tap 코드는 아예 렌더링하지 않는다(지금 화면 그대로).
3. 개인정보처리방침: "One Tap 사용 시 Google이 보내는 이메일·이름은 저장하지 않고 계정 식별값만 1회 사용" 문단 — 운영 배포 전 운영자 검토.

### 인앱 브라우저
- 인스타·쓰레드 인앱에서는 One Tap이 대부분 표시되지 않는다(Google 정책상 임베디드 WebView 차단). 이때는 조용히 사라지고 기존 버튼만 보인다.
- **주의:** "외부 브라우저 열기 안내"는 P0-2(운영자 실기기 재현 대기)라 **아직 코드에 없다.** 이번에 최소 안내(인앱으로 판별되면 "오른쪽 위 ⋯ → 외부 브라우저로 열기" 한 줄 + 주소 복사 버튼)를 함께 넣을지, P0-2를 기다릴지 결정 필요.

## 6. 화면·문구 변경
- `/login` 안내 "새 계정은 처음 한 번 복구 이메일 확인을 거쳐요" → "복구 이메일은 나중에 계정 설정에서 등록할 수 있어요".
- `/account`: 복구 미등록이면 "복구 이메일 등록(선택)" 카드 1개(이메일 입력 → 8자리 → 완료). 등록돼 있으면 "등록됨"만(주소 원문 표시 안 함).
- 개인정보처리방침 인증 항목: "가입 시 필수"→"선택, 등록 시에만 처리". 운영 배포 전 운영자 검토.

## 7. 롤백

| 상황 | 방법 | 데이터 |
|---|---|---|
| 앱 문제 | Vercel Instant Rollback 또는 앱 커밋 revert → 옛 함수 호출로 복귀(새 함수는 남아 있어도 호출 안 됨) | 변경 없음 |
| 롤백 후 복구 없는 **활성** 계정 | `EXISTING_PRIMARY`는 복구 열을 안 봐서 **계속 로그인 가능** | 그대로 |
| 롤백 후 복구 없는 **provisional** 계정 | 옛 함수가 안전 실패 → 그 사람은 다시 배포될 때까지 가입 못 끝냄. 운영 open이면 보통 가입 직후 활성이라 해당자는 소수 | 그대로(수동 정리 금지, 보고만) |
| DB 함수 되돌리기 | 새 함수 4~6개 `REVOKE EXECUTE ... FROM service_role`(DROP 아님) | 없음 |
| E1 제약 되돌리기 | **기본은 새 CHECK를 그대로 둔다**(앱 롤백만으로 새 복구 없는 계정 생성이 멈춤). 옛 CHECK를 `NOT VALID`로 다시 거는 것은 비권장: 복구 없는 활성 행을 "활성 상태로 수정"하는 모든 UPDATE(예: 탈퇴 요청 시 `deletion_safety_hold` 기록)가 막혀 탈퇴가 깨질 수 있다. 완전 원복은 해당 계정이 모두 나중 등록 또는 탈퇴를 마친 뒤에만 | 없음 |
| E2 되돌리기 | 계정판 발송 함수 REVOKE. 열·완화는 그대로 둠(NOT NULL 재설정은 계정판 행이 남아 있으면 불가 → 하지 않음) | 없음 |

롤백 SQL은 구현 때 `scripts/part2-p2b/rollback.sql`로 함께 만든다.

## 8. 검증 계획

1. **격리 DB 시험**(`scripts/part2-p2b/run-isolated-db.sh`, 기존 P1·P3 방식, Supabase식 권한 흉내):
   - 신규: 복구 없이 계정·신원 생성 → 코드 → 교환 → bind → 활성(open). `closed`면 provisional 유지 후 open 뒤 재로그인으로 활성.
   - 재로그인: 활성 → `EXISTING_PRIMARY`; 묶인 provisional → `BOUND_PROVISIONAL_REAUTH_READY`; 안 묶인 중단 계정 → 이어받기; 진행 중 시도 있으면 안전 실패.
   - 중복: 같은 subject 동시 2건(두 세션 + advisory lock) → 계정 1개; 다른 subject 2개 → 계정 2개; 나중 등록 같은 이메일 두 계정 → 두 번째는 OTP 후 거부; 발송 한도.
   - 옛 흐름 회귀: 복구 있는 provisional 계정·`RECOVERY_REQUIRED` 경로·옛 함수 결과 불변.
   - 탈퇴: 복구 없는 활성 계정 탈퇴 요청 → revoke → 정리 → 삭제; 정리 후 같은 Google로 새 가입.
   - 제약: E1 새 CHECK가 "복구 일부만 채운 활성 행"을 거부, E2 CHECK "둘 중 하나".
   - 권한: 새 함수 anon·authenticated 실행 불가.
2. 대상 테스트 → `npm run typecheck` → `npm test` → `npm run build` → diff 검토(L절).
3. **Preview(운영자와 함께):** 새 Google 계정으로 실제 가입(복구 화면 안 나옴) → 로그아웃·재로그인 → `/account`에서 복구 이메일 나중 등록(실제 8자리 메일) → 탈퇴. One Tap: PC Chrome·Android Chrome 표시/선택, 인스타·쓰레드 인앱에서 미표시 시 기존 버튼 동작.
4. 보고서 `sns-ops/workorders/reports/2026-11-xx-part2-P2b.md`(P절 형식).

## 9. 운영자에게 승인받을 항목

| # | 항목 | 권장 |
|---|---|---|
| 1 | 이 상태 전이(2절)와 "옛 함수 교체 0, 새 함수 추가" 방식 | 승인 |
| 2 | 예외 E1: `private_accounts` 활성 CHECK 교체 | 승인 |
| 3 | 예외 E2: 발송 원장 `login_attempt_id` NOT NULL 해제 + `account_id` 열 (대안: 새 표) | E2 |
| 4 | 잔여 위험: 가입 시 같은 이메일 2계정 차단이 없어짐(4절 3), subject 키 회전 금지(4절 5) | 수용 |
| 5 | One Tap 결정안 A(힌트 전용) + 브로커 `login_hint` 1개 추가 | A |
| 6 | 인앱 최소 외부 브라우저 안내를 이번에 함께 넣을지 / P0-2 대기 | 함께 넣기 |
| 7 | 복구 이메일 "변경·삭제"는 이번 범위 제외 | 제외 |
| (구현 후 건별) | push, Preview DB 적용, Google 콘솔 JS 원본, `NEXT_PUBLIC_GOOGLE_ONE_TAP_CLIENT_ID`, 방침 문구, 운영 적용·배포 | — |
