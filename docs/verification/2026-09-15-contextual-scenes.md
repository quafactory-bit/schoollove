# 화면별 이미지·영상 제작 검증

상태: LOCAL_VERIFIED (화면 및 기능). 운영 배포 없음.

## 완성 결과

- 홈·검색·로그인·가입·내 학교·내 연결·연결 상세·공유·환영 안내 네 단계·학교 다섯 단계: 17가지 화면/상태, PC 1280 및 모바일 390 총 34개 캡처.
- 원본 이미지 12종, 공성전 정지 이미지 1종. 홈 6초 영상(475 KB), 공성전 7.5초 배너(1.37 MB), 로컬 검토용 27초 전체 공성전.
- 공성전은 사용자의 기존 원본 세 편에서 자막과 브랜드 로고가 추가되기 전 장면으로 재편집했다. 영상 속 깃발과 문양은 장면 구성이다.
- 로컬 검토 주소: http://127.0.0.1:3117/visual-review

## 변경 파일

- 신규: `components/game/SceneImage.tsx`, `SceneVideo.tsx`, `app/scenes.css`, `public/images/scenes/*`, `public/videos/scenes/*`.
- 화면 연결: `app/page.tsx`, `app/layout.tsx`, `app/login/page.tsx`, `app/onboarding/OnboardingClient.tsx`, `app/connections/ConnectionsClient.tsx`, `components/SchoolSearchResults.tsx`, `components/account/AccountWelcomeGuide.tsx`, `components/game/SchoolWorld.tsx`, `components/growth/{MyGrowthSchools,OwnerGrowthFeedback,GrowthShareButton}.tsx`.
- 검증/미리보기: `components/game/SchoolWorld.test.tsx`, `scripts/game-visual/image.jsx`, `scripts/growth-ux/{fixture.jsx,serve.mjs,local-api.mjs,visual-gallery.jsx,scene-review.mjs}`.
- 결정, 디자인 보완, 변경 이력, 구현 기록, 본 검증 문서 및 이미지 출처 기록.

## 변경하지 않은 기존 파일/계약

API, DB, migration, 인증, 개인 정보 및 인스타그램 허용 경계, 실제 순위/XP 계산, package/lockfile, 환경 파일, 연결 상세 컴포넌트, 기존 원본 이미지·영상은 변경하지 않았다. 학교 시각 단계 경계는 1/2/4/7/10 그대로다. 제거된 구형 SVG/AVIF/인물 중첩에만 의존하던 테스트는 새 독립 학교 이미지 검증으로 갱신했다.

## 실행한 검증과 실제 결과

| 검증 | 결과 |
| --- | --- |
| 작업 전 `git status --short --branch` | 기존 변경 없음 |
| 대상 Vitest 네 파일 | 54개 통과 |
| `npm run typecheck` | 통과 |
| `npm test -- --maxWorkers=2` | 206개 파일/1,708개 테스트 통과, 기존 3개 파일/4개 테스트 제외 |
| `node scripts/growth-ux/scene-review.mjs` | 34개 화면: 가로 넘침·보이는 이미지 오류·브라우저 오류 없음. 재생/정지/재개, 화면 밖 정지, reduced-motion, 영상 오류 대체 통과 |
| `node scripts/welcome-guide/check.mjs` | 320/390/1280, 네 단계, 초점·닫기·재열기, 계정 상태·비상 중단·저장소 실패 통과. 실제 쓰기 0 |
| `node scripts/welcome-guide/connection-copy-check.mjs` | off/private/shared × 세 너비 통과. 메시지 요청 및 실제 쓰기 0 |
| `npm run build` | 통과(exit 0), 컴파일·타입 검사·67개 정적 페이지 생성·최적화 완료 |
| `git diff --check` 및 변경 목록 검토 | 통과 |

첫 전체 테스트 실행에서 기존 암호화 오류 경계 테스트 한 개가 실패했다. 해당 파일을 수정하지 않고 단독 실행한 12개와 동시 작업 수를 줄인 전체 재실행은 모두 통과했다. 기존 ESLint 경고는 유지된다. 빌드는 프로세스 한정 loopback/dummy Supabase 설정으로 실행했다.

## 미실행 검증과 남은 한계

- 실제 회원 가입, 실제 사용자 간 연결·허용 변경, 외부 인스타그램 DM 전송, 운영 사이트 검증, 물리 모바일 기기 검증은 실행하지 않았다.
- 스크린샷은 실제 React 구성에 합성 예시 데이터를 사용했다. 실제 학교 순위나 사용자 명단이 아니다.
- 브라우저가 자동 재생을 제한하거나 영상 로딩에 실패하면 정지 이미지가 유지된다.
- 검토 서버는 이 PC에서 실행 중일 때만 열린다.

## 원격 변경 및 다음 단계

이미지 생성과 힉스필드 영상 생성·편집 파일 업로드만 수행했다. commit/push/merge/운영 배포, 원격 DB 및 설정 변경은 없다. 다음 단계는 사용자 화면 검토와 해당 시각 변경의 배포 승인이다.
