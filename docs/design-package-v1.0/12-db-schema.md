# SchoolLoveI DB Schema Policy v1.0

Status: **FROZEN**

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
