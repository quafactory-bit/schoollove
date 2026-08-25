# PHASE 10S — Private-account first value: 내 학교

Date: 2026-08-25
Status: Preview Draft decision

## Decision

Google-only 온보딩 이후의 첫 지속 가치는 사용자가 직접 등록한 본인의 과거 학교 이력이 비공개 계정에 연결되어 다시 확인 가능한 상태다. 이 경험의 단일 home은 기존 owner-only `/account`이며 별도 `/my-schools`, 공개 profile 또는 user route를 만들지 않는다.

`/account`의 “내 학교”는 이미 서버에서 읽은 `AccountState.memberships`만 사용한다. 각 membership의 학교명·유형·지역과 본인의 졸업연도·선택 반을 기존 DB 정렬 순서대로 표시한다. 대표 학교, 선호 학교 또는 새 우선순위는 도입하지 않는다. school relation이 없거나 slug가 내부 단일 경로 조각 계약을 만족하지 않으면 URL을 추측하지 않고 링크를 생략한다.

유효한 CTA는 DB relation의 slug로 만든 `/school/{slug}`뿐이다. 졸업연도·반을 URL에 넣지 않으며 기존 Year/Class compatibility route를 사람 탐색이나 first-value 동선으로 사용하지 않는다.

## Public school boundary

공개 `/school/[slug]`는 membership-independent다. 학교 기본 정보, 개인정보 전환 안내, 기존에 별도 승인된 선택 promotion과 익명 방문자에게도 동일한 일반 `/account` 관리 CTA만 제공한다. 로그인 사용자 membership, 비공개 profile, 졸업연도, 반, Instagram, membership 존재 여부 또는 인원 수를 조회하거나 HTML에 노출하지 않는다.

공개 사람 명단·검색, 연결, 메시지와 Instagram 공개는 계속 닫혀 있다. 가짜 학교 활동, 대기 사용자, 동문 수, 성장 수치 또는 비활성 사회 기능 CTA를 만들지 않는다.

## Persistence and measurement

이번 결정은 기존 account read/write 경계만 재사용한다. 새 table, column, RPC, migration, runtime API route, membership write path, local/session storage 또는 telemetry event를 추가하지 않는다. 학교 ID·slug·졸업연도·반·user/profile/membership ID를 분석 이벤트로 보내지 않는다.

Profile 또는 membership 삭제 뒤에는 새로 읽은 `AccountState.memberships`가 비어 “내 학교”의 삭제된 항목이 자연스럽게 사라져야 한다. emergency와 deletion lifecycle의 기존 write 차단 권위는 변경하지 않는다.

## Explicit non-goals

- 사람 발견·공개 명단·Year/Class 개인 카드 활성화
- primary/favorite school
- 학교 인원·활동·성장·랭킹
- Instagram 표시 또는 연동
- 새 schema, API, route 또는 analytics
- Production 배포·DB·Auth/provider 변경
