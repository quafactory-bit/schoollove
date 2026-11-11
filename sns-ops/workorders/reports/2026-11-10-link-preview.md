# 링크 미리보기(OG) 보고 — 2026-11-10

운영자 승인 2건을 main 배포까지 한 번에 진행했다.
1. 사이트 기본 미리보기 이미지 + 기본 메타데이터
2. 졸업연도 페이지 미리보기 이미지 + 연도 og:title + og:url

## 한 일
| # | 내용 | 커밋 (v2-simplified → main 병합) |
|---|---|---|
| 1 | `app/opengraph-image.tsx` 추가(1200×630, 흰 바탕·초록 체크·"출석부"·"그때 그 친구, 지금 뭐 하는지 궁금하지 않아요?"·"학교와 졸업연도로 같은 기수 출석부"). layout description을 새 정의로 바꾸고 openGraph(siteName·locale·type)와 twitter(summary_large_image) 추가 | `a640cc9` → main `f6156d3` |
| 2 | `app/school/[slug]/[year]/opengraph-image.tsx` 추가(학교명+졸업연도, `school_year_counts_v2` 공개 숫자만, 0명이면 "아직 아무도 없어요 · 첫 번째가 되어 주세요", 이름 없음). 연도 페이지 og:title "가락고 2010년 졸업 출석부 · N명". canonical이 있는 모든 페이지에 og:url = canonical | `0bfa4c3` → main `9b8d2ea` |

## 변경 파일
- 추가: `app/opengraph-image.tsx`, `app/school/[slug]/[year]/opengraph-image.tsx`
- 수정: `app/layout.tsx`, `app/page.tsx`, `app/school/[slug]/page.tsx`, `app/school/[slug]/[year]/page.tsx`
- 이 보고서

## 변경하지 않은 기존 파일
- `app/school/[slug]/opengraph-image.tsx`(학교 공유 이미지), `lib/seo.ts`, `lib/schoolYearCounts.ts`, `lib/push/contracts.ts`(줄임 학교명 함수 `shortSchoolName`을 가져다 씀). DB·migration·환경변수 변경 없음.
- 작업 폴더의 미커밋 `.gitignore` 변경은 건드리지 않았다(main 병합은 임시 worktree에서 함).

## 판단한 것 (지시 외 보완)
- `/`와 `/school/[slug]`는 페이지 자체 openGraph가 layout 것을 통째로 덮어써서 siteName·locale·type이 빠졌다 → 두 페이지에 직접 넣음. 이미지는 파일 규칙이라 빠지지 않았다.
- "모든 페이지에 og:url = canonical": 지금 canonical이 있는 페이지는 `/`, `/school/[slug]`, 그리고 이번에 canonical을 새로 단 `/school/[slug]/[year]` 세 곳이다. 세 곳 모두 og:url을 canonical과 같은 값으로 맞췄다. `/search`·`/login` 등 canonical이 없는 페이지에는 og:url도 넣지 않았다.
- 연도 페이지 robots(noindex)는 그대로다. 숫자 조회가 실패하면 0명으로 표시한다(연도 화면과 같은 규칙).
- 기본 이미지 제목은 "궁금하지 / 않아요?"로 어색하게 끊겨서 "그때 그 친구," 뒤에서 두 줄로 나눴다. 맨 아래 회색 줄(기본: "서로 수락하면 인스타그램 주소를 교환해요 · 만 19세 이상", 연도: "이름은 같은 학교 회원에게만 보여요 · 만 19세 이상")은 지시에 없던 문구다.

## 실행한 검증
- `npm run typecheck` 통과(2회차 첫 시도에서 og:url 타입 오류 1건 → 수정 후 통과).
- 관련 테스트(`app/school`, `lib/seo.test.ts`, `app/page.test.ts`, `app/v2Rendering.test.tsx`) 6파일 27건 통과.
- `npm test` 227 파일 / 1827 통과 / 4 skip. 1차 작업 중 첫 전체 실행에서 1건 실패가 있었으나(빌드와 동시 실행, 어떤 테스트인지 미확인) 이후 3회 모두 통과.
- `npm run build` 통과(두 번 모두).
- 로컬 `next start`에서 6개 주소 메타 태그와 이미지 렌더 확인.

## 운영 확인 (curl, www.schoollove.kr)
2차 배포(`9b8d2ea`) 반영 뒤 2026-11-10 확인. 가락고등학교 2010년 = `/school/seoul-songpa-garaggodeunghaggyo/2010`.

| 주소 | og:title | og:url (= canonical) | og:image 응답 |
|---|---|---|---|
| `/` | 그때 그 친구, 지금 뭐 하는지 궁금하지 않아요? | `https://www.schoollove.kr` = canonical | `/opengraph-image` 200 image/png 35KB |
| `/search` | 학교 검색 \| 출석부 | (canonical 없음) | `/opengraph-image` 200 image/png |
| `/school/…garaggodeunghaggyo` | 가락고등학교 · 졸업연도별 출석부 | 같음 | 학교 이미지 200 image/png 22KB |
| `/school/…garaggodeunghaggyo/2010` | **가락고 2010년 졸업 출석부 · 0명** | 같음 | **연도 이미지** 200 image/png 31KB |
| `/login` | Google 로그인 \| 출석부 | (canonical 없음) | `/opengraph-image` 200 image/png |

- 다섯 곳 모두 `twitter:card=summary_large_image`.
- 가락고 2010년 운영 이미지를 받아 눈으로 확인: "가락고등학교 2010년 졸업" + "아직 아무도 없어요 · 첫 번째가 되어 주세요", 이름 없음.
- 0명은 실제 값이다. 운영 학교 페이지도 "아직 등록한 사람이 없어요"로 같다. 숫자가 1 이상인 경우("N명이 출석부에 있어요")는 운영에서 확인할 수 있는 학교·연도가 없어 렌더를 보지 못했다(코드 경로는 학교 이미지와 같은 숫자 조회).
- 1차 배포(`f6156d3`) 직후에도 같은 5개 주소의 og:image가 200 image/png로 열리는 것을 확인했다.

## 원격 변경 여부
- `v2-simplified` push 2회, `main` push 2회(`f6156d3`, `9b8d2ea`) → Vercel Production 자동 배포.
- DB·환경변수·Vercel 설정 변경 없음.

## 남은 위험 요소
- 카카오톡·페이스북·스레드는 예전 미리보기를 캐시해 둘 수 있다. 새 이미지가 안 보이면 각 서비스의 공유 디버거에서 다시 불러와야 한다.
- 연도 og:title의 숫자는 페이지를 연 시점 값이라, 메신저가 캐시하면 오래된 숫자가 보일 수 있다.
- 줄임 학교명은 "고등학교→고, 중학교→중, 초등학교→초"만 바꾼다. 대학교 등은 전체 이름이 그대로 나온다.

## 사용자 승인이 필요한 다음 단계
- 없음(이 보고서 커밋은 v2-simplified에만 하고, main에는 다음 코드 배포 때 함께 들어간다).

SNS 일지용 한 줄: 카톡·인스타에 링크를 붙이면 "출석부" 카드와 "OO고 2010년 졸업 · N명" 카드가 뜨게 함 | 페이지마다 미리보기 설정이 서로 덮어써서 일부 정보가 빠지는 문제가 있었음 | 이름은 절대 넣지 않고 공개 숫자만 보여 주기로 함
