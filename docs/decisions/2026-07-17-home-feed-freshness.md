# Home Feed Freshness — Phase 4B 정책 결정

Date: 2026-07-17

## Decision

1. **홈(`app/page.tsx`)은 실제 활동이 이어지는 성장 피드이므로 빌드 시점 데이터로 영구 고정될 수 없다.** 지금까지 `app/page.tsx`는 `revalidate`/`dynamic` route segment config가 전혀 없어 Next.js가 동적 API(`cookies`/`headers`/`searchParams` 등)를 전혀 쓰지 않는 이 페이지를 완전 정적(SSG)으로 판단했고, 빌드 시점에 딱 한 번 렌더링된 뒤 배포가 다시 일어나기 전까지 절대 다시 렌더링되지 않았다(`npm run build` 결과의 `○ / prerendered as static content`가 이를 그대로 보여준다). `lib/api/homeFeed.ts`/`lib/api/schools.ts`의 Supabase 조회(`supabase-js` 내부 `fetch` 기반)는 그 자체로는 재검증 주기를 갖지 않았고, 이 조회들을 감싼 Server Component 전체가 정적으로 고정되어 있었기 때문에 새 profile/trace가 등록되거나 오늘 성장/주간 순위 RPC 결과가 바뀌어도 홈 화면에는 절대 반영되지 않았다(새 배포가 있을 때만 반영).
2. **`app/page.tsx`에 `export const revalidate = 60`(ISR, 60초)을 추가한다.** 매 요청마다 무조건 DB를 조회하는 `force-dynamic`은 선택하지 않는다 — 홈은 로그인/개인화가 없는 완전 공개 페이지라 요청마다 다른 결과를 낼 이유가 없고, `force-dynamic`은 트래픽에 비례해 Supabase 요청 수와 응답 지연을 늘리는 근거 없는 비용이다. 반대로 60초 ISR은 배포 없이도 짧은 주기로 최신 활동을 반영하면서 캐시 히트 시 조회 비용이 들지 않는다. 60초라는 구체적 주기는 "새 배포 없이 최신 데이터로 갱신"이라는 요구를 만족하는 가장 보수적인(가장 자주 재검증하지 않는) 값 중 사용자 체감 지연이 1분 이내로 충분히 짧다고 판단한 값이며, §3의 즉시 재검증과 결합되면 실제로는 등록 성공 시 이 60초를 기다리지 않고 즉시 반영된다(ISR 주기는 "최소한의 보장 상한선" 역할만 한다).
3. **성공한 profile/trace 등록 직후에만 홈을 즉시 재검증한다.** `app/api/profiles/route.ts`, `app/api/traces/route.ts`가 각각 DB insert 성공을 확인한 뒤(profile은 기존 Level sync 처리까지 끝난 뒤), 최종 성공 응답(`201`)을 반환하기 직전에 `revalidateHomeFeed()`를 호출한다. profile insert 실패(중복 `23505` 포함)·validation 실패·rate limit 차단·trace dedupe 거절·insert 실패 등 실패한 쓰기에서는 이 함수를 아예 호출하지 않는다(호출 자체가 코드 경로상 존재하지 않음 — 성공 응답 직전 한 지점에서만 호출).
4. **재검증 실패가 이미 성공한 등록 자체를 실패로 바꾸지 않는다.** `revalidateHomeFeed()`(`lib/api/homeFeedCache.ts`)는 내부에서 `revalidatePath('/')` 호출을 `try/catch`로 감싸 어떤 예외도 호출자에게 전파하지 않는다. 오류가 나면 `console.error`로 서버 로그에만 남기고 함수는 정상 종료한다 — 두 API route는 이 함수를 호출 결과와 무관하게 그대로 `201` 응답을 반환한다(재검증 실패가 사용자에게 노출되지 않는다).
5. **helper는 `revalidatePath('/')` 호출 하나만 담당하는 최소 함수로 유지한다.** `lib/api/homeFeedCache.ts::revalidateHomeFeed()`는 환경변수나 사용자 데이터를 로그에 남기지 않고, `'/'` 외 다른 경로를 재검증하지 않으며, 범용 캐시 무효화 시스템이나 새 라이브러리를 도입하지 않는다. 테스트(`lib/api/homeFeedCache.test.ts`)는 `next/cache`의 `revalidatePath`를 mock해 호출 인자(`'/'`)와 예외 흡수 동작을 검증한다 — 기존 Vitest mock 구조(`vi.hoisted` + `vi.mock`)를 그대로 재사용했고 새 테스트 도구는 설치하지 않았다.
6. **오늘 성장/주간 순위 RPC(`school_growth_ranking_v1`) 결과도 같은 재검증 계약을 그대로 따른다.** `getTodayFastestGrowingSchool`/`getWeeklySchoolGrowthRankingWithStatus`는 매번 `app/page.tsx` 렌더링 시점에 RPC를 호출하는 순수 조회 함수라 RPC 자체를 수정하지 않았다 — `app/page.tsx`가 60초 ISR + profile 등록 성공 후 즉시 재검증 대상이므로, 이 페이지가 다시 렌더링될 때마다 두 RPC도 함께 다시 호출되어 최신 값을 반영한다(RPC 결과만 별도로 캐시되거나 뒤처지지 않는다 — 페이지 재검증이 곧 이 RPC들의 재검증이다).

