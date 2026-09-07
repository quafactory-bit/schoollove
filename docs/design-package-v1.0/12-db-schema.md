# SchoolLoveI DB Schema Policy v1.0

Status: **FROZEN**

> **CLASS HISTORY SELF-SERVICE HARDENING (2026-09-07):** 기존 학교 membership의 owner-private 학년·반 child rows는 `replace_own_school_class_history(uuid,jsonb)`로 전체 교체한다. public school-membership, exact claimed onboarding, exact active People Discovery target-school 중 하나의 authority를 요구하며 프로필·새 학교 등록 권한은 넓히지 않는다. 성인·비공개 active profile·탈퇴·suspension·emergency·owner 경계를 유지한다. 학교·졸업연도·profile·owner·legacy class_number는 변경하지 않는다. 빈 배열은 child만 지우고 no-op은 rows/timestamps/tokens를 보존한다. 실제 변경은 owner 관련 미사용 live token만 제거한다. Same Class RPC는 동일 user-lock namespace의 정렬된 pair lock과 잠금 후 전체 재검사를 사용해 stale token race를 차단한다. Legacy exact-person, 기존 관계, K12 authority와 RLS/direct-write denial은 보존한다. 원격 적용은 별도 승인 대상이다.

> **PHASE 10B APPROVED SUPERSESSION (2026-07-28):** 신규 개인 데이터는 Supabase Auth user와 연결된 owner-only `private_profiles`·학교 이력, KST 만 19세 자기진술 결과, append-only 동의 기록으로 분리한다. 기존 `profiles`는 자동 claim 없이 quarantined/unclaimed 및 기본 private 상태를 유지한다. 세부 결정은 `docs/decisions/2026-07-28-auth-adult-ownership-boundary.md`가 우선한다.

> **PHASE 10C APPROVED SUPERSESSION (2026-07-28):** 연결 요청, 수락된 연결, 텍스트 대화, 차단·신고, 일반 알림과 상대별 Instagram 공개 승인은 별도 private 테이블과 service-role 전용 원자 RPC로 관리한다. 모든 PHASE 10C 개인 테이블은 RLS와 FORCE RLS를 사용하며 Production 적용 전 별도 검토가 필요하다.

> **CONNECTED INSTAGRAM OWNER-WRITE SUPERSESSION (2026-09-03):** 기존 `private_profiles` 행의 `instagram_handle`만 변경하는 owner-safe RPC를 둔다. owner는 `auth.uid()`에서 파생하며 non-null 저장은 active `instagram_permission`을 요구한다. null 삭제는 권한 중단 뒤에도 허용하지만 새 profile 생성과 display name·소개·사진·visibility·status·학교/학년/반 변경은 허용하지 않는다. authenticated의 직접 table write는 계속 폐쇄한다.

## 0. 원칙

DB는 제품 정책을 소유하지 않는다.

DB는 사람 발견과 성장 상태를 지원하는 최소 구조만 제공한다.

**기존 다섯 테이블을 최대한 재사용한다.**

---

## 1. Existing Tables

### schools

```text
id
school_name
school_type
sido
sigungu
address
school_code
slug
created_at
search_blob
```

### profiles

```text
id
school_id
graduation_year
grade
class_number
department
student_year
nickname
instagram_id
report_count
is_hidden
created_at
description
is_self
message
```

### search_logs

```text
id
created_at
query
result_count
```

### traces

```text
id
school_id
graduation_year
grade
class_number
message
report_count
is_hidden
created_at
```

### reports

```text
id
profile_id
type
reason
requested_instagram_id
is_self_claimed
status
created_at
```

---

## 2. P1 DB Changes — 정확히 3개

v1.0 P1에서 추가하는 DB 필드는 다음 3개뿐이다.

```text
schools.current_level
schools.level_updated_at
search_logs.clicked_school_id
```

### schools.current_level

- nullable migration 허용
- Level Policy 계산 결과의 현재 저장 레벨
- 레벨 하락 금지
- backfill 수행

### schools.level_updated_at

- nullable
- 레벨 값 실제 변경 시 갱신
- Home Feed/SEO freshness 보조 신호

### search_logs.clicked_school_id

- nullable
- 검색 결과에서 사용자가 실제 학교를 선택했을 때 기록
- State A 검색 수요 계산 원천

---

## 3. Index

P1 추가 인덱스:

```text
schools.level_updated_at
search_logs.clicked_school_id
```

기존 학교 검색용 trigram/GIN 인덱스는 재사용한다.

---

## 4. Backfill

`schools.current_level`은 기존 학교 데이터에 대해 Level Policy로 backfill한다.

XP Source가 잠정 상태이므로 backfill 로직은 `03-level-policy.md`의 v1.0 잠정 Source를 사용한다.

API나 migration script에 별도 공식을 새로 만들지 않는다.

---

## 5. 데이터 소유권

| 판단 | Owner |
|---|---|
| Level 계산 | Level Policy |
| School State | Level Policy / School Hub Policy |
| Feed 이벤트 표현 | Home Feed |
| Search 랭킹 | Search |
| index/noindex | SEO |
| 신고 처리 | Admin |

DB는 이 정책을 계산하거나 복제하지 않는다.

---

## 6. 신규 테이블 정책

P1에서 신규 테이블을 만들지 않는다.

People Discovery는 `profiles` 필터/집계로 구현한다.

Edit/Delete/Instagram Add는 `reports`를 재사용한다.

Home Feed는 기존 이벤트 원천(`profiles`, `traces`, Level 갱신)을 조합한다.

---

## 7. Migration 원칙

- non-destructive
- 기존 데이터 유지
- nullable column 추가 후 backfill
- rollback 가능한 migration
- migration과 Policy 계산 로직 분리

---

## 8. 하지 않는 것

- P1 신규 event table 추가
- 별도 profile page용 table 추가
- popularity table 추가
- DB trigger 안에 Level 공식 중복 구현
- DB에서 SEO 상태 계산
- 3개 외 P1 컬럼 임의 추가
# PHASE 10D supersession note (2026-07-28)

프로모션 private schema의 기준은 `20260728210000_today_instagram_advertising_mvp.sql`이다. 무료 editorial과 paid sponsored를 분리하며 원시 IP·개인별 방문자 목록을 저장하지 않는다.
