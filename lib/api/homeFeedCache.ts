import { revalidatePath } from 'next/cache'

// Phase 4B(docs/decisions/2026-07-17-home-feed-freshness.md) — 홈('/')은 실제 활동 피드이므로
// 성공한 profile/trace 등록 직후에만 호출한다. validation 실패, rate limit 차단, insert 실패 등
// 실패한 쓰기에서는 호출하지 않는다 — 호출 시점은 각 API route가 책임진다.
// revalidatePath 자체가 실패해도 이미 성공한 등록 응답을 되돌리지 않도록 예외를 여기서 삼킨다.
export function revalidateHomeFeed(): void {
  try {
    revalidatePath('/')
  } catch (error) {
    console.error('revalidateHomeFeed error:', error)
  }
}
