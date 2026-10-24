# 운영 DB 적용 결과 — 2026-10-25 02:50 KST

- 대상: Supabase 운영 `schoollovei`(`ucnybhzpbatzcipwqtox`). 운영자 지시("실행해줘")로 에이전트가 SQL Editor에서 `02-apply.sql` 전체를 한 번 실행.
- Supabase "Potential issue detected"(파괴적 문장 경고) 확인 창이 떴음 — 탈퇴 함수 본문의 `DELETE FROM push_subscriptions`와 `REVOKE` 때문. 저장소 migration 그대로이므로 **Run query**로 진행.
- 결과: **Success. No rows returned** (한 트랜잭션, 안전장치 통과, COMMIT).

## 적용 직후 확인(읽기 전용)
| 항목 | 결과 |
| --- | --- |
| `schema_migrations` 4건 기록 | 4 |
| `push_subscriptions` 표 / RLS 켜짐 | true / true |
| 표 권한: anon · authenticated / service_role | false · false / true |
| 탈퇴 함수가 푸시 구독을 지움 | true |
| 졸업연도 규칙: 고 2025 허용, 고 2026 거부, 중 2023 거부 | true |
| 학교 등록 함수에 재학생 검사 포함 | true |
| 방문자(anon): 연도별 수 실행 가능 / 학교 등록 함수 실행 불가 | true / false |
| 검색 래퍼에 `SELECT *` 없음 | true |
| 이력 최신 4건 | 20261023100000, 20261022130000, 20261022120000, 20261014101616 |

- 운영 DB 상태는 Preview DB(2026-10-23 적용)와 같아졌다.
