# Part 2 1차 운영 배포 (2026-11-19)

## 현재 상태
- **PRODUCTION_DEPLOYED.** main `7fe9d7f`(v2-simplified no-ff 병합, 최종 tree = v2-simplified) → Vercel Production **success**.
- 운영 DB `schoollovei`(`ucnybhzpbatzcipwqtox`)에 migration 2개 적용(배포 전): `prod-deploy-1119/` 사전 조회·적용 SQL·결과.
- apex `schoollove.kr` → `www.schoollove.kr` **308 영구 리디렉션 적용**(Vercel → Settings → Domains, 운영자 로그인 후). 대상·다른 도메인·DNS는 변경 없음("DNS Change Recommended" 안내는 범위 밖이라 그대로).

## 포함된 것
- 크롤러 Application error 수정(서비스워커 등록 보호) + 오류 복구 화면(11/17 핫픽스)
- P0-1 화면 단계 익명 집계, P1 학교 상세·검색·홈, P2 신뢰 배지·학교/연도 이어받기, P4 사이트맵 전체 학교
- 개인정보처리방침 개정(시행일 2026-11-19): 비로그인 가린 이름, 화면 단계 익명 집계 문장(실제 저장 항목 그대로) 추가
- 제외(2차): P2 복구 이메일 생략·One Tap, P3 근황 태그·소환장·잠금 게이지

## 운영 확인 (배포 후, 비로그인·공개 페이지)
| 확인 | 결과 |
|---|---|
| `scripts/crawler-check.cjs` 6개 조건 × 홈·검색·학교·연도·방침 | **Application error 0** (배포 전 같은 조건 noSwLoaded에서 홈·검색·방침 3/3 오류) |
| 사이트맵 URL 수 | 1,001 → **10,007** |
| 방침 시행일 | 2026-11-19 |
| 진명여고 2018 연도 페이지(운영 유일 명단 3명) | 가린 이름 3개(각 3글자 `첫 글자+O+끝 글자`), 원문 이름 없음 |
| 검색 "진명여자고" | 결과 1건, **출석부 열림 · 기수 보기 →** 배지 |
| 홈 `?ref=threads` | 상단 신뢰 배지 1개, 페이지 오류 0 |
| 홈 LIVE·TOP 5 | **숨김(정상)**: 운영 최근 7일 출석 0건 < 기준 5건 |
| apex 308 | `/`·`/?ref=threads`·`/?ref=ig&utm_source=threads&utm_campaign=a%20b`·`/school/…/2018?ref=ig` 모두 **308 → www 같은 경로·쿼리 그대로**. `http://schoollove.kr/?ref=threads` → 308 https → 308 www → 200 |
| 인기 학교 칩 | 운영 집계가 오늘 시작이라 3회 이상 학교가 생길 때까지 숨김 |

- 확인 중 운영에서 학교 검색 1회·화면 방문 몇 회를 했다(집계·검색 통계에 소량 반영됨).

## 롤백 경로
1. Vercel → schoollove-kr → Deployments(Production) → 직전 배포(main `9b8d2ea`, `BurvSTHa2zQimpy4SHok39RHX2xa`) `⋯` → Instant Rollback.
2. 코드: `git revert -m 1 7fe9d7f`(새 커밋, 강제 push 없음).
3. DB: 추가 전용(표 1·함수 7)이라 이전 앱도 그대로 동작한다. 지울 필요 없음.

## 남은 일
- 2차: P2 복구 이메일 생략·One Tap, P3 새 표·화면 → Preview 실가입 검증 후 운영.
- Search Console: 사이트맵 재제출, URL 검사로 오류 화면 해소 확인.

SNS 일지용 한 줄: 학교 화면 미리보기·검색 배지·신뢰 안내·사이트맵 1만 개를 운영에 올리고, 검색 로봇에게 보이던 오류 화면을 없앰 | 홈 실시간 출석은 출석이 5건 넘으면 자동으로 보임 | 새 기능 홍보는 'Part 2 끝났어' 이후
