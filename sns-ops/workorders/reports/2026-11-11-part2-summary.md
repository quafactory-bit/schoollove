# Part 2 요약 (2026-11-19 기준)

| 단계 | 상태 | 커밋 | 보고서 |
|---|---|---|---|
| P0-1 퍼널 측정 | Preview 적용·배포. 실제 누적은 Vercel 보호로 미검증 | f6abe67, 8ff16c9, 7f85581 | 2026-11-11-part2-P0-1.md |
| 핫픽스 오류 복구 화면 | push + Preview 배포 완료(preview `13767d4`) | f7588fe | — |
| P0-2 인앱 브라우저 탈출 | **운영자 실기기 재현 대기** | — | P0-1 보고서 |
| P1 학교 상세·검색·홈 | LOCAL_VERIFIED | 1aa8791 | 2026-11-11-part2-P1.md |
| P2 신뢰 배지·이어받기 | LOCAL_VERIFIED. 복구 이메일 생략·One Tap은 **결정 대기** | eef80b6 | 2026-11-11-part2-P2.md |
| P3 근황 태그·소환장·잠금 게이지 | **스키마 초안, 승인 대기** | (보고서만) | 2026-11-11-part2-P3.md |
| P4 색인 점검 | LOCAL_VERIFIED. 사이트맵 1,000개 제한 버그 수정 | (P4 커밋) | 2026-11-11-part2-P4.md |

## 운영 DB에 적용할 migration (순서대로)
1. `20261111021213_part2_daily_funnel.sql` (Preview 적용됨)
2. `20261119030000_part2_p1_public_previews.sql` (Preview 미적용)

## 운영자 결정·행동 필요
1. P0-2: Android·iPhone에서 Threads·인스타 앱으로 Preview 링크 → Google 로그인 결과 알려 주기.
2. P1: 비로그인 가린 이름 공개 방침 문구 검토(운영 배포 전 필수) + 시행일.
3. P2: 복구 이메일 생략 방식(A/B), One Tap 여부.
4. P3: 근황 태그 표·소환장 표·잠금 게이지 범위 승인.
5. 승인: push + Preview에 P1 migration 적용 + preview 배포.
6. P4: Vercel에서 apex→www 영구 리디렉션 여부, 배포 후 Search Console 사이트맵 재제출.

`content/approved-claims.md` 반영과 SNS 홍보는 "Part 2 끝났어" 이후(아직 아님).
