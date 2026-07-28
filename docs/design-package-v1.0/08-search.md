# SchoolLoveI Refactoring PRD — Search v1.0

Status: **FROZEN**

> **PHASE 10A SAFETY OVERRIDE (2026-07-28):** 공개 Search는 학교명·지역·학교 유형의 기본 정보만 조회한다. profile rows, nickname/name, 졸업연도·반, Instagram, profile count를 검색하거나 응답하지 않는다. 사람 검색은 성인 본인 인증 기반 전환이 끝날 때까지 중단한다.

## 0. 정의

Search의 목적은 검색 기능 최적화가 아니다.

**Search는 사람 발견 여정의 진입점이다.**

사용자는 학교 이름을 입력하지만, 결과적으로 School Hub를 거쳐 사람을 발견한다.

---

## 1. 검색 대상

P1 핵심 검색 대상은 학교다.

기존 school search 구조와 기존 trigram/GIN 검색 인덱스를 재사용한다.

검색 자체를 위해 새 DB 구조를 만들지 않는다.

---

## 2. 결과 랭킹

기본 우선순위:

```text
1. 검색어 relevance
2. relevance가 유사하면 등록된 사람이 있는 학교 우선
3. 빈 학교는 그 다음
```

활동/등록 수의 성장 계산 기준을 Search가 별도로 만들지 않는다.

School growth/Level 관련 판단은 Level Policy가 소유한다.

---

## 3. Search Result

결과는 학교 단위로 보여준다.

사용자가 학교를 선택하면 School Hub로 이동한다.

Search에서 사람 명단 전체를 대신 보여주지 않는다.

---

## 4. Search Logging

`search_logs`에 다음 데이터를 기록한다.

```text
query
result_count
clicked_school_id
```

### clicked_school_id 기록 시점

검색 결과가 렌더되었을 때가 아니다.

**사용자가 검색 결과에서 실제 학교를 선택했을 때**, 해당 search log row의 `clicked_school_id`를 기록한다.

이 값은 School Hub State A의 실제 학교 검색 수요 계산에 사용한다.

---

## 5. 개인정보 / URL

검색 쿼리를 URL 파라미터로 노출하지 않는다.

```text
금지 예: /search?q=홍길동
```

Search 결과 페이지는 SEO 랜딩이 아니다.

검색 결과는 `noindex`다.

---

## 6. Search와 Year 이름 검색의 경계

### Global Search

- 학교 발견
- School Hub 진입

### Year Hub 이름 검색

- 해당 기수 내부 `nickname` 실시간 필터
- 사람 발견
- URL에 쿼리 비노출

두 검색을 하나의 기능으로 합치지 않는다.

---

## 7. 인기 검색 학교

`인기 검색 학교` 별도 랭킹 기능은 P2다.

P1은 검색 수요를 State A 컨텍스트에 사용하는 것까지다.

---

## 8. 하지 않는 것

- 검색 결과 index
- 검색 쿼리 URL 노출
- 글로벌 사람 실명 검색을 P1 핵심으로 확장
- Search에서 새로운 Level 계산
- 검색 클릭 없이 학교 수요로 간주
- 인기 검색 학교 P2 구현
