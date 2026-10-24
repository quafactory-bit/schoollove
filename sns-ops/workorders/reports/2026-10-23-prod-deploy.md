# v2 운영 배포 보고 — 조용한 배포 (2026-10-23 결정, 2026-10-25 실행)

## 결과 한눈에
- **운영 사이트에 v2(출석부)가 올라갔다.** `main` = `6d02763`(v2-simplified를 no-ff 병합), Vercel Production **Ready**(빌드 1m 12s), 2026-10-25 02:51 KST.
  - 배포: https://vercel.com/quafactory-s-projects/schoollove-kr/6kojDdFvBVETtnFa6ig7FRbP2tzt
  - 주소: https://www.schoollove.kr (apex `schoollove.kr`은 전처럼 www로 307), 고정 주소 `schoollove-kr-git-main-quafactory-s-projects.vercel.app`
- **운영 DB migration 4개 적용 완료**(2026-10-25 02:50 KST, 한 트랜잭션, 이력 4건). 기록: `prod-deploy/01-precheck-result.md`, `prod-deploy/02-apply-result.md`.
- 개인정보처리방침 시행일 `2026-10-25`(지시의 "오늘"이 자정을 넘겨 실제 배포일로 맞춤).
- 도메인 리다이렉트(`NEXT_PUBLIC_SITE_DOMAIN`)는 **넣지 않음**. 10번 나머지는 도메인 연결 뒤.
- 공지·SNS 게시 없음(조용한 배포).

## 단계별 기록
| 단계 | 내용 | 커밋/증적 |
| --- | --- | --- |
| 1 | `lib/privacyNotice.ts` 시행일 플레이스홀더 → 배포일 | `86a3fb1`(10-24) → `6384254`(10-25로 정정) |
| 2 | 운영자용 SQL 2개 준비 `prod-deploy/01-precheck.sql`(읽기 전용) · `02-apply.sql`(4개 한 트랜잭션 + 이력 4건, 안전장치 포함) | `1745fce` |
| 3 | 사전 조회: 선행 객체 14개 ✓, 새 객체 3개 없음 ✓, 교체 대상 함수 3개 본문 = 저장소 이전 버전 ✓, 이력 없음 ✓ → **적용 가능** | `a217034`, `01-precheck-result.md` |
| 3' | 적용(운영자 지시로 에이전트가 SQL Editor에서 실행): Success, 적용 직후 확인 13항목 전부 기대값 | `6384254`, `02-apply-result.md` |
| 4 | `v2-simplified` push → `main`에 no-ff 병합 → push → Vercel Production 자동 배포 Ready | `6d02763` |
| 5 | 이 보고서 | — |

## 배포 직후 자동 확인(curl, 2026-10-25 02:55 KST)
- `/` 200, 제목 `출석부 - 그때 그 친구, 지금 뭐 하는지 궁금하지 않아요?`
- `/privacy` 200, `시행일: 2026-10-25`, 처리위탁에 `Google LLC · Apple Inc. · Mozilla · 웹 푸시 알림 전달` 있음
- `/manifest.webmanifest` 200: name·short_name `출석부`, start_url `/account`, theme `#0f7b5f`, 아이콘 `icon-v2-*`
- `/search` `/login` `/terms` `/contact` `/sw.js` 200 · `/account` `/onboarding` `/notifications` → `/login?next=…` 307(로그아웃 상태 정상)
- `POST /api/push/subscribe`(비로그인) 401 `로그인이 필요합니다.`

## 배포 후 확인 체크리스트 (운영자, 브라우저·폰)
1. [ ] **홈**(로그아웃): www.schoollove.kr 에서 초록 체크 브랜드마크 + 검색창 + "내 학교 찾기" 버튼이 보이고, 레벨·순위·게임 화면이 없다.
2. [ ] **학교 검색**: "진명" 검색 → 진명여자고등학교가 나온다(검색 래퍼 수정 확인). 2글자 미만은 결과 없음.
3. [ ] **학교 페이지**: 아무 학교나 열어 졸업연도별 등록 수 줄이 "잠시 불러오지 못했어요" 없이 숫자 또는 "아직 등록한 사람이 없어요"로 보인다(`school_year_counts_v2`). 공유 이미지(카톡 미리보기)가 흰 바탕 초록 체크로 나온다.
4. [ ] **로그인 → 출석부**: Google 로그인 → `/account`가 출석부 탭 화면이다. 학교 등록에서 고등학교 졸업연도 목록이 2025 이하만 보이고, 등록 후 출석부와 학교 페이지 숫자가 1 늘어난다.
5. [ ] **개인정보처리방침**: `/privacy` 맨 위 시행일 2026-10-25, "알림 · 선택" 항목과 푸시 사업자 처리위탁 항목이 보인다.
6. [ ] **홈 화면에 추가**(안드로이드 폰 Chrome): 가입 직후 설치 안내 화면 → 설치 → 아이콘 라벨 "출석부", 열면 `/account`. (아이폰은 사파리 공유 → 홈 화면에 추가 안내 문구 확인)

