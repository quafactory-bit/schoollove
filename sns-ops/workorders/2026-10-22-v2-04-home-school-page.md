# 작업지시서 v2-04 — 로그아웃 홈 + 학교 페이지(졸업연도별 등록 수)

마스터 규칙 적용 · 예상 2~3시간 · 모델: Sonnet/Opus · 선행: 03 · 기준 화면: 목업 1번

## 1. 왜
- 지금 학교 페이지는 "Lv.1 · 0%"만 보여서 "아무도 없다"를 증명한다. 사람이 있다는 신호는 로그인 전에 보여야 한다.
- 숫자(학교·졸업연도별 등록 수)는 개인정보가 아니다. 묶어서 반영할 필요 없다.

## 2. DB — 새 RPC (새 migration 파일)
`school_year_counts_v2(p_school_id uuid)` → `TABLE(graduation_year int, count int)`.
- 조건: 해당 학교 memberships 중 명단 표시가 켜진 것만, 졸업연도별 집계, count ≥ 1만 반환, 연도 내림차순.
- `SECURITY DEFINER`, `anon`·`authenticated`에 EXECUTE. 이름·ID 등 개인 식별 컬럼은 절대 반환하지 않는다.
- 학교 합계는 클라이언트에서 합산.
- 원격 적용은 승인 대기. 로컬 테스트는 기존 isolated-db 스크립트 방식이 가능하면 사용, 아니면 SQL 단위 테스트 파일만 추가하고 "미실행"으로 보고.

## 3. 학교 페이지 `app/school/[slug]/page.tsx` (로그아웃·로그인 공통)
위에서 아래로:
1. 네비: 뒤로 · "학교" · 공유 아이콘
2. 회색 소제목: `서울 서초구 · 고등학교`
3. 제목 28px: 학교 이름
4. 설명: `**N명**이 등록했어요. 졸업연도를 고르면 같은 기수 출석부가 보여요.` (N=0이면 `아직 등록한 사람이 없어요. 첫 번째가 되어 주세요.`)
5. 4칸 띠(`components/HowItWorksStrip.tsx`): 학교 찾고 › 졸업연도 고르고 › 이름 확인하고 › 인스타 서로 수락
6. 연도 목록: `2005년 졸업 …… 3명 ›` 행 58px, 숫자 22px 초록. 행을 누르면 `/school/[slug]/[year]`로. 반환 안 된 연도는 "그 외 연도 — 아직 없음" 한 줄.
7. 버튼: 로그아웃이면 `Google로 시작하고 출석부 보기`(→ `/login?next=/school/[slug]`), 로그인·미등록이면 `이 학교 등록하기`, 로그인·등록됨이면 `내 출석부 보기`.
8. 작은 글씨: `이름·졸업연도는 같은 학교 회원에게만 보여요. 인스타 주소는 서로 수락할 때만. 만 19세 이상.`
- 제거: 레벨·XP·진행률·"학교 키우는 세 걸음"·공성전 영상·학교 그림.

## 4. 연도 페이지 `app/school/[slug]/[year]/page.tsx` (로그아웃 상태)
- 제목 `2005년 졸업 · 3명`, 아래 흐린 아바타 자리 3개(이름 없음, 회색 원 + "?"), 버튼 `Google로 시작하고 출석부 보기`. 로그인 상태의 명단은 06번.
- `[class]` 페이지는 당분간 `[year]`로 리다이렉트(반은 선택 입력이 되므로).

## 5. 홈 `app/page.tsx` (로그아웃 전용 — 로그인 상태면 `/account`로 리다이렉트, 06번에서 `/account`가 출석부가 됨)
- 제목: `그때 그 친구, 지금 뭐 하는지 궁금하지 않아요?` / 설명: `학교와 졸업연도로 같은 기수 출석부를 보고, 서로 수락하면 인스타그램 주소를 교환해요.`
- 검색창(기존 `SearchBar` 자동완성 그대로) · 4칸 띠 · 버튼 `내 학교 찾기`.
- 제거: `FantasyHero`, `GameHeader`, `SceneVideo`, 총 학교 순위 박스, `MyGrowthSchools`, `GrowthHowItWorks`, `WorldcupBanner`, `HomeActivityFeed`, `TodayGrowthStrip`, `CurrentSchoolRanking`.
- 메타데이터 제목·설명도 위 문구로.

## 6. 확인
- RPC 단위 테스트(가능한 범위), 페이지 렌더 테스트(`page.test.ts` 갱신), Playwright 스크린샷 `applied/04-*.png`.
- 검증 순서대로. 커밋 `v2-04: school page with per-year counts, logged-out home`.

## 7. 하지 않는 것
- 로그인 후 명단(06번), 가입 흐름(05번)은 건드리지 않음. 기존 랭킹 RPC·테이블은 삭제·수정하지 않음.

## 8. 보고
`reports/2026-10-22-v2-04.md` + 새 migration 파일 경로(적용 승인 대기).
