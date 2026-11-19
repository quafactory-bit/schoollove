# 운영 적용 결과 (2026-11-19)
- `02-apply.sql` 전체를 SQL Editor에서 1회 실행. 편집기 내용 = 저장소 파일(16,097자, sha256 앞 16자리 `f62942cf99e4ed23`) 확인 후 실행.
- migration 파일 sha256: `20261111021213` = `b392b2b4…`(Preview와 동일), `20261119030000` = `5d9358b1…`(Preview와 동일).
- 결과(사후 검증 SELECT):
```
{"ledger_rows":2,"funnel_rls_forced":true,"client_can_read_funnel":false,"home_now":{"visible":false},
 "fn_privileges":{"part2_home_attendance":{"anon":true,"auth":true,"service":true},
  "part2_school_roster_flags":{"anon":true,"auth":true,"service":true},
  "part2_year_masked_preview":{"anon":true,"auth":true,"service":true},
  "part2_popular_schools":{"anon":false,"auth":false,"service":true},
  "part2_get_funnel_snapshot":{"anon":false,"auth":false,"service":true},
  "part2_record_funnel_event":{"anon":false,"auth":false,"service":true},
  "part2_add_own_school_membership":{"anon":false,"auth":true,"service":true}}}
```
- 기존 등록 함수 지문은 적용 전·중 동일(트랜잭션 안 검사 통과). 홈 LIVE·TOP 5는 최근 7일 출석 0건이라 설계대로 숨김.
- 편집기는 비우고 스니펫 저장 안 함.
