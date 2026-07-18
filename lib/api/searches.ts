import { supabase } from '@/lib/supabase'

// 학교명에서 검색 매칭용 "후보 토큰들"을 만든다.
// 사람들은 보통 짧게 검색한다: "인천초은중학교" → 실제 검색은 "초은중".
// sido 기반 지역 제거는 형태가 제각각이라 불안정 → 대신 학교명을 뒤에서부터
// 여러 길이로 잘라 후보를 만들고, 그중 search_logs에서 가장 많이 잡히는 토큰을 쓴다.
//
// 예) "인천초은중학교"
//  - 접미사 축약: "인천초은중"
//  - 축약형에서 앞글자를 1~3개 떼본 것: "천초은중", "초은중", "은중"
//  → 이 중 "초은중"이 search_logs의 "초은중"과 매칭되어 33건이 잡힘
export function schoolSearchTokens(schoolName: string): string[] {
  const tokens = new Set<string>()
  const full = schoolName.trim()
  tokens.add(full)

  // 접미사를 한 글자로 축약 (초등학교→초, 중학교→중, 고등학교→고, 대학교/전문대학→대)
  const shortType = full
    .replace(/초등학교$/u, '초')
    .replace(/중학교$/u, '중')
    .replace(/고등학교$/u, '고')
    .replace(/대학교$/u, '대')
    .replace(/전문대학$/u, '대')
  tokens.add(shortType)

  // 축약형에서 앞 지역 접두사를 1~3글자씩 떼본 후보들
  // (지역명이 보통 앞 2글자이므로, 떼고 남은 게 사람들이 실제 치는 핵심어가 됨)
  for (let cut = 1; cut <= 3; cut++) {
    if (shortType.length - cut >= 2) {
      tokens.add(shortType.slice(cut))
    }
  }

  // 너무 짧은(1글자) 토큰은 오매칭 위험이 커서 제외
  return Array.from(tokens).filter((t) => t.length >= 2)
}

// 이 학교가 search_logs에서 몇 번 검색됐는지 카운트.
// 여러 후보 토큰 중 "가장 많이 잡힌 값"을 집계 RPC(get_school_search_count)로 계산한다.
// search_logs 원문(query/id/created_at)은 anon에게 공개되지 않으므로(2026-07-17
// search-logs-aggregate-rpc 결정) 더 이상 테이블을 직접 SELECT하지 않는다.
// 실패하면 0을 돌려주고 페이지는 정상 동작.
export async function getSchoolSearchCount(
  schoolName: string,
  _sido?: string | null // 더 이상 사용하지 않지만 호출부 호환을 위해 시그니처 유지
): Promise<number> {
  const tokens = schoolSearchTokens(schoolName)
  if (tokens.length === 0) return 0

  const { data, error } = await supabase.rpc('get_school_search_count', {
    search_tokens: tokens,
  })

  if (error) return 0
  if (typeof data !== 'number' || !Number.isFinite(data)) return 0
  return data
}
