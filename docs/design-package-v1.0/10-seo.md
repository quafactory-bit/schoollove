# SchoolLoveI Refactoring PRD — SEO v1.0

Status: **FROZEN**

## 0. 정의

SEO의 목적은 페이지 수를 늘리는 것이 아니다.

**학교 이름으로 들어온 사용자가 결국 사람을 발견하게 만드는 외부 진입 구조를 만든다.**

SEO는 외부 색인 규칙을 소유한다.

---

## 1. URL Hierarchy — 불변

```text
/school/{slug}
/school/{slug}/{year}
/school/{slug}/{year}/{class}
```

이 계층은 절대 평탄화하지 않는다.

```text
School → Year → Class
```

은 SEO 계층이면서 사람 발견 필터 계층이다.

---

## 2. Slug

기존 school slug 구조를 재사용한다.

지역 중복 학교 구분을 위해 지역 prefix romanization 규칙을 유지한다.

기존 slug를 대량 변경하지 않는다.

---

## 3. Index / Noindex

### Search

- 검색 결과 페이지: `noindex`

### School Hub

- State A / cold-start thin school: `noindex`
- 문서 기준 등록 0~2명 구간은 noindex
- 성장 후 index 승격 가능

### Year / Class

- 프로필 3명 미만: `noindex`
- 빈 기수 / 빈 반: `noindex`
- noindex 페이지는 sitemap 제외

색인 여부를 각 페이지가 임의 판단하지 않는다.

SEO Policy가 소유한다.

---

## 4. Metadata

학교·기수·반 컨텍스트를 사용해 자동 생성한다.

예시:

```text
대치고등학교 사람 찾기 · 인스타 모음
대치고등학교 2020년 졸업 사람 찾기
대치고 2020년 3학년 2반 인스타 모음
```

카피는 사람 발견 목적을 유지한다.

개인 이름을 대량 SEO 키워드로 생성하지 않는다.

---

## 5. Canonical

- School URL은 해당 School Hub canonical
- Year URL은 해당 Year Hub canonical
- Class URL은 해당 Class Hub canonical
- 검색/클라이언트 이름 필터는 별도 canonical URL을 만들지 않는다

검색 query 기반 duplicate URL을 만들지 않는다.

---

## 6. Sitemap

Sitemap은 index 가능한 School/Year/Class URL만 포함한다.

우선순위는 페이지 수가 아니라 실제 발견 가능한 콘텐츠다.

Freshness 신호:

- 최근 등록
- 콘텐츠/명단 갱신
- Level/학교 상태 변화

최근 성장 페이지가 다시 크롤링될 수 있도록 sitemap freshness를 갱신한다.

---

## 7. SSR / 성능 경계

- School/Year/Class SEO 랜딩은 SSR 유지
- Year/Class 명단은 페이지네이션 가능
- 집계값은 캐시 가능
- 이름 검색은 P1 클라이언트 필터이므로 URL/index에 영향 없음

대형 학교 고비용 query 최적화는 P2 성능 항목으로 관리한다.

---

## 8. SEO와 Product 경계

SEO가 다음을 결정한다.

- index / noindex
- canonical
- sitemap
- freshness
- URL structure
- metadata rule

SEO가 다음을 결정하지 않는다.

- Level 계산
- Feed 이벤트 정책
- School State 감정/CTA
- Register Flow

---

## 9. P2 / Future

- Schema.org 확장
- OG Image 자동화
- 지역 Hub
- 추가 구조화 데이터
- 대형 학교 query/caching 고도화

---

## 10. 하지 않는 것

- Search 결과 색인
- 개인 이름 thin page 대량 생성
- URL hierarchy 평탄화
- empty/thin Year/Class sitemap 포함
- SEO 때문에 Product Principles 변경
