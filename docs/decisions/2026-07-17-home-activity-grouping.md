# Home Activity Feed Grouping — Phase 4A 정책 결정

Date: 2026-07-17

## Decision

1. **등록(register) 활동만 묶는다.** trace 활동은 이번 Phase에서도 개별 항목으로 유지하며 등록과 합치지 않는다.
2. **같은 학교(slug) + 같은 졸업연도(graduationYear) + 같은 날짜(createdAt의 UTC 날짜, `YYYY-MM-DD`)인 실제 등록만 하나의 활동으로 묶는다.** `schools.slug`는 `supabase-schema.sql`에서 `UNIQUE` 제약이 걸려 있어 학교를 구분하는 키로 그대로 쓸 수 있다 — 별도로 `schools.id`를 select하지 않는다(조회 필드를 늘리지 않음). 학교가 다르면, 졸업연도가 다르면, 날짜가 다르면 각각 절대 합치지 않는다. 졸업연도가 없는(`null`) 등록은 "같은 학교 + 같은 날짜"만으로 묶는다(§ 지시사항 기준).
3. **각 묶음은 실제 원본 등록 건수를 `count`로 그대로 보존한다.** `count`는 절대 삭제되거나 부풀려지지 않으며, 묶기 전 원본 행 수와 항상 일치한다(`lib/policy/homeFeed.test.ts`의 "count가 실제 원본 건수와 일치" 테스트로 고정).
4. **묶음의 대표 시각(`createdAt`)은 묶음 안에서 가장 최신인 원본 `created_at`이다.** 입력 순서와 무관하게 항상 최댓값을 선택한다.
5. **문구는 `count`에 따라 단수/복수로 갈린다.** `formatRegisterActivityText(schoolName, graduationYear, count = 1)`:
   - `count === 1`(기본값) → 기존 단수 문구 그대로 유지: `"누군가 {학교} {졸업연도}년 졸업에 이름을 남겼어요."` / `"누군가 {학교}에 이름을 남겼어요."`
   - `count >= 2` → `"{학교} {졸업연도}년 졸업에 이름 {count}개가 새로 남겨졌어요."` / `"{학교}에 이름 {count}개가 새로 남겨졌어요."`
   - 두 문구 모두 개인 이름/닉네임/Instagram ID를 포함하지 않는다(입력 자체로 받지 않음 — 기존 원칙 유지).
6. **등록 활동 DB 조회 limit만 24로 늘린다(`HOME_REGISTER_FETCH_LIMIT`).** 묶기 전 원본 16건만 조회하면 같은 학교/졸업연도/날짜 등록이 여러 건 겹칠 때 화면에 남는 활동 수가 지나치게 줄어들 수 있어, 여전히 "제한 조회"를 유지한 채(전체 `profiles` 조회 아님, N+1 없음, join 구조 무수정) 여유를 24~32 범위 안에서 확보했다. trace 조회 limit(`HOME_TRACE_FETCH_LIMIT`)은 묶지 않으므로 기존 16을 그대로 유지한다.
7. **화면에 최종적으로 보여주는 활동 수는 묶은 뒤에도 최대 16개(`HOME_ACTIVITY_FEED_LIMIT`)를 유지한다.** `buildHomeActivityFeed`가 등록 묶음(register)과 trace를 합쳐 대표 `createdAt` 내림차순으로 정렬한 뒤 이 limit으로 자른다 — limit 적용은 묶기 이후의 최종 배열에 이루어진다(묶기 전 원본 행에 적용하지 않음).
8. **CTA 배치 기준은 묶은 뒤 최종 활동 개수를 그대로 쓴다.** 기존 `getFeedCtaVisibility(itemCount)`(검색 CTA: 4개 이상, 등록 CTA: 8개 이상)는 이미 `buildHomeActivityFeed`가 반환한 최종 배열의 길이를 인자로 받고 있어(app/page.tsx), 별도 수정 없이 묶은 뒤 개수 기준으로 자연스럽게 동작한다.
9. **개인 식별 필드는 이번에도 조회하지 않는다.** `lib/api/homeFeed.ts`의 두 조회 함수는 여전히 `nickname`/`instagram_id`를 select하지 않으며, 묶기 로직도 학교명·졸업연도·날짜·건수만 다룬다.

