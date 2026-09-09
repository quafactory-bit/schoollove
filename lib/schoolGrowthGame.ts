import { createPublicAuthClient } from '@/lib/user-auth'
import { z } from 'zod'

const SchoolGrowthSchema = z.object({
  schoolId: z.string().uuid(), schoolName: z.string(), slug: z.string().min(1),
  level: z.number().int().min(1), progress: z.number().min(0).max(100),
  weeklyXp: z.number().int().nonnegative(), rank: z.number().int().positive().nullable(),
  lastLevelUp: z.string().nullable(),
}).strip()
export type SchoolGrowth = z.infer<typeof SchoolGrowthSchema>
export type GrowthResult = { status: 'ok'; schools: SchoolGrowth[] } | { status: 'unavailable'; schools: [] }

/** Privacy-batched projection only; never fall back to legacy profile counts. */
export async function getSchoolGrowth(schoolId?: string): Promise<GrowthResult> {
  try {
    const { data, error } = await createPublicAuthClient().rpc('get_school_growth_game', {
      requested_school_id: schoolId ?? null,
    }).abortSignal(AbortSignal.timeout(2500))
    if (error) return { status: 'unavailable', schools: [] }
    const parsed = z.array(SchoolGrowthSchema).safeParse(data)
    return parsed.success ? { status: 'ok', schools: parsed.data } : { status: 'unavailable', schools: [] }
  } catch { return { status: 'unavailable', schools: [] } }
}
