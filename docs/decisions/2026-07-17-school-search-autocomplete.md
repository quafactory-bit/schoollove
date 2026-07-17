# School Search Autocomplete — Phase 4C 결정

Date: 2026-07-17

## Decision

1. **홈과 `/search`가 학교 이름을 입력하면 실제 학교 후보가 드롭다운으로 뜨고, 후보를 선택하면 바로 해당 School Hub(`/school/[slug]`)로 이동한다.** 지금까지 두 화면 모두 `<form method="get" action="/search">`인 순수 GET form이라 Enter를 눌러야만 `/search?q=` 전체 검색으로 이동했고, 타이핑만으로는 아무 반응이 없어 "검색이 고장 난 것" 같은 인상을 줄 수 있었다. Enter 시 기존 `/search?q=` 전체 검색으로 이동하는 계약은 그대로 유지한다(후보를 선택하지 않고 Enter를 누르면 기존과 동일하게 동작).
2. **자동완성 데이터 조회는 기존 `search_schools_v2` RPC(지역 prefix 매칭 포함)를 그대로 재사용하되, `profile_count` enrichment(학교별 `profiles` N+1 조회)는 생략한다.** `lib/api/search.ts`의 기존 `searchSchools`(전체 검색, `/search` 결과 목록에서 사용)는 RPC 결과에 학교당 `profiles` count 쿼리를 추가로 붙이는 N+1 패턴이었다. 자동완성 드롭다운에는 프로필 수 같은 집계 데이터가 필요 없으므로(§4의 표시 항목은 학교명/지역/유형뿐), RPC 호출부(`fetchSchoolsBySearchRpc`)를 공용 helper로 뽑아 `searchSchools`(기존, lim=20, count 포함)와 신규 `searchSchoolsForAutocomplete`(lim=6, count 없음) 양쪽에서 재사용한다. 학교 검색 로직(RPC·정렬)을 중복 구현하지 않으면서 N+1도 만들지 않는 선택이다.
3. **자동완성은 2글자 미만이면 조회하지 않고, 최대 6개까지만 가져온다.** `lib/policy/schoolSearchAutocomplete.ts`의 `AUTOCOMPLETE_MIN_QUERY_LENGTH = 2`, `AUTOCOMPLETE_MAX_RESULTS = 6`으로 명시하고, RPC 호출 자체를 `lim: 6`으로 제한해 "무제한 schools 조회 금지"를 코드 레벨에서 보장한다. `/search` 페이지의 전체 검색(`searchSchools`, lim=20)은 이번에도 무수정이다.
4. **디바운스 250ms + 오래된 응답 무시(stale-response guard)는 React 훅이 아니라 순수 함수 컨트롤러(`createDebouncedAutocompleteSearcher`)가 전담한다.** 저장소에 React 컴포넌트를 렌더링할 테스트 환경(jsdom/@testing-library)이 없어(기존 `vitest.config.ts`는 Node 환경) 새 의존성을 설치하지 않는 범위에서 이 로직을 테스트하려면 React 렌더링 없이 검증 가능해야 했다. `setTimeout` 기반 디바운스와 `requestId` 순번 기반 stale-response guard(더 최신 검색이 시작되면 이전 요청의 결과를 버림)를 순수 모듈로 분리하고, `lib/hooks/useSchoolAutocomplete.ts`는 이 컨트롤러의 콜백을 React state에 반영만 하는 얇은 wrapper로 남긴다. 이 컨트롤러 자체는 `vi.useFakeTimers()`만으로 25개 케이스(디바운스 타이밍, 빠른 검색어 변경 시 오래된 응답 무시, 0건/오류/skip 상태 전이)를 DOM 없이 검증했다.
5. **기존 `lib/hooks/useSchoolSearch.ts`(학교+동문 통합 검색, react-query 기반)는 건드리지 않는다.** 이 훅은 현재도 `components/SubmitForm.tsx`(등록 흐름의 학교 선택 검색)가 실제로 사용 중이며 반환 계약이 `{ data: { schools, profiles }, isLoading }`으로 이번 자동완성 계약과 다르다. 처음엔 저장소에 이미 있던 `components/SearchBar.tsx`(2026년 초기 MVP 시절 구현, 학교+동문 통합 검색 + 개인정보 표시, 현재 어디에서도 import되지 않는 죽은 코드)를 재사용하려 했으나, 요구사항(학교 전용, 개인정보 비노출, 키보드 접근성, 디바운스/오래된 응답 처리)이 근본적으로 달라 새로 작성했다 — 다만 컴포넌트 이름(`SearchBar`)과 파일 위치(`components/SearchBar.tsx`)는 저장소 관례를 그대로 유지했다.
6. **후보에는 학교명·지역(시도/시군구)·학교 유형만 표시하고, 개인 데이터(동문 닉네임/인스타그램)나 `profile_count`는 표시하지 않는다.** "현재 Level을 작은 보조 정보로 표시" 옵션은 이번엔 넣지 않았다 — `search_schools_v2` RPC 응답에 `current_level`이 없어, 넣으려면 후보마다 별도 조회가 필요해져 §3의 N+1 금지와 충돌하기 때문이다(옵션("필요하면")이므로 생략을 선택).
7. **키보드: ArrowDown/ArrowUp은 후보 목록을 순환 이동, Enter는 활성 후보가 있으면 School Hub로 이동·없으면 기존 `/search?q=` 전체 검색, Escape는 드롭다운만 닫는다.** 입력창은 `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`, 목록은 `role="listbox"`/`role="option"` + `aria-selected`를 사용한다. 마우스 hover(`hover:bg-gray-50`, CSS pseudo-class)와 키보드 활성 상태(`bg-blue-50`, React state 기반)를 서로 다른 시각 신호로 분리해 "hover와 키보드 선택 상태 구분"을 만족시켰다.
8. **DB/migration/RPC는 전혀 변경하지 않는다.** `search_schools_v2`는 기존 그대로 호출만 하며, 새 RPC나 인덱스를 추가하지 않았다.

