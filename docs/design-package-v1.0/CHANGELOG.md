# CHANGELOG

## 2026-09-07

- 기존 내 학교 카드에 optional 학년·반 추가/수정/clear 계약을 추가했다. owner RPC가 기존 school_membership 권한과 DB 학교 유형을 검사하고, 실제 변경에서만 live unused match token을 무효화한다. 학교·졸업연도와 기존 관계는 보존한다.

## 2026-09-03

- Connected Instagram add-on 회원이 public account launch를 열지 않고 기존 비공개 profile의 Instagram handle만 owner-safe 경로로 설정·삭제할 수 있도록 계약을 추가했다. 이름·소개·사진·학교·학년/반은 변경하지 않으며, non-null 저장은 active add-on 권한을 요구하고 null 삭제는 개인정보 제거권으로 유지한다.

## 2026-07-29

- 승인된 PHASE 10F 결정으로 개인 기능을 제한 베타 회원에게만 여는 초대·검수·기능 flag·비상 차단 계약을 추가했다.
- 미래 졸업연도 차단, 일일 운영 maintenance, 정책 기반 보존, 본인 export와 개인 원문 없는 운영 health 경계를 추가했다.
- 이 결정은 PHASE 10A~10E의 성인·본인 소유·기본 비공개·상호 승인 원칙을 완화하지 않는다.

## 2026-07-28

- PHASE 10D 로컬 초안: 무료 ‘오늘의 발견’과 유료 ‘스폰서드’를 분리하고, 만 19세 이상 본인 Instagram 소유 확인, 운영자 수동 검수·결제 확인·KST 슬롯 예약, 공개 광고 표시, privacy-safe 집계와 긴급 신고 중단 경계를 구현했다. Production migration·merge·배포는 별도 승인 전까지 금지한다.

- PHASE 10C-R 감사 보강: hashed opaque token, 양방향 pair 중복 방지, terminal/message/participant DB trigger, 탈퇴 FK 정리, zero-width 연락처 우회 차단, 중복 신고 제한, 격리 PostgreSQL migration·RPC 실행 검증.
- PHASE 10C Production smoke hotfix: 로그인·계정·사람 찾기·연결·알림 private route에 noarchive metadata를 명시적으로 추가.
- PHASE 10C 안전 연결 로컬 구현 승인: 학교·졸업연도·정확한 이름 exact match, opaque match token, 최초 안부 1회, 7일 후 동일 안부 재알림 1회, 수락·거절·아닌 사람·차단·신고, 수락 후 기본 텍스트 대화, 상대별 Instagram 공개 승인.
- 검색·요청·대화 mutation은 IP/account 이중 rate limit과 service-role 전용 원자 RPC를 사용하며 개인 화면은 noindex, 개인 테이블은 RLS/FORCE RLS를 사용한다. PHASE 10C migration·PR은 Draft이며 Production 미적용.
- Today Instagram 광고·결제는 개인 연결별 Instagram 승인과 분리해 PHASE 10D로 유지.
- PHASE 10B 인증·성인 제한·본인 소유권 기반 승인: 이메일 OTP, KST 만 19세 자기진술, append-only 동의, owner-only private profile/RLS/API, `/account` 관리 화면.
- 기존 profile은 자동 claim 없이 quarantined/unclaimed 및 기본 private로 유지하고, 사람 검색·메시지·Instagram 승인 공개는 PHASE 10C로 보류.
- PHASE 10A 개인정보 긴급 안전 전환 승인: 공개 개인 명단·이름 검색·Instagram 연결·신규 개인 등록 중단.
- Home의 profile 기반 성장 피드·랭킹·타인 등록 CTA 중단, 학교 기본 정보 검색과 School 기본 페이지만 유지.
- 민감 경로 noindex/nofollow/noarchive 및 sitemap 개인 경로 제거.
- 다음 제품 경계는 PHASE 10B의 Supabase Auth + 만 19세 이상 + 본인 프로필 소유권 + 승인 전 비공개로 확정.

## 2026-07-11

- Level Policy §8 — null 초기화와 실제 Level Up 구분 정책 보완 (승인됨, docs/decisions/2026-07-11-level-null-initialization-policy.md)

## 2026-07-09

- v1.0 Design Package Frozen
- Product Principles 확정
- User Journey 확정
- DB Schema 확정
- API 확정
- Open Issues 확정
- Claude Code Master Prompt 추가
