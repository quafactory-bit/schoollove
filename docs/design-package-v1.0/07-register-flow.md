# SchoolLoveI Refactoring PRD — Register Flow v1.0

Status: **FROZEN**

## 0. 정의

Register Flow는 입력 폼이 아니다.

**SchoolLoveI의 Growth Engine이다.**

사용자는 등록 완료 후 다음을 느껴야 한다.

> 내가 우리 학교를 성장시켰다.

---

## 1. Entry Point Prefill

진입 위치에 따라 이미 알고 있는 값을 자동으로 채운다.

| 진입점 | Prefill |
|---|---|
| Class Hub | school + year + class |
| Year Hub | school + year |
| School Hub | school |
| Home | 없음 |
| Search | 없음 |

Prefill 값은 수정 가능하다.

대학교는 학교 구조에 따라 `department` / `student_year` 맥락을 사용한다.

---

## 2. 기본 흐름

```text
학교 선택/확인
  ↓
기수·학년·반 정보
  ↓
사람 입력
  ↓
검증
  ↓
제출
  ↓
학교 성장 갱신
  ↓
Level 재계산
  ↓
Success
```

진입점에 따라 앞 단계는 이미 채워져 있을 수 있다.

---

## 3. 사람 입력

다중 등록을 허용한다.

각 Row:

```text
이름       필수
Instagram 선택
```

- 본인/친구 구분을 UX 핵심으로 두지 않는다.
- Instagram을 몰라도 이름만 등록 가능하다.
- 친구 등록은 핵심 Growth 행동이다.

---

## 4. 입력 정규화

- 문자열 양쪽 whitespace trim
- 빈 이름 금지
- Instagram은 입력된 경우에만 형식 검증
- `@` 입력 여부는 저장 정규화 규칙에 따라 일관되게 처리
- 공개 Instagram만 허용

---

## 5. 중복 정책

중복 판정 Key:

```text
school_id
+ graduation_year
+ grade
+ class_number
+ nickname
```

대학교 구조에서는 적용 가능한 학과/학번 필드를 사용한다.

### 동명이인

동명이인은 허용한다.

중복 이름이 감지되면 즉시 차단하지 않는다.

사용자에게 경고한다.

```text
이미 등록된 이름입니다.
그래도 추가할까요?
```

사용자 확인 후 등록을 계속할 수 있다.

---

## 6. 성공 처리

등록 성공은 단순 완료 화면 표시로 끝나지 않는다.

```text
REGISTER_SUBMITTED
  ↓
REGISTER_ACCEPTED
  ↓
SCHOOL_UPDATED
  ↓
LEVEL_RECALCULATED
  ↓
FEED_EVENT_CREATED
  ↓
SEARCH_INDEX_UPDATED
```

### 필수 처리

- 프로필 등록
- 학교 상태 갱신
- LevelState 즉시 재계산
- 저장 레벨 상승 여부 반영
- Home Feed REGISTER 이벤트 생성
- 실제 레벨 상승 시 LEVEL UP 이벤트 생성

---

## 7. Success Experience

Success 화면은 사용자가 입력 성공보다 기여 결과를 느끼게 한다.

Success는 다음 컨텍스트를 표시할 수 있어야 한다.

- 몇 명을 등록했는가
- 어느 학교에 기여했는가
- 현재 Level
- 다음 Level까지 남은 수치
- Level Up 발생 여부

핵심 메시지:

```text
등록이 완료됐어요.
우리 학교가 한 단계 더 채워졌어요.
```

정확한 카피는 UI에서 조정할 수 있지만, **성장 결과가 중심**이어야 한다.

---

## 8. 보안 / 악용 방지

P1:

- Register write rate limit
- CAPTCHA 적용
- 서버측 validation
- RLS/권한 경계 준수
- 비공개 인스타 및 무단 개인정보 등록 대응

---

## 9. 구현 기준 코드 경로

실제 라우트 기준은 `app/submit/page.tsx`의 사용자 흐름이다.

별도 미사용 구현체가 존재하더라도 FROZEN Register Flow와 실제 라우트 기준을 대조한 뒤 통합한다.

미사용 컴포넌트 삭제 여부는 구현 정리 작업이며 새로운 제품 정책이 아니다.

---

## 10. 하지 않는 것

- 본인 등록만 허용
- Instagram 필수
- 동명이인 완전 차단
- 로그인 강제
- Success에서 단순 `완료`만 표시
- Level 계산을 submit page 내부에 별도 구현
- P2 이벤트 가치 모델 구현
