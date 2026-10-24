# 작업지시서 v2-03 — 디자인 토큰·공통 레이아웃 교체

마스터 규칙 적용 · 예상 2~3시간 · 모델: Sonnet/Opus · 선행: 00 · 기준 화면: 목업 v3 전체

## 1. 왜
- 지금 사이트는 보라 배경·금색 버튼·성 그림(판타지 RPG)이라 "학생 게임"으로 읽힌다. 19세 이상 동창 찾기와 어긋난다.
- SNS 폴더 옆에 둬도 어색하지 않게 **인스타·스레드 문법**(흰 배경, 검은 글자, 아이콘 탭바, 알약 버튼, 이름 첫 글자 아바타)으로 바꾼다. 브랜드색은 진초록 하나.

## 2. 토큰 (`app/globals.css` + `tailwind.config.ts`)
`schoollove-v3.html`의 `:root` 변수를 그대로 옮긴다.
- 배경 `#ffffff`, 보조 배경 `#f2f3f5`, 선 `#e5e7eb`/`#d1d5db`
- 글자 `#0a0a0a`, 보조 `#6b7280`, 흐림 `#9ca3af`
- 브랜드 `#0f7b5f`, 진함 `#0b5f49`, 연함 `#e6f4ef`, 브랜드 글자 `#0b6a51`
- 경고 배경 `#fff7e6`, 경고 글자 `#8a5a00`
- 폰트: 기존 Pretendard 유지. 제목 900/800, 본문 600/500.
- 기존 `brand.blue=#0a0a0a` 재정의와 `--schoollove-*` 변수는 **삭제하지 말고** 위 값으로 재매핑한다(클래스명 유지 → 페이지별 수정 최소화). `--schoollove-level`, `--schoollove-growth` 등 게임용 변수는 그대로 두되 v2 화면에서 쓰지 않는다.

## 3. 공통 컴포넌트
1. **`components/TabBar.tsx`**: 4탭 — 홈 / 학교 찾기 / 알림 / 내 출석부. lucide 아이콘(`House`, `Search`, `Bell`, `User`). 선택 탭은 검정, 비선택 회색. 알림 탭에 읽지 않은 항목이 있으면 초록 점. 기존 `TabBar.test.ts` 갱신.
2. **`components/DesktopNav.tsx`** → 모바일 우선. 상단은 페이지별 네비(뒤로·제목·오른쪽 아이콘). 데스크톱은 최대 폭 600px 중앙 정렬(기존 `maxWidth.content` 유지).
3. **브랜드마크**: 핑크 하트 제거. 초록 둥근 사각형 안 흰 체크(목업 0번) SVG 컴포넌트 `components/BrandMark.tsx`. 텍스트는 당분간 "스쿨러브아이" 유지(10번에서 치환).
4. **아바타**: `components/Avatar.tsx` — 이름 첫 글자, 색 6종(`#5b8def #e8803a #8e5bd1 #3aa876 #d65a7c #4c9fc0`)을 이름 해시로 고정 배정. 사진 업로드 없음.
5. **버튼**: `.btn-primary`(초록, 흰 글자, 52px, radius 14), `.btn-pill`(알약, 초록/검정/회색 3상태), `.btn-secondary`(회색 배경).
6. `components/game/*`(FantasyHero, GameHeader, SceneImage, SceneVideo)과 `public/images/fantasy-v3/*`, `public/videos/scenes/*`는 **삭제하지 않고** 어디서도 import하지 않게 만든다(07번에서 `v1/`로 이동).

## 4. 적용 범위
- `app/layout.tsx`, `app/globals.css`, `TabBar`, `DesktopNav`, `Footer`.
- 페이지 내부(홈·학교·가입·계정)는 04·05·06번에서 다시 만든다. 이 지시서에서는 **토큰 교체로 색만 바뀐 상태**까지만 확인한다(일부 페이지가 어색해 보여도 됨).

## 5. 확인
- `npm run build` 후 `/`, `/search`, `/school/[slug]`, `/login`, `/account`를 Playwright 스크린샷(모바일 375px)으로 `artifacts/mockups/2026-10-22-v3-sns-app/applied/03-*.png`에 저장(프로젝트에 Playwright 있음 — `playwright.config.ts`).
- 검증 순서대로. 커밋 `v2-03: light theme tokens, icon tab bar, brand mark, avatar`.

## 6. 하지 않는 것
- 게임 컴포넌트·이미지 삭제 금지. 어드민 UI는 손대지 않음(07번).

## 7. 보고
`reports/2026-10-22-v2-03.md` + 스크린샷 경로.
