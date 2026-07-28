# Adult-only Privacy Safety Boundary

Date: 2026-07-28
Status: **APPROVED / PHASE 10A PRODUCTION VERIFIED**

## 문제

기존 공개 구조는 이름·학교·졸업연도·학년·반·Instagram을 한 화면에서 결합할 수 있었고, 초등학교·중학교 및 미래 졸업연도가 성장 피드와 공개 명단에 포함될 수 있었다. 인증, 나이 확인, 본인 소유권이 없는 상태에서 제3자·다중 등록까지 허용하면 미성년자와 일반 이용자의 개인정보·안전·평판 위험을 즉시 확대한다.

## 확정 결정

- 공개 명단형 제품을 중단하고 성인 본인 등록·승인 연결형 제품으로 전환한다.
- 신규 개인 등록은 PHASE 10B 완료 전까지 서버에서 항상 차단한다.
- 향후 등록은 만 19세 이상 이용자의 본인 정보만 허용한다.
- 개인 정보는 기본 비공개이며 상대방 승인 전에는 Instagram을 공개하지 않는다.
- 공개 사람 명단과 이름 검색은 허용하지 않는다.

## PHASE 10A 범위

- Home의 profile 기반 피드·랭킹·등록 유도 제거
- School은 학교 기본 정보만 공개
- Year/Class는 개인 행을 조회하지 않는 비공개 안내로 전환
- Search는 학교 기본 정보만 조회
- Submit과 Invite의 개인 등록 유도 중단
- `POST /api/profiles`를 CAPTCHA, rate limit, DB 접근보다 먼저 503으로 거부
- 개인 관련 경로의 noindex/nofollow/noarchive와 sitemap 제거
- 현재 동작에 맞는 Privacy/Terms 고지
- 공개 DB 역할의 profile 권한 회수 migration 작성 및 Production 적용·검증

## 공개 가능 정보

- 학교명
- 지역(시도·시군구)
- 신뢰 가능한 학교 유형
- 개인과 결합되지 않은 학교 기본 정보

## 공개 금지 정보

- profile 행과 존재 여부를 대량 열람할 수 있는 응답
- nickname/name
- 개인과 결합된 졸업연도·학년·반
- Instagram ID 또는 링크
- 미래 졸업 기수 활동
- 초등·중학교의 사람 등록 경쟁·성장 랭킹

## 등록 중단 이유

현재 서비스에는 일반 사용자 인증, 만 19세 이상 확인, 본인 프로필 소유권과 상대방 승인 경계가 없다. 따라서 UI를 숨기는 것만으로는 충분하지 않으며, API가 항상 fail-closed 상태여야 한다. `PUBLIC_PROFILE_REGISTRATION_ENABLED=true` 같은 설정도 PHASE 10A에서는 등록을 다시 열지 못한다.

## SEO 정책

- School 기본 URL은 개인 데이터가 제거된 상태에서만 index를 유지한다.
- search, submit, invite, Year, Class 및 향후 Profile/연결 성격의 경로는 noindex/nofollow/noarchive다.
- sitemap은 Home과 School 기본 URL만 포함한다.
- robots.txt로 민감 경로를 먼저 차단해 meta robots 전달을 방해하지 않는다.

## 비파괴 데이터 원칙

기존 profile 행을 수정하거나 삭제하지 않는다. 관리자 신고·삭제·검토를 위한 service-role 경계는 유지한다. 신규 migration은 `anon`/`authenticated`의 profile 권한과 profile 기반 ranking RPC 실행 권한만 회수한다.

해당 migration은 2026-07-28 사용자 승인 후 Production 프로젝트 `ucnybhzpbatzcipwqtox`에 적용했다. `profiles`의 RLS 활성화, 공개 정책 0개, `anon`/`authenticated`의 테이블·컬럼 권한 없음, profile 기반 ranking RPC 실행 권한 없음, `service_role`의 기존 테이블 권한 유지를 개인정보 원문 조회 없이 재검증했다. 애플리케이션 배포와 공개 경로 검증이 끝나기 전에는 PHASE 10A 전체를 `PRODUCTION_VERIFIED`로 판정하지 않는다.

## 운영 복구 절차

Migration 자체는 데이터 행을 변경하지 않으므로 데이터 rollback은 필요하지 않다. 배포 후 관리자 운영 경계에 문제가 생기면 먼저 service-role 설정과 서버 전용 관리자 경계를 점검한다. 공개 권한을 복구하는 것은 개인정보 노출을 다시 여는 조치이므로 장애 복구 목적이라도 최후 수단으로만 사용한다.

긴급하게 이전 공개 읽기 계약으로 되돌려야 한다면 Production 대상과 영향 범위를 다시 확인한 뒤 별도 승인 하에 트랜잭션으로 `profiles_read` 정책(`is_hidden = false`), `anon`/`authenticated` SELECT와 `school_growth_ranking_v1` EXECUTE를 복구한다. INSERT/UPDATE/DELETE는 복구하지 않는다. 복구 직후 공개 REST와 웹 노출을 재감사하고 사고 기록을 남긴다.

## PHASE 10B 시작점

1. Supabase Auth 도입과 서버 세션 검증
2. 만 19세 이상 자격 검증 및 증빙 최소화 정책
3. `profiles`와 인증 사용자 간 본인 소유권 모델
4. 본인 정보만 생성·수정·삭제 가능한 RLS와 API
5. 승인 전 개인 정보·Instagram 비공개, 상호 승인 후 최소 공개
6. 기존 데이터의 소유권 주장·삭제·비공개 전환 절차
7. 개인정보·약관 전문 법률 검토 및 운영자 필수 정보 확정
