// app/submit/page.tsx의 등록 루프(사람별 POST /api/profiles 순차 호출)를 분리한 모듈.
// UI 테스트 인프라가 없어 배치(신규/중복/부분성공/전체실패) 동작을 검증하려면
// 이 루프를 컴포넌트에서 분리해야 한다. 동작은 기존 handleSubmit 루프와 동일하며
// 위치만 옮겼다 — fetch 호출 순서, 카운트 규칙, 에러 처리 모두 무수정.
export type PersonInput = {
  nickname: string
  instagram: string
  isSelf: boolean
  message: string
}

export type RegisterBase = {
  school_id: string
  graduation_year: number
  grade: number | null
  class_number: number | null
  department: string | null
  student_year: number | null
}

export type RegisterResult = {
  success: number
  dup: number
  fail: number
}

export function normalizeInsta(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  s = s.replace(/[/?].*$/, '')
  s = s.replace(/^@/, '')
  return s.trim()
}

// people을 순서대로 하나씩 POST /api/profiles로 등록한다.
// 학교당 신규 성공(success) 1건마다 route.ts 내부에서 syncSchoolLevel이 1회 호출되고,
// 중복(dup, 409)과 실패(fail)는 route.ts에서 Level Sync를 호출하지 않는다.
export async function registerPeople(
  people: PersonInput[],
  base: RegisterBase
): Promise<RegisterResult> {
  let success = 0
  let dup = 0
  let fail = 0

  for (const p of people) {
    const insta = normalizeInsta(p.instagram) || null
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...base,
          nickname: p.nickname.trim(),
          instagram_id: insta,
          is_self: insta ? p.isSelf : false,
          message: p.message.trim() || null, // 이 친구에게 한마디
        }),
      })
      if (res.ok) success++
      else if (res.status === 409) dup++
      else fail++
    } catch {
      fail++
    }
  }

  return { success, dup, fail }
}