## Reason

- "홈은 실제 활동 피드이므로 영구 정적 데이터가 될 수 없다"는 요구가 최우선 제약이었고, 실제 코드 감사 결과(위 §1) 현재 상태가 정확히 그 금지된 상태(빌드 시점 영구 고정)였음을 확인했다 — 추측이 아니라 `revalidate`/`dynamic` export가 파일에 전혀 없다는 사실과 `npm run build`의 `○` 표시로 근거를 확보했다.
- A(짧은 ISR)와 B(성공 쓰기 후 즉시 재검증)를 함께 적용하면 "새 배포 없이 최신 데이터 반영"이라는 목표를 DB 비용 증가 없이 달성할 수 있어, C(`force-dynamic`)로 넘어갈 필요 자체가 없었다. 지시사항이 명시한 대로 "DB 비용과 응답 속도 근거 없이" `force-dynamic`을 선택하지 않았다.
- "성공한 쓰기만 재검증"은 실패 응답(400/409/429/500)에서 홈을 재검증하면 실패한 요청이 캐시 무효화라는 부수효과를 일으켜 재검증 비용만 소모하고 실제로 반영할 새 데이터가 없는 낭비가 되기 때문이다. insert 성공 여부로 호출 지점을 명확히 나눴다.
- "재검증 실패가 등록 실패로 이어지면 안 된다"는 요구는, 재검증은 사용자 경험을 개선하는 부가 동작이지 등록 자체의 정합성 조건이 아니기 때문이다. 이미 DB에 반영된 등록을 캐시 재검증 오류 때문에 사용자에게 실패로 보여주는 것은 실제로 성공한 일을 실패로 위장하는 것과 같아 금지 원칙에 어긋난다.

## Impact

- 신규 파일: `lib/api/homeFeedCache.ts`(+test), `app/page.test.ts`, `app/api/traces/route.test.ts`(신규 — 기존에 없었음).
- 수정 파일: `app/page.tsx`(`export const revalidate = 60` 추가, 레이아웃/문구/활동 묶음 로직 무수정), `app/api/profiles/route.ts`(`revalidateHomeFeed()` 호출 추가, 그 외 로직 무수정), `app/api/traces/route.ts`(`revalidateHomeFeed()` 호출 추가, 그 외 로직 무수정), `app/api/profiles/route.test.ts`(재검증 계약 테스트 추가, 기존 테스트 무수정).
- DB/migration/RPC/School Hub/Admin/Level 정책/Upstash 방문자 카운트/rate limit fail-closed 정책은 이번에도 무수정이다.

## 남은 blocker

- 없음. Next.js 15 App Router의 `revalidatePath`/route segment `revalidate`는 이미 안정 API라 추가 인프라 작업이 필요하지 않다.

## Status

APPROVED