- 참고: 출석부 위 **알림 켜기 카드는 지금 운영에서 안 보이는 게 정상**이다 — Vercel **Production**에 VAPID 3개가 아직 없어서 브라우저가 `not-configured`로 판단한다. 푸시만 꺼진 상태이고 다른 기능엔 영향 없다. 켜려면 Preview 때처럼 Production 환경변수 3개(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`, Preview와 **다른 새 한 쌍** 권장) 추가 후 재배포 → 관리자 홈 테스트 버튼.

## Instant Rollback 경로 (문제가 보이면)
1. **코드 되돌리기(1분, 권장 첫 조치):** Vercel → `schoollove-kr` → Deployments → Environment: Production → 직전 배포 `5350531` "docs(attribution): record weekly verification and approved cleanup (#132)"(Ready, Oct 15) 행의 `⋯` → **Instant Rollback** → 확인. www.schoollove.kr 이 즉시 v1로 돌아간다. (다음 `main` push가 있기 전까지 유지. 다시 v2로 오려면 `6kojDdFvB…` 배포에서 **Promote to Production**.)
2. **git 기준점:** v1 = 태그 `v1-2026-10-22` = 브랜치 `v1-keep` = `5350531`. main을 코드로 되돌려야 하면 `git revert -m 1 6d02763`(새 커밋, 강제 push 없음).
3. **DB는 되돌리지 않아도 된다:** 4개 모두 추가 전용(표 1개 신설, 함수 2개 신설, 함수 3개 교체). v1 코드와 호환 — 탈퇴 함수는 구독 삭제 한 줄만 추가, 검색 래퍼는 v1에서도 항상 실패하던 것을 고친 것, 학교 등록 함수는 재학 연도만 추가로 거부(v1 화면에서 그 경우 "알 수 없는 오류" 문구로 보일 수 있음). 정말 DB까지 되돌려야 하면 별도 승인 후 함수 3개를 이전 버전으로 다시 `CREATE OR REPLACE`하고 새 객체 3개를 DROP, 이력 4건 삭제 — 스크립트는 그때 작성.
4. Supabase 백업: Free 플랜이라 일일 백업 없음. 적용 전 상태의 함수 본문은 `01-precheck-result.md`(md5)와 저장소 migration 파일에 있다.

## 발견한 것 (배포 후 조치 필요)
- **`/privacy` 1절 문장 불일치:** "안부 도착·재알림·수락 알림은 본인 계정 안에서만 제공하며 **외부 이메일·푸시로 발송하지 않습니다**"가 남아 있다(`app/privacy/page.tsx:25`). 같은 페이지 아래에는 선택 푸시 알림과 사업자 처리위탁이 적혀 있어 서로 어긋난다. 제안 문구: "알림은 본인 계정 안에서 제공하며, 본인이 직접 켠 경우에만 브라우저 푸시로도 보냅니다(이메일 발송 없음). 알림 내용에 이름·인스타그램주소·연락처는 넣지 않습니다." — 운영자 승인 후 수정·재배포.

## 남은 것
- Production VAPID 3개(위 참고) → 푸시 실제 기기 확인(새 동문·요청·수락).
- `/privacy` 1절 문장 수정(위).
- 도메인 `chulseokbu.kr` 연결 뒤: `NEXT_PUBLIC_SITE_DOMAIN`, 10번 나머지(SNS 문서 이름 변경은 승인 후).
- 09b 이메일: 첫 기수 실험 뒤.
- 이 보고서와 DB 적용 기록은 `v2-simplified`·`preview`에만 커밋(문서만으로 운영 재배포를 만들지 않으려고 main에는 다음 코드 배포 때 함께 들어간다).

SNS 일지용 한 줄: 이름을 "출석부"로 바꾼 새 버전을 밤에 조용히 운영에 올림(DB 손질 4개 먼저, 코드는 그다음, 공지 없음) | 되돌릴 길은 1분짜리 버튼 하나로 미리 확인해 둠 | 폰 알림은 운영 키를 아직 안 넣어서 꺼 둔 상태, 켜는 건 다음 차례
