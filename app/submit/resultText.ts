// app/submit/page.tsx 등록 결과 화면의 제목/본문 노출 여부를 판단하는 순수 함수.
// UI 테스트 인프라가 없어 이 판단 로직만 분리해 독립적으로 테스트한다.
export type SubmitResultCounts = {
  success: number
  dup: number
  fail: number
}

// 성공 0명 + 실패 1명 이상 = 전체 실패. 이때는 "완료" 문구를 쓰지 않는다.
export function isAllFailed(counts: SubmitResultCounts): boolean {
  return counts.success === 0 && counts.fail > 0
}

export function resultHeading(selfMode: boolean, counts: SubmitResultCounts): string {
  if (isAllFailed(counts)) {
    return selfMode ? '연결하지 못했어요' : '등록하지 못했어요'
  }
  return selfMode ? '연결 완료!' : '등록 완료!'
}
