# SchoolLoveI Refactoring PRD — Home Feed v1.0

Status: **FROZEN**

## 0. 정의

Home은 검색 페이지가 아니다.

**Home Feed는 학교들이 지금 성장하고 있다는 것을 연속적으로 보여주는 성장 순간 피드다.**

기존의 `로고 + 검색 + 인기 학교 + 최근 등록` 조합을 제품 중심 경험으로 사용하지 않는다.

사용자가 Feed를 보며 스스로 다음 생각을 하게 만드는 것이 목적이다.

> "우리 학교는 지금 몇 레벨이지?"

---

## 1. Feed Item = Growth Moment

각 Feed Item은 과거·현재·미래를 한 번에 보여준다.

```text
무슨 일이 있었는가
  ↓
어느 학교에서 일어났는가
  ↓
지금 학교는 어디까지 왔는가
  ↓
다음 변화까지 얼마나 남았는가
```

예시:

```text
학교 등록
익명의 재학생이 세명고등학교에 등록했어요.
세명고 Lv.14 · 다음 레벨까지 2명
```

Feed는 "완료된 SNS 게시물"이 아니라 **진행 중인 성장**을 보여준다.

---

## 2. P1 Event Type

API 계약의 Feed Item type은 다음 세 종류다.

```ts
type FeedItemType = "register" | "levelup" | "trace"
```

### REGISTER

학교에 새로운 사람이 등록된 순간.

표현 원칙:

- 사람 이름 노출 금지
- 인스타그램 ID 노출 금지
- 익명 활동 문장 사용
- 현재 Level과 다음 Level까지 남은 수치 연결

### LEVEL UP

등록 등 성장 이벤트 결과 학교 레벨이 상승한 순간.

표현 원칙:

- 성장의 변화가 주인공
- "Lv.N 달성"만 보여주지 않고 다음 성장 방향도 연결

### TRACE

학교에 흔적이 추가된 순간.

표현 원칙:

- Home에서는 활동자 실명 비노출
- 학교가 살아 있다는 신호로 사용

---

## 3. 데이터 흐름

Register Flow 완료 시 다음 이벤트 체인을 따른다.

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

성공 등록은 Home Feed의 REGISTER 이벤트를 만든다.

레벨이 실제 상승한 경우 LEVEL UP 이벤트를 만든다.

TRACE 이벤트는 기존 `traces`의 공개 가능한 흔적에서 구성한다.

---

## 4. Feed의 개인정보 경계

Home Feed는 활동 로그다.

따라서 개인을 발견하는 명단 화면과 다르게 익명으로 표현한다.

| 노출 | Home Feed |
|---|---|
| 개인 이름 | 금지 |
| Instagram ID | 금지 |
| 학교 이름 | 허용 |
| 기수/반 컨텍스트 | 개인 식별 위험이 없는 범위에서 허용 |
| Level / 남은 성장 | 허용 |

사람 발견은 Year/Class/Profile Card에서 한다.

---

## 5. CTA 원칙

Feed Item을 누르면 해당 학교의 School Hub로 이동한다.

Feed에서 등록을 강요하지 않는다.

발견·성장 맥락을 먼저 보여주고, 실제 등록 CTA는 School Hub 또는 해당 발견 흐름에서 제공한다.

등록 CTA가 필요한 경우에도 **발견보다 앞서지 않는다.**

---

## 6. Home Navigation

P1 Home의 핵심 탐색은 다음 두 축만 유지한다.

- Home
- Search

Home에 SNS식 탭을 추가하지 않는다.

---

## 7. Feed 정렬 및 표시 원칙

- 최근 성장 순간을 우선한다.
- 같은 학교의 이벤트가 연속되어도 이벤트 의미가 다르면 별도 성장 순간으로 표현할 수 있다.
- Feed는 학교 단위의 성장 맥락을 잃지 않아야 한다.
- Feed Item마다 `school`과 `context`를 전달한다.

정교한 dedup/collapse 정책은 P2 성능·캐싱 항목과 함께 검토한다.

---

## 8. Empty / Cold Start

전체 Feed 데이터가 부족한 초기 상태에서는 검색 화면으로 되돌리는 것이 아니라, 존재하는 학교 성장 순간을 최대한 보여준다.

빈 Feed를 가짜 활동으로 채우지 않는다.

검색은 Home과 별도 진입점으로 유지한다.

---

## 9. 하지 않는 것

- 좋아요
- 댓글
- 반응
- 팔로우
- DM
- 개인 이름/인스타 노출
- 광고 Feed
- 인기 게시물 랭킹
- 검색 결과를 Home Feed로 혼합

---

## 10. 구현 체크

- `FeedItem.type`은 `register | levelup | trace`
- 각 Item에 school context 존재
- Home의 개인 정보 익명화
- register/levelup 이벤트가 Register Flow와 연결
- School Hub로 이동 가능
- Home/Search 핵심 탐색 유지
