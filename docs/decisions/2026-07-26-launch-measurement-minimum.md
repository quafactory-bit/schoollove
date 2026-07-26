# Launch Measurement Minimum

## 결정

30일 콜드스타트 운영 전 측정·보안 최소선은 다음 세 가지로 제한한다.

1. Vercel Web Analytics의 기본 page view만 사용해 익명 방문자, 페이지, referrer를 집계한다. 커스텀 이벤트와 사용자 식별자는 추가하지 않는다.
2. 공개 브라우저의 `profiles` 직접 INSERT 권한과 RLS 정책을 제거하고, 등록 write는 Turnstile·rate limit·서버 검증을 거치는 `/api/profiles`에서만 수행한다. API의 INSERT는 서버 전용 service-role client를 사용한다.
3. Upstash rate limit 자체와 기존 window·prefix·TTL·429 계약은 유지하되 `analytics: true`를 제거해 장기 분석용 데이터를 새로 쌓지 않는다.

## 개인정보 원칙

- Vercel Web Analytics에는 nickname, Instagram ID, message, 검색어 원문을 커스텀 이벤트로 보내지 않는다.
- Home의 익명 원칙과 공개 카드의 기존 노출 범위를 변경하지 않는다.
- IP는 DB나 별도 분석 저장소에 장기 저장하지 않는다. Upstash에는 남용 방지에 필요한 제한 키와 trace 중복 방지 키만 기존 만료 시간 동안 유지한다.
- URL에 개인 식별값을 새로 넣지 않는다. 현재 공개 URL 구조는 학교·연도·반 필터만 사용한다.

## 운영·적용 경계

- `profiles` 권한 변경은 새 migration으로만 기록하며, 운영 DB 적용은 별도 승인 후 수행한다.
- Vercel Dashboard에서 Web Analytics를 활성화하고 해당 코드가 배포된 뒤에만 실제 수집이 시작된다.
- 기존 Upstash analytics 과거 데이터 삭제는 이번 작업에서 수행하지 않는다. 필요 시 Upstash Console에서 보존 상태를 확인하고 별도 승인으로 정리한다.
- GA/GTM/PostHog, 별도 분석 DB·관리자 통계 화면, 검색·클릭·등록 custom event, level history는 이번 최소선에 포함하지 않는다.

## 30일 판단 기준

이번 변경으로 확보하려는 최소 관측치는 일별 방문자·페이지뷰·랜딩 페이지·referrer와 기존 DB에서 집계 가능한 공개 프로필 증가다. 등록 버튼 클릭이나 실패 원인별 퍼널처럼 custom event가 필요한 지표는 30일 실험의 출시 조건으로 삼지 않는다.
