import { supabase } from '@/lib/supabase'

// 학교명에서 검색 매칭용 "후보 토큰들"을 만든다.
// 사람들은 보통 짧게 검색한다: "인천초은중학교" → 실제로는 "초은중" 으로 검색.
// 정답 토큰을 한 번에 맞히기 어려우므로, 여러 후보를 만들어 가장 많이 잡히는 걸 쓴다.
//
// 전략:
//  1) 전체 학교명 (예: 인천초은중학교)
//  2) 접미사만 한 글자로 축약 (초등학교→초, 중학교→중, 고등학교→고, 대학교→대)
//     예: 인천초은중학교 → 인천초은중
//  3) 시도/지역 접두사 후보 제거 + 축약형
//     예: 인천초은중 → 초은중   (지역명을 떼면 사람들이 실제 치는 형태가 됨)
export function schoolSearchTokens(schoolName: string, sido?: string | null): string[] {
  const tokens = new Set<string>()
  const full = schoolName.trim()
  tokens.add(full)

  // 접미사 한 글자 축약형
  const shortType = full
    .replace(/초등학교$/u, '초')
    .replace(/중학교$/u, '중')
    .replace(/고등학교$/u, '고')
    .replace(/대학교$/u, '대')
    .replace(/전문대학$/u, '대')
  tokens.add(shortType)

  // 지역 접두사 후보 제거 (시도명 앞글자 + 흔한 도시 접두사)
  // sido 예: "인천광역시" → "인천" 떼보기
  const prefixes: string[] = []
  if (sido) {
    const sidoShort = sido
      .replace(/특별자치시|특별자치도|특별시|광역시|자치도|도$/u, '')
      .trim()
    if (sidoShort.length >= 2) prefixes.push(sidoShort)
  }
  // 흔한 시 단위 접두사도 시도 (학교명 앞 2글자가 지역일 가능성)
  for (const p of prefixes) {
    if (shortType.startsWith(p)) {
      const stripped = shortType.slice(p.length)
      if (stripped.length >= 2) tokens.add(stripped)
    }
    if (full.startsWith(p)) {
      const stripped2 = full.slice(p.length)
      if (stripped2.length >= 2) tokens.add(stripped2)
    }
  }

  return Array.from(tokens).filter((t) => t.length >= 2)
}

// 이 학교가 search_logs에서 몇 번 검색됐는지 카운트.
// 여러 후보 토큰으로 각각 세어 가장 큰 값을 사용 (가장 잘 맞은 토큰 기준).
// 실패하면 0을 돌려주고 페이지는 정상 동작.
export async function getSchoolSearchCount(
  schoolName: string,
  sido?: string | null
): Promise<number> {
  const tokens = schoolSearchTokens(schoolName, sido)
  if (tokens.length === 0) return 0

  let best = 0
  for (const token of tokens) {
    const { count, error } = await supabase
      .from('search_logs')
      .select('id', { count: 'exact', head: true })
      .ilike('query', `%${token}%`)
    if (!error && typeof count === 'number' && count > best) {
      best = count
    }
  }
  return best
}
