# 운영 DB 사전 조회 결과 — 2026-10-24 19:04 KST

- 대상: Supabase 운영 `schoollovei`(`ucnybhzpbatzcipwqtox`), SQL Editor에서 `01-precheck.sql` 실행(읽기 전용). 운영자 요청으로 에이전트가 브라우저에서 실행.
- 판정: **적용 가능** — 아래 전부 기대값과 일치.

| 항목 | 결과 |
| --- | --- |
| prerequisites 14개 | 전부 true |
| new_objects_absent 3개 (`push_subscriptions`, `is_graduation_year_allowed`, `school_year_counts_v2`) | 전부 true(아직 없음) |
| `request_own_account_deletion` | overload 1개, matches_repo true, 본문 = 저장소 `20260803120000` 버전(줄바꿈 CRLF만 다름), md5 `19dd8291…` |
| `add_own_school_membership_with_roster` | matches_repo true, 본문 = 저장소 `20260928090000` 버전, md5 `6f20ae18…` |
| `search_schools_with_activity` | matches_repo true, 반환 9개 컬럼, 본문 = 저장소 `20260803120000` 버전(`SELECT *` 있음), md5 `5f48b424…` |
| migrations.already_recorded | `[]` |
| migrations.latest_8 맨 위 | `20261014101616 signup_attribution_best_effort` (기대와 같음) |

- 참고: 운영 이력의 학교 명단 migration 번호는 `20260928082644`(저장소 파일 `20260928090000`). Preview와 마찬가지로 번호만 다르고 이번 적용과 무관.
- DB에만 손으로 고친 흔적 없음 → `02-apply.sql`의 CREATE OR REPLACE로 사라지는 수정 없음.
