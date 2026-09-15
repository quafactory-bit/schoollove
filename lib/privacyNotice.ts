/** Public explanatory copy only. This revision does not re-label historical consent records. */
export const PRIVACY_NOTICE_REVISION = '2026-09-16'

export const PRIVATE_PROFILE_COLLECTION = [
  {
    title: '내 프로필 · 필수',
    items: '본인이 입력한 이름(표시명), 계정과 프로필을 연결하는 식별정보',
    purpose: '본인 전용 프로필 생성·관리와 이용자 구분',
    retention: '프로필 삭제 또는 계정 탈퇴에 따른 개인 데이터 삭제 시까지',
  },
  {
    title: '학교 이력 · 해당 기능 이용 시 필수',
    items: '학교, 졸업연도, 계정과 학교 이력을 연결하는 식별정보',
    purpose: '본인이 다닌 학교 이력 저장·관리',
    retention: '해당 학교 이력 삭제, 프로필 삭제 또는 계정 탈퇴에 따른 개인 데이터 삭제 시까지',
  },
  {
    title: '성인 확인·동의 기록 · 필수',
    items: '만 19세 이상 확인 결과·확인 시각·확인 방식, 동의 항목·동의 시각·정책 버전, 계정 식별정보',
    purpose: '성인 이용 조건 확인, 동의 사실 관리 및 계정 이용 자격 확인',
    retention: '계정 탈퇴에 따른 개인 데이터 삭제 시까지. 생년월일 원본은 만 나이 판정에만 사용하고 저장하지 않습니다.',
  },
] as const

export const OPTIONAL_PROFILE_COLLECTION = [
  {
    title: '소개 · 선택',
    items: '본인이 입력한 소개',
    purpose: '본인 전용 프로필 관리',
    retention: '소개 삭제, 프로필 삭제 또는 계정 탈퇴에 따른 개인 데이터 삭제 시까지',
  },
  {
    title: '학년·반 · 선택',
    items: '본인이 입력한 학년·반',
    purpose: '본인의 학교 이력 상세 기록. 별도 승인된 사람 찾기 기능에서는 본인이 저장한 이력에 맞는 조건 선택',
    retention: '해당 학년·반 또는 학교 이력 삭제, 프로필 삭제 또는 계정 탈퇴에 따른 개인 데이터 삭제 시까지',
  },
  {
    title: '인스타그램주소 · 선택',
    items: '본인이 입력한 인스타그램 아이디',
    purpose: '본인 계정 관리 및 기능 권한과 연결 상대별 별도 승인에 따른 주소 공유',
    retention: '주소 삭제, 프로필 삭제 또는 계정 탈퇴에 따른 개인 데이터 삭제 시까지. 상대별 공개 승인을 취소하면 그 상대에게 더 이상 표시하지 않습니다.',
  },
] as const

export const COLLECTION_REFUSAL = '개인정보 수집·이용 동의를 거부할 수 있습니다. 필수 정보 수집·이용에 동의하지 않으면 비공개 프로필과 학교 이력을 등록할 수 없습니다. 공개 학교 기본 정보는 동의 없이 조회할 수 있습니다.'
export const OPTIONAL_COLLECTION_REFUSAL = '소개·학년·반·인스타그램주소는 입력하지 않아도 계정과 기본 프로필을 이용할 수 있습니다. 선택 정보는 입력·저장한 항목만 처리하며, 내 계정에서 지울 수 있습니다.'
export const COLLECTION_SCOPE_NOTICE = '이 동의는 공개 명단 게시나 인스타그램주소의 공개 동의가 아닙니다. 사람 찾기는 별도 초대·운영자 승인이 필요하고, 인스타그램주소는 연결 상대별로 별도 승인해야 표시됩니다.'