## Reason

- Enter 없이도 학교 후보가 바로 보여야 한다는 요구(§목표)가 최우선이었고, 실제 코드 확인 결과(`app/page.tsx`, `app/search/page.tsx`) 두 화면 모두 순수 GET form이라 클라이언트 자동완성이 전혀 없었다는 사실을 확인했다 — 추측이 아니라 파일 내용으로 근거를 확보했다.
- "기존 학교 검색 함수를 재사용하고 중복 구현하지 않는다"는 지시와 "N+1 조회 금지"가 동시에 걸려 있었는데, 실제로 저장소에는 이름이 같은 `searchSchools`가 두 곳(`lib/api/search.ts`의 RPC+N+1 버전, `lib/api/schools.ts`의 단순 ilike 버전)에 존재했다. RPC 버전이 `/search`가 실제로 쓰는, 지역 prefix까지 매칭하는 더 정확한 검색이었으므로 이걸 재사용하는 것이 "기존 검색 계약과 다른 결과가 나오는" 혼란을 피하는 선택이었고, N+1 부분(count enrichment)만 분리해 걷어내는 것으로 두 요구를 동시에 만족시켰다.
- React 렌더링 테스트 도구가 없는 상태에서 "React UI 테스트 환경이 부족하면 순수 helper로 분리해 우선 테스트" 지시를 따르기 위해 디바운스/stale-response 로직을 React 밖으로 뽑아냈다 — 이 덕분에 새 의존성(`@testing-library/react`, `jsdom` 등) 없이도 타이밍/경쟁 조건을 실제로 검증할 수 있었다.
- `components/SearchBar.tsx`가 이미 존재했지만 실제로는 어디서도 import되지 않는 죽은 코드(2026-01 MVP 시절 `a6904e0`/`d918ad5` 커밋)였고, 학교+동문 통합 검색과 개인정보(닉네임/인스타그램 ID) 노출이라는 이번 요구(§6, 개인 데이터 비노출)와 정면으로 어긋나 그대로 재사용할 수 없었다. 반면 이름이 같은 `lib/hooks/useSchoolSearch.ts`는 죽은 코드가 아니라 `SubmitForm.tsx`가 실제로 쓰고 있어(회귀 위험) 손대지 않고 별도 훅(`useSchoolAutocomplete`)을 새로 만들었다.

## Impact

- 신규 파일: `lib/policy/schoolSearchAutocomplete.ts`(+test), `lib/hooks/useSchoolAutocomplete.ts`, `lib/api/search.test.ts`.
- 수정 파일: `lib/api/search.ts`(`fetchSchoolsBySearchRpc` helper 분리 + `searchSchoolsForAutocomplete` 추가, 기존 `searchSchools`/`searchProfiles`/`searchAll`/`logSearch` 동작 무변경), `components/SearchBar.tsx`(기존 미사용 구현을 신규 계약으로 교체), `app/page.tsx`(검색 form을 `<SearchBar variant="home" />`로 교체, 레이아웃/활동 피드/순위 무수정), `app/search/page.tsx`(검색 form을 `<SearchBar variant="search" initialQuery={q} />`로 교체, 결과 렌더링 로직 무수정).
- 무수정: `lib/api/schools.ts`(admin Level Sync 도구가 쓰는 별도 `searchSchools`), `lib/hooks/useSchoolSearch.ts`/`components/SubmitForm.tsx`(등록 흐름 검색), Home Feed/School Hub/Level 정책/Admin/등록 API, DB/migration/RPC.

## 남은 blocker

- 없음. `search_schools_v2`가 이미 지역 prefix 매칭을 지원하므로 추가 RPC 설계가 필요하지 않았다.
- 참고(이번 범위 밖): 후보에 현재 Level을 보조 정보로 표시하려면 `search_schools_v2`에 `current_level` 컬럼을 추가하거나 별도 배치 조회가 필요하다 — 둘 다 이번 지시의 "DB/migration/RPC 수정 금지"에 걸려 후속 과제로 남긴다.

## Status

APPROVED
