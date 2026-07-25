import { revalidatePath } from 'next/cache'
import { buildClassPath, buildSchoolPath, buildYearPath } from '@/lib/seo'

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

type RegistrationRevalidationContext = {
  schoolSlug?: string
  graduationYear: number
  grade?: number | null
  classNumber?: number | null
}

// A successful registration changes the home activity feed and the visible people lists for
// the submitted School/Year/Class context. The route supplies a server-resolved school slug;
// client input is never trusted to choose arbitrary cache paths.
export function revalidateRegistrationContext(context: RegistrationRevalidationContext): void {
  const paths = ['/']
  if (context.schoolSlug) {
    paths.push(buildSchoolPath(context.schoolSlug))
    paths.push(buildYearPath(context.schoolSlug, context.graduationYear))
    if (context.grade != null && context.classNumber != null) {
      paths.push(
        buildClassPath(
          context.schoolSlug,
          context.graduationYear,
          context.grade,
          context.classNumber
        )
      )
    }
  }

  for (const path of new Set(paths)) {
    try {
      revalidatePath(path)
    } catch (error) {
      console.error('revalidateRegistrationContext error:', { path, error })
    }
  }
}
