# 작업지시서 — 가입 경로(유입 채널) 측정

작성 2026-10-14 · 대상: 개발 에이전트(GPT·Codex·Claude Code) · 운영자 승인 후 배포
저장소 루트 `AGENTS.md`의 규칙(Git, 환경변수, 원격 변경 승인, 최종 보고 형식)을 그대로 따른다.

## 1. 왜 하는가
- 스쿨러브아이 SNS(Threads·Instagram)를 10/19부터 하루 7개씩 운영한다. 그런데 지금은 **가입이 어느 채널에서 왔는지 알 수 없다.**
- `components/PrivacySafeAnalytics.tsx`가 URL 쿼리를 모두 지워서 Vercel Analytics에서 UTM으로 채널을 나눌 수 없다.
- 그리고 Vercel Web Analytics의 UTM 화면은 **Pro + Web Analytics Plus 또는 Enterprise 요금제에서만** 보인다(Vercel 2024-02-14 공지). 쿼리를 살려도 지금 요금제에서는 안 보일 수 있다.
- 그래서 핵심은 B다: **가입이 완료되는 순간, 그 사람이 처음 들어온 채널을 익명 통계로 한 줄 남긴다.** A는 요금제를 올렸을 때를 위한 보조 작업이다.

## 2. 먼저 읽을 것
- `components/PrivacySafeAnalytics.tsx` — 지금 쿼리를 지우는 방식(`beforeSend` 등)
- 가입 완료 처리 위치 — Google 로그인 콜백, 처음 가입한 사용자의 프로필(또는 학교 등록) 행을 만드는 서버 코드
- `supabase/` — 마이그레이션 방식과 RLS 규칙
- `docs/decisions/` — 개인정보 관련 결정 문서, 개인정보처리방침 페이지 위치

## 3. 작업 A — Vercel Analytics에 UTM만 남기기 (보조)
- `PrivacySafeAnalytics.tsx`에서 URL을 정리할 때 **`utm_source`, `utm_medium`, `utm_campaign`, `utm_content` 네 개만 남기고** 나머지 쿼리는 지금처럼 지운다.
- 남기는 값은 `^[a-z0-9_-]{1,40}$`에 맞을 때만 남긴다. 맞지 않으면 그 항목을 지운다.
- 경로 안의 개인정보 가리기 등 지금 하고 있는 다른 처리는 바꾸지 않는다.

## 4. 작업 B — 가입 순간에 유입 채널 기록 (핵심)

### 4-1. 처음 들어온 채널 저장 (브라우저)
- 사이트에 처음 들어왔을 때 아래 값을 `localStorage`의 `sl_first_touch`에 저장한다. 읽기·쓰기는 모두 try/catch로 감싸고, 실패해도 사이트 동작에는 영향이 없어야 한다.
  - `source`, `medium`, `campaign`, `content`: URL의 utm 값 (3절과 같은 형식 검사)
  - utm이 없으면 `document.referrer`의 **도메인만** 보고 `source`를 정한다: threads.net·threads.com → `threads`, instagram.com·l.instagram.com → `instagram`, google·naver·daum 검색 → `search`, 같은 사이트·빈 값 → `direct`, 그 밖 → `other`. `medium`은 `referral`.
  - `landing_path`: 처음 들어온 페이지 경로. **쿼리와 해시는 빼고** 경로만.
  - `ts`: 저장 시각
- 이미 저장된 값이 있고 7일이 지나지 않았으면 덮어쓰지 않는다(첫 접촉 기준). 7일이 지났으면 새로 저장한다.

### 4-2. 가입 완료 때 한 줄 기록 (서버)
- **처음 가입한 사용자**의 프로필을 만드는 바로 그 서버 코드에서, 브라우저가 보낸 `sl_first_touch` 값을 받아 새 테이블 `signup_attribution`에 한 줄 넣는다. 기존 사용자의 재로그인에서는 넣지 않는다.
- 서버에서도 형식을 다시 검사한다. 값이 없거나 형식이 틀리면 `source = 'unknown'`.
- 넣은 뒤 브라우저의 `sl_first_touch`를 지운다.

### 4-3. 테이블 (`supabase/migrations/`에 새 파일)
| 열 | 형식 | 비고 |
|---|---|---|
| `id` | bigint, identity | |
| `created_on` | date | 가입한 **날짜만** (시각은 저장하지 않는다) |
| `source` | text | not null, 기본 `unknown` |
| `medium` | text | null 가능 |
| `campaign` | text | null 가능 |
| `content` | text | null 가능 |
| `landing_path` | text | null 가능, 경로만 |

- **넣지 않는 것:** `user_id`, 이메일, 이름, 학교, IP, User-Agent, 전체 referrer URL. 이 테이블은 누구의 가입인지 알 수 없는 익명 통계여야 한다.
- RLS를 켜고, anon·authenticated 역할은 읽기·쓰기 모두 막는다. 쓰기는 서버(service role)에서만 한다.
- 각 text 열에는 길이 40(`landing_path`는 120) 제한 check 제약을 둔다.

### 4-4. 보는 방법
마이그레이션 파일 아래에 주석으로, 또는 `docs/`에 아래 SQL을 남긴다.
```sql
-- 주별 · 채널별 가입 수
select date_trunc('week', created_on)::date as week, source, medium, campaign, count(*)
from signup_attribution
group by 1, 2, 3, 4
order by 1 desc, 5 desc;
```

## 5. 개인정보처리방침 확인
- 이 기록은 개인을 알아볼 수 없는 통계라서 보통은 방침을 고칠 필요가 없다.
- 그래도 방침에 "자동으로 수집하는 정보"를 나열하는 항목이 있으면 이 기록이 그 범위에 들어가는지 확인하고, 고칠 필요가 있으면 **고치지 말고 문구 제안만** 보고에 적는다.

## 6. 하지 말 것
- 외부 추적 도구(구글 애널리틱스, 메타 픽셀 등)를 새로 넣지 않는다.
- 위 테이블을 사용자 계정과 연결하지 않는다.
- `.env` 값을 출력하거나 커밋하지 않는다. 키가 새로 필요하면 이름만 알려 준다.
- 운영자 승인 전에 배포하지 않는다.

## 7. 확인 방법
1. 형식 검사·채널 판정 함수 단위 테스트: 정상 utm, 이상한 값(공백·한글·긴 값), referrer별 판정, 7일 규칙.
2. 로컬에서 `/?utm_source=threads&utm_medium=post_body&utm_campaign=devlog&utm_content=1020-08` 접속 → `localStorage`의 `sl_first_touch` 확인 → 테스트 계정으로 새로 가입 → `signup_attribution`에 한 줄 생겼는지, `user_id` 등 개인 정보가 없는지 확인.
3. 같은 계정으로 다시 로그인했을 때 줄이 늘지 않는지 확인.
4. Vercel Analytics로 가는 URL에 utm 네 개 말고 다른 쿼리가 남지 않는지 확인.

## 8. 완료 보고
- 바뀐 파일, 마이그레이션 파일 이름, 테스트 결과, 배포에 필요한 운영자 행동(마이그레이션 적용 등)
- 개인정보처리방침 확인 결과
- 마지막 줄에 "SNS 일지용 한 줄": 한 일 | 막힌 것이나 고민한 것 | 결정한 것 (보안 구조 세부·키 제외, 비개발자가 읽어도 이해되는 말로)
