# SchoolLoveI User Journey v1.0

Status: **FROZEN**

## 0. 한 문장 여정

> **찾는다 → 발견한다 → 등록한다 → 성장시킨다 → 다시 찾는다**

SchoolLoveI의 화면은 이 순환을 지원한다.

---

## 1. Discovery Loop

```text
Google / Naver / 내부 Search / Home Feed
  ↓
School Hub
  ↓
Year Hub
  ↓
Class Hub
  ↓
Profile Card
  ↓
Instagram
```

### Entry

사용자는 학교 이름이나 Home Feed의 성장 순간을 통해 들어온다.

### School Hub

학교의 현재 성장 상태를 느낀다.

### Year Hub

기수 전체 사람을 발견한다.

반을 몰라도 이름 검색으로 찾을 수 있다.

### Class Hub

사람 목록을 가장 좁게 본다.

### Profile Card

한 사람을 확인한다.

### Instagram

실제 연결의 문이다.

SchoolLoveI 안에 독립 Profile 목적지를 만들지 않는다.

---

## 2. Growth Loop

```text
Home / Search / School / Year / Class
  ↓
Register CTA
  ↓
Register Flow
  ↓
등록 성공
  ↓
학교 성장 갱신
  ↓
Level 재계산
  ↓
Feed 성장 순간
  ↓
다른 사용자의 발견
```

등록은 Discovery Loop 밖의 별도 관리 기능이 아니라, 다시 발견을 만드는 Growth Loop다.

---

## 3. Entry Point별 Register Context

| 진입 | 이미 아는 정보 |
|---|---|
| Home | 없음 |
| Search | 없음 |
| School Hub | school |
| Year Hub | school + year |
| Class Hub | school + year + class |

Register Flow는 이 정보를 prefill한다.

---

## 4. 사용자 목적별 경로

### "학교 이름만 기억난다"

```text
Search → School Hub → Year Hub → 사람 발견
```

### "졸업연도는 기억난다"

```text
School Hub → Year Hub → 이름 검색 / 반 찾기
```

### "몇 반인지 안다"

```text
School Hub → Year Hub → Class Hub → Profile Card
```

### "이름은 기억나는데 반은 모른다"

```text
Year Hub → 이름 검색 → Profile Card
```

### "아직 아무도 없다"

```text
State A / 빈 기수 / 빈 반
  ↓
첫 기록
  ↓
Register Flow
  ↓
Growth feedback
```

---

## 5. 감정 흐름

```text
궁금함
  ↓
발견
  ↓
반가움 / 기억
  ↓
기여 욕구
  ↓
성장 체감
  ↓
재방문
```

기능 설명보다 이 감정 흐름이 우선한다.

---

## 6. 화면별 책임

| 화면 | 책임 |
|---|---|
| Home Feed | 성장 중이라는 감각 |
| Search | 학교 발견 진입 |
| School Hub | 학교 성장 체감 |
| Year Hub | 동기 발견 Hook |
| Class Hub | 가장 좁은 사람 목록 |
| Profile Card | Instagram으로 나가는 문 |
| Register Flow | 성장 기여 |
| Success | 기여 결과 피드백 |
| Admin | 발견 신뢰 유지 |

---

## 7. 실패 방지

- Search에서 여정을 끝내지 않는다.
- School Hub에서 학교 정보만 보여주지 않는다.
- Year Hub에서 반 목록을 사람보다 먼저 두지 않는다.
- Class Hub를 반 소개 페이지로 만들지 않는다.
- Profile 독립 페이지를 만들지 않는다.
- Register를 긴 입력 업무처럼 만들지 않는다.
- Success를 단순 완료 메시지로 끝내지 않는다.
