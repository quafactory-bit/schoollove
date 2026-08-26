# PHASE 10T Privacy-safe school share and return loop

Status: Preview Draft decision

## Decision

Google-only 비공개 계정에서 본인의 학교 이력을 확인한 다음 허용되는 첫 cold-start growth loop는 공개 학교 기본정보 페이지 공유다. 공유 대상은 private membership이나 사용자 초대가 아니라 기존 `/school/{slug}` 공개 페이지이며, `/account`의 유효한 내 학교 card에서만 선택적으로 시작한다. 공유하지 않아도 기존 4단계 온보딩과 `비공개 계정 준비 완료` 상태는 완성된다.

공유 payload는 DB relation의 slug로 이미 승인된 `buildSafeMySchoolHref()` 결과, 공개 학교명, 브라우저의 현재 `window.location.origin`만 사용한다. URL은 같은 origin의 정확히 한 `/school/{encoded-segment}` 경로이며 query, fragment, tracking, referral, sender, membership 또는 user 식별자를 포함하지 않는다. 학교명은 공유 문구에만 쓰고 URL authority로 사용하지 않는다.

네이티브 Web Share를 우선 사용하고 미지원 또는 실제 플랫폼 실패에서만 동일한 generic text와 URL을 clipboard에 복사한다. 사용자가 `AbortError`로 공유 시트를 취소하면 clipboard fallback을 실행하지 않는다. 복사 상태는 짧은 접근성 안내일 뿐 localStorage, sessionStorage, cookie 또는 서버에 저장하지 않는다.

## Privacy and growth boundary

- 공유 문구는 `스쿨러브아이에서 {학교명} 학교 정보를 확인해 보세요.`로 제한한다.
- 졸업연도, 반, Instagram, display name, membership/school/user/Auth ID를 payload에 넣지 않는다.
- 공개 학교 페이지는 membership과 무관한 학교명·유형·지역, `PrivacyTransitionNotice`, 일반 `/account` CTA와 기존 승인 promotion만 유지한다.
- invite/referral identity, token, code, tracking parameter와 share analytics를 만들지 않는다.
- 사람 검색·명단·연결·메시지·Instagram 공개는 계속 닫혀 있고 `/people/search`는 인증과 `people_search` beta authority를 모두 요구한다.
- 신규 page/API route, table, column, RPC, migration 또는 telemetry event를 만들지 않는다.

## Return and deletion

재로그인한 owner는 DB에서 다시 읽은 학교 card와 share action을 확인한다. membership 삭제 또는 profile 삭제로 학교 이력이 사라지면 card와 share action도 함께 사라지며 이전 share path를 client persistence에 보관하지 않는다.