## Reason

- 같은 학교에 짧은 시간 안에 여러 명이 등록하면(예: 반 전체가 동시에 이름을 남기는 경우), 묶지 않은 피드는 "누군가 OO고 2022년 졸업에 이름을 남겼어요."가 연속으로 반복 노출되어 가독성이 떨어진다. 실제 데이터를 삭제하거나 위조하지 않으면서 반복을 줄이려면, 표시 단위를 원본 행이 아니라 "같은 맥락(학교+졸업연도+날짜)의 묶음"으로 바꾸는 것이 유일한 실제 데이터 기반 해법이다.
- 학교/졸업연도/날짜 중 하나라도 다르면 절대 합치지 않는 이유: 서로 다른 학교·졸업연도·날짜의 활동을 하나로 합치면 "실제 발생 시점/맥락이 다른 활동을 하나처럼 보이게" 만들어 사실 왜곡이 된다(§ "같은 날짜/시간 구간이 아니면 합치지 않는다" 지시 원칙과 동일).
- trace를 묶지 않는 이유: trace는 `message`가 각기 다른 자유 텍스트라 하나로 합치면 어떤 메시지를 대표로 보여줄지 판단할 근거가 없고, 묶으면 여러 사람의 서로 다른 흔적을 하나의 항목처럼 보이게 해 정보 손실이 생긴다. 등록은 문구가 정형화(이름 개수)돼 있어 묶어도 의미가 보존되지만 trace는 그렇지 않다.
- 등록 조회 limit을 24로 늘린 이유: 묶기는 원본 조회 이후에 일어나므로, 원본 조회 limit이 너무 작으면(16) 묶고 난 뒤 실제 화면에 남는 활동 수가 CTA 노출 기준(4개/8개)에도 못 미칠 수 있다. DB 무제한 조회는 금지 원칙이라, 여전히 고정 limit을 쓰되 여유를 확보하는 선에서만 조정했다(24 ~ 32 허용 범위 중 24 선택 — 과도한 초과 조회를 피하면서 묶기로 인한 손실을 상쇄).

## Impact

- `types/homeFeed.ts`: `HomeActivityItem`에 `count: number` 필드 추가(그 외 필드는 기존 유지 — `type`이 이미 register/trace 구분자 역할을 하고 있어 별도 `activityKind` 필드를 추가하지 않았고, `slug`가 이미 학교 링크 키로 쓰이고 있어 `schoolSlug`로 리네임하지 않았다. `graduationYear`는 이미 `text`에 반영되어 있어 화면이 별도로 필요로 하지 않아 추가하지 않았다).
- `lib/policy/homeFeed.ts`: `formatRegisterActivityText`에 `count` 3번째 인자(기본값 1) 추가, 신규 내부 함수 `groupRegisterActivity`/`registerActivityDateKey` 추가, `buildHomeActivityFeed`가 등록 행을 묶은 뒤 trace와 병합·정렬하도록 변경.
- `lib/api/homeFeed.ts`: `HOME_ACTIVITY_FETCH_LIMIT`(16, 등록/흔적 공용)를 `HOME_REGISTER_FETCH_LIMIT`(24)/`HOME_TRACE_FETCH_LIMIT`(16, 기존과 동일)/`HOME_ACTIVITY_FEED_LIMIT`(16, 화면 최종 노출 상한)로 분리.
- `app/page.tsx`: `HOME_ACTIVITY_FETCH_LIMIT` → `HOME_ACTIVITY_FEED_LIMIT` import/사용처만 교체(레이아웃·CTA 배치 로직은 무수정 — 이미 `buildHomeActivityFeed`의 최종 반환 길이를 쓰고 있었음).
- School Hub, Level 정책, 등록 API, DB/RPC/migration, Admin은 이번에도 무수정.

## 남은 blocker

- 없음. 이번 Phase는 기존에 이미 조회된 register/trace 데이터만으로 순수 로직(그룹핑·정렬·limit)만 추가했다.

## Status

APPROVED
