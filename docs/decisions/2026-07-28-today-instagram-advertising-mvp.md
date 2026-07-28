# PHASE 10D — 오늘의 Instagram 광고·수익화 MVP

- 상태: **APPROVED / LOCAL IMPLEMENTATION**
- 승인일: 2026-07-28
- Production 적용: **금지 (Draft PR까지만)**

## 제품 분리

`오늘의 발견`은 경제적 대가 없이 운영자가 선정하는 무료 편집 추천이다. `오늘의 스폰서`는 신청, Instagram 소유 확인, 운영자 검수, 수동 결제 확인, KST 일정 예약을 모두 통과한 유료 광고이며 모든 카드에 `광고` 또는 `유료 프로모션`을 표시한다. 두 타입은 DB row, 상태, 공개 label과 관리자 action에서 분리한다.

개인 연결의 `connection_instagram_permissions`와 광고 계정 `promotion_accounts`는 어떤 FK나 승인 상태도 공유하지 않는다. 연결 상대에게 Instagram을 공개한 사실은 광고 신청·추천·타기팅에 사용하지 않는다.

## 신청과 검수

- 신청자는 로그인, 현재 만 19세 이상 자격, 필수 동의와 본인 private profile을 갖춘 사용자만 허용한다.
- 개인 광고는 본인 Instagram과 본인 활동만 허용한다. 사업자는 최소 사업자 검수 정보와 담당자 정보를 별도 private row로 제출한다.
- Instagram 소유 확인은 임시 코드의 SHA-256 hash, 만료 시각, 단일 사용과 운영자 수동 확인으로 처리한다. 비밀번호, 세션 쿠키, 비공식 로그인·scraping은 사용하지 않는다.
- pending review 이후 creative는 신청자가 변경할 수 없다. 운영자 승인, 가격, 결제 확인, placement 예약, pause/resume/cancel/refund는 service-role 관리자 RPC와 audit row를 한 트랜잭션으로 처리한다.
- 자동 PG, 카드 결제와 자동 광고 승인은 이번 범위가 아니다.

## 안전과 타기팅

- 미성년자·재학생 개인 광고, 특정 사람 찾기, 타인 계정, 사칭, 학교 공식 추천 오인, 연락처·현재 위치·신상 공개, 불법·도박·성인·사기·고위험 투자 문구를 거부한다.
- 타기팅은 `homepage_today`, `school_page`, `region_page`, `content_feed`의 페이지 문맥만 사용한다. 개인 profile, 검색, 연결, 메시지 행동을 사용하지 않는다.
- 학교 졸업생 표시는 별도 membership 검수 결과가 있을 때만 허용한다. 인근 사업자는 `지역 광고`로 표시한다.
- 외부 Instagram·landing URL은 HTTPS와 허용 host/문법을 검증하고 click redirect는 DB의 승인된 URL만 사용한다.

## 자산과 측정

MVP는 공개 storage bucket을 만들지 않는다. HTTPS 이미지 URL을 제출하고 운영자가 저작권·초상권·안전성을 검수한 뒤 승인된 asset만 `referrerPolicy=no-referrer`로 렌더링한다.

노출·클릭 이벤트는 사용자 ID, 이메일, raw IP를 저장하지 않는다. 서버가 날짜별 SHA-256 session hash를 만들고 동일 placement/day 중복을 제한한다. 광고주에게는 일별·placement별 합계, privacy-safe 고유 노출 근사와 CTR만 반환하고 raw event row는 반환하지 않는다. bot과 관리자 view는 집계하지 않으며 event hash retention은 32일이다.

## 결제와 후속 범위

MVP 결제는 외부 결제 안내 또는 계좌이체 후 운영자 수동 확인이다. 금액, KRW, 방식, 확인 시각, 관리자, 내부 reference와 환불 상태만 저장하고 계좌·카드·민감 금융정보는 저장하지 않는다.

PHASE 10E에는 토스페이먼츠/PG 카드 결제, 자동 영수증·세금계산서·환불, 쿠폰·구독·반복 캠페인, 광고주 self-serve 자동 예약과 Meta 공식 API 연동을 남긴다.

## 배포 경계

PHASE 10D는 로컬·격리 DB·Vercel Preview 검증, commit, push, Draft PR까지만 진행한다. migration Production 적용, PR merge, Production 배포와 실제 결제 청구는 별도 승인 전까지 금지한다.
