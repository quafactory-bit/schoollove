# 가입 유입 채널 측정

사용자의 2026-10-14 작업지시서에 따라 구현한다. 후속 지시로 방침 문구 반영, commit·push·Draft PR, Preview migration·배포를 승인받았다. Production 적용과 merge는 승인 범위에 포함하지 않는다.

- 가입은 기존 성인 확인·필수 동의를 통과한 최초 비공개 프로필 생성으로 정의한다. Google 재로그인과 프로필 수정·삭제 후 재생성은 추가 집계하지 않는다.
- 기존 eligibility의 최초 프로필 milestone을 잠근 상태에서 기존 owner RPC와 익명 attribution INSERT를 같은 transaction으로 실행한다. 익명 테이블에는 계정 식별자나 시각을 저장하지 않는다.
- 서버 service-role 전용 wrapper는 검증된 세션 ID만 받고 기존 owner RPC의 성인·동의·접근 경계를 그대로 호출한다. 브라우저 역할은 wrapper·통계 테이블에 접근할 수 없다.
- 첫 접촉은 7일간 브라우저에 보관한다. 민감한 동적 경로는 수집하지 않고 안전한 정적 경로 또는 가린 경로만 보관한다. 형식 불량/만료 payload는 unknown으로 집계한다.
- Analytics에는 형식 검사한 UTM 네 개만 남긴다. 인증·성장 API 제외 규칙은 유지한다.
- 개인정보처리방침의 '모든 검색 매개변수 제거'를 네 UTM 코드 허용으로 바꾸고 7일 first-touch 통계를 설명한다. localStorage는 자동 만료 저장소가 아니므로 '7일 이내의 값만 사용, 다음 방문 때 갱신'으로 실제 동작을 명확히 한다. 설명 개정일만 변경하며 역사적 동의 버전은 보존한다.
