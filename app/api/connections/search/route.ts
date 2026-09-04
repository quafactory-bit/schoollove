import { NextRequest, NextResponse } from 'next/server'
import { PersonDiscoverySearchSchema } from '@/lib/policy/connectionSafety'
import { requireConnectionContext, readJson } from '@/lib/api/connectionRoute'
import { findExactClassConnectionMatch, findExactConnectionMatch } from '@/lib/connections'
import { recordLimitedLaunchEvent } from '@/lib/onboarding'

async function waitForMinimumDuration(startedAt: number) {
  const remaining = 250 - (Date.now() - startedAt)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const context = await requireConnectionContext(request, 'search')
  if ('response' in context) { await waitForMinimumDuration(startedAt); return context.response }
  const parsed = PersonDiscoverySearchSchema.safeParse(await readJson(request))
  if (!parsed.success) {
    await waitForMinimumDuration(startedAt)
    return NextResponse.json({ state: 'invalid_search' }, { status: 400 })
  }

  const result = 'search_mode' in parsed.data && parsed.data.search_mode === 'same_class'
    ? await findExactClassConnectionMatch({
        userId: context.auth.user.id,
        schoolId: parsed.data.school_id,
        graduationYear: parsed.data.graduation_year,
        gradeNumber: parsed.data.grade_number,
        classNumber: parsed.data.class_number,
        exactName: parsed.data.exact_name,
      })
    : await findExactConnectionMatch({
        userId: context.auth.user.id,
        schoolId: parsed.data.school_id,
        graduationYear: parsed.data.graduation_year,
        exactName: parsed.data.exact_name,
      })
  await waitForMinimumDuration(startedAt)
  if (!result) return NextResponse.json({ state: 'service_unavailable' }, { status: 503 })
  await recordLimitedLaunchEvent('people_search_completed')
  return result.state === 'match_available' && result.matchToken
    ? NextResponse.json({ state: 'match_available', matchToken: result.matchToken })
    : NextResponse.json({ state: 'unavailable' })
}
