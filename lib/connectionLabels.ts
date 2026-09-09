const statuses: Record<string, string> = { pending: '수락 대기', accepted: '수락 완료', declined: '거절됨', not_the_person: '다른 사람으로 확인', blocked: '차단됨', reported: '신고 접수', cancelled: '취소됨', expired: '기간 만료', active: '연결됨', disconnected: '연결 해제됨' }
const relationships: Record<string, string> = { same_class: '같은 반', same_school: '같은 학교', senior_junior: '선후배', club: '동아리', other: '학교 인연' }
export const connectionStatusLabel = (value: string) => statuses[value] ?? '상태 확인 필요'
export const relationshipLabel = (value: string) => relationships[value] ?? '학교 인연'
