# SchoolLoveI Refactoring PRD — Admin v1.0

Status: **FROZEN**

## 0. 정의

Admin은 운영 편의 도구가 아니다.

**SchoolLoveI의 발견 신뢰를 유지하는 시스템이다.**

대부분의 흐름은 자동으로 동작하고, Admin은 잘못된 정보·사칭·무단 노출 때문에 사람 발견의 신뢰가 깨지는 지점에만 개입한다.

---

## 1. P1 Admin Scope

- 등록 검증 예외 대응
- 신고 처리
- Instagram 추가/수정 요청 처리
- 삭제 요청 처리
- 무단 개인정보 노출 대응
- 자동 이벤트 흐름의 예외 확인

P1 Admin 범위를 운영 CRM이나 분석 대시보드로 확장하지 않는다.

---

## 2. 신고 처리

신고 사유:

- 잘못된 정보
- 사칭
- 부적절
- 기타

프로필 신고 3회 누적 시 자동 hidden.

Admin은 자동 hidden 이후 실제 상태를 확인하고 후속 조치할 수 있다.

---

## 3. Edit / Instagram Add

Instagram 추가와 수정은 `reports` 흐름을 사용한다.

```text
reports.type = edit
requested_instagram_id = 요청 Instagram ID
```

관리자는 요청과 대상 프로필을 확인하고 반영/거절한다.

---

## 4. Delete

삭제 요청:

```text
reports.type = delete
```

삭제는 Admin 확인 후 처리한다.

본인 삭제 요청은 우선 처리한다.

`is_self_claimed`는 요청자가 본인 또는 정당한 관계자임을 주장했는지 기록하는 보조 신호다.

---

## 5. 등록 검증

자동/서버 검증은 다음 위험을 먼저 거른다.

- 스팸
- 반복 악용
- 비공개 Instagram 등록
- 명백한 무단 제3자 개인정보 등록
- 형식 오류

Admin은 정상 등록을 일일이 승인하는 시스템이 아니다.

---

## 6. 상태 처리

`reports.status`를 기준으로 요청 상태를 관리한다.

P1에서 필요한 최소 상태 흐름은 현재 스키마/기존 구현을 재사용한다.

새 Workflow Engine을 만들지 않는다.

---

## 7. 신뢰 원칙

- 발견 속도를 지나치게 느리게 만들지 않는다.
- 정상 등록은 자동 흐름이 기본이다.
- 신고/삭제/사칭 문제에는 빠르게 개입한다.
- 공개 Instagram 명단이라는 서비스 경계를 유지한다.

---

## 8. 데이터 소스

- `profiles`
- `reports`
- `traces`

필요 시 기존 `report_count`, `is_hidden` 필드를 사용한다.

---

## 9. 보안

- Admin 인증은 기존 관리자 인증 경계를 재사용한다.
- 일반 사용자용 로그인 시스템과 혼합하지 않는다.
- Admin write는 서버측 권한 검증을 통과해야 한다.

---

## 10. 하지 않는 것

- 모든 등록 수동 승인
- P1 CRM
- P1 마케팅 자동화
- 사용자 메시지/DM 운영
- 학교별 운영자 제도
- 신규 관리자 Workflow 엔진
