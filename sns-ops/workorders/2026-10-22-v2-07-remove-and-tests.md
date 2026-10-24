# 작업지시서 v2-07 — 뺄 것 내리기 + 테스트 정리

마스터 규칙 적용 · 예상 2~4시간 · 모델: Sonnet/Opus · 선행: 03·04 (1차 마지막)

## 1. 왜
- 게임·순위·어드민 광고주/결제/프로모션은 사용자 0명 단계에서 필요 없고, 화면에 남아 있으면 v2 메시지를 흐린다.
- 코드는 지우지 않는다(되돌리기 보장). **import 경로에서만 끊고 `v1/` 폴더로 옮긴다.**

## 2. 화면·라우트에서 내리는 것
| 대상 | 처리 |
|---|---|
| `components/game/*`, `components/growth/*`, `CurrentSchoolRanking`, `TodayGrowthStrip`, `HomeActivityFeed`, `HomeActivityItem`, `HomeFeedCta`, `SchoolGrowthPanel`, `RegistrationGrowthRewardCard`, `WorldcupBanner`, `SchoolWarmth`, `TodayInstagramCard` | `components/v1/`로 이동, 어디서도 import하지 않음. 각 컴포넌트의 `.test.ts`도 같이 이동(실행 대상에서 제외: `vitest.config.ts`의 exclude에 `**/v1/**`). |
| `lib/policy/levelPolicy·levelPersistence·schoolGrowth·schoolHubGrowthView·schoolRanking·registrationGrowthReward·growthPeriod·homeFeed·schoolJourney` | **이동하지 않음**(API·DB와 얽힘). 그대로 두고 v2 화면에서 호출만 안 함. 테스트도 그대로 유지·통과. |
| `app/admin/beta/advertisers`, `app/admin/payments`, `app/admin/promotions`, `app/admin/promotion-operations`, `app/promote/*`, `app/invite`, `app/submit`, `app/feedback` | 라우트는 남기되 어드민 네비·사용자 네비에서 링크 제거. `app/promote/*`와 `/invite`·`/submit`은 `/`로 리다이렉트. `/feedback`은 `/contact`로. |
| `app/admin/tools/level-sync` | 링크 제거(라우트 유지). |
| `public/images/fantasy-v3/*`, `public/videos/scenes/*`, `public/worldcup-banner.png`, `public/images/*` 학교 유형별 배너 | 파일은 그대로. 참조만 제거. (`-v2` 규칙: 새 자산은 새 이름으로만.) |
| `GAME_VISUAL_EXPERIENCE_V1.md`, `SCHOOL_GROWTH_UX_COMPLETION.md`, `docs/GAME_*`, `docs/SCHOOL_GROWTH_*` | `docs/v1/`로 이동. 링크 깨짐 확인. |

## 3. 테스트 정리 원칙 (`AGENTS.md` L절 + 마스터 규칙 8)
- 이동한 컴포넌트의 테스트는 **함께 이동**(삭제 아님). `vitest.config.ts` exclude에 `**/v1/**`.
- 남는 기능의 테스트는 **지우거나 약화하지 않는다.** 바뀐 문구·구조 때문에 깨진 테스트는 새 화면 기준으로 **고친다.**
- `app/page.test.ts`, `account/page.test.ts`, `TabBar.test.ts` 등 03·04·06에서 이미 갱신한 것은 그대로.
- 결과 보고: 시작 시 테스트 수 / 이동 수 / 수정 수 / 끝 테스트 수 / 통과·실패.

## 4. 네비 최종 상태
- 사용자: 홈 / 학교 찾기 / 알림 / 내 출석부 (탭바). 상단 링크 없음. 푸터: 개인정보처리방침 · 이용약관 · 문의 및 삭제 요청.
- 어드민(`/admin`): 프로필 · 안전(신고·차단) · 삭제 요청 · 운영. 나머지 메뉴 숨김.

## 5. 확인
- 전 라우트 빌드 통과. `/`, `/search`, `/school/[slug]`, `/login`, `/onboarding`, `/account`, `/notifications`, `/admin` 스크린샷 `applied/07-*.png`.
- `grep -rn "components/game\|components/growth\|WorldcupBanner\|CurrentSchoolRanking" app components lib` 결과가 `v1/` 안에서만 나와야 한다.
- 검증 순서대로. 커밋 `v2-07: move v1 game/growth/admin-commerce out of the UI, test housekeeping`.

## 6. 하지 않는 것
- 파일 삭제 금지. DB·RPC·API 라우트 삭제 금지(`app/api/admin/payments` 등은 그대로, 링크만 없음). `lib/policy/*` 이동 금지.

## 7. 보고
`reports/2026-10-22-v2-07.md` + 테스트 수 변화표 + **1차 요약 `reports/2026-10-22-v2-round-1.md`**(00~04·07 변경 파일 전체, 새 migration 파일 목록, push·배포·migration 승인 요청, 남은 위험).
