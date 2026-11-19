# 크롤러 Application error 점검·수정 (2026-11-19)

## 현재 상태
- **원인 재현·수정 LOCAL_VERIFIED.** `p2-hotfix:` 커밋. push·배포는 하지 않았다(운영 반영은 별도 확인).

## 재현 (운영 www.schoollove.kr, 공개 페이지 읽기만)
| 조건 | 결과 |
|---|---|
| Googlebot UA (최신 Chrome) | 정상 |
| 저장소·알림·matchMedia 차단 | 콘솔 오류만, 화면 정상 |
| Supabase API 차단 / 페이지 JS 404 | 정상 |
| **서비스워커 없음 + 화면 연결 시점에 문서 로드 완료** | **홈·검색·개인정보처리방침 모두 "Application error: a client-side exception has occurred"** |

- 원인: `components/pwa/ServiceWorkerRegister.tsx`가 `'serviceWorker' in navigator`만 보고 `navigator.serviceWorker.register()`를 바로 불렀다. 서비스워커를 지원하지 않는 렌더러(Googlebot 렌더러, 일부 인앱 WebView)에서는 값이 비어 있어 TypeError가 난다. 문서가 이미 load 완료 상태면 이 호출이 React effect 안에서 바로 실행돼, 루트 레이아웃이 무너지면서 전체 화면이 Application error로 바뀐다(load 전이면 이벤트 안에서 나서 콘솔 오류로만 남는다 — 그래서 일반 PC에서는 안 보였다).
- 운영에는 11/17 오류 복구 화면 핫픽스(f7588fe)도 아직 없어서 빈 오류 화면이 그대로 노출된다.

## 수정
- `lib/browserSafety.ts`(추가): 크롤러 UA 판별, `navigator.serviceWorker`를 실제 `register()`가 있을 때만 반환, 등록의 동기·비동기 실패 모두 흡수, 크롤러는 등록 생략, 푸시 지원 판별도 값·접근 예외까지 확인.
- `components/pwa/ServiceWorkerRegister.tsx`: 위 도우미 사용 + effect 전체 try.
- `lib/push/browser.ts`: 푸시 지원 판별을 안전 도우미로 교체.
- 전역 점검: 렌더 중(첫 화면·hydration)에 localStorage·sessionStorage·window·Notification·matchMedia를 바로 읽는 곳은 없었다. 나머지 접근은 모두 effect/이벤트 안 + try(칠판·신뢰 배지·퍼널·학교 intent·설치 안내·명단 기록 등). 구형 엔진용 최신 JS 기능(replaceAll·at·structuredClone 등)도 클라이언트 코드에 없다.
- 재검사 도구 `scripts/crawler-check.cjs`(읽기 전용, 6개 조건).

## 검증
| 검증 | 결과 |
|---|---|
| `lib/browserSafety.test.ts` (5) + push 테스트 | PASS (25) |
| `npm run typecheck` | PASS |
| `npm test -- --pool=threads --maxWorkers=2` | **1,911 PASS**, 기존 4 skipped |
| 변경 파일 ESLint | PASS |
| 수정본 로컬 빌드 + `crawler-check` 6개 조건 × 홈·검색·방침·로그인 | **Application error 0, 페이지 오류 0** (같은 조건에서 운영은 3/3 Application error) |

## 운영 반영 후 확인 방법
```
ONLY=noSwLoaded,googlebot,locked node scripts/crawler-check.cjs "$PWD" https://www.schoollove.kr
```
Search Console → URL 검사 → 실제 URL 테스트 → 스크린샷에서 오류 화면이 사라졌는지.

SNS 일지용 한 줄: 구글 검색 로봇이 보면 사이트가 오류 화면으로 보이던 원인(알림 기능 준비 코드)을 찾아 고침 | 운영 반영 전 | 일반 사용자 화면은 원래 정상
