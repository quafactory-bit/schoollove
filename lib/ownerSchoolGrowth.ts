import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const OwnerSchoolGrowthSchema = z.object({
  schoolId: z.string().uuid(), schoolName: z.string(), slug: z.string().min(1),
  level: z.number().int().min(1), progress: z.number().int().min(0).max(100),
  nearLevelUp: z.boolean(), lastLevelUp: z.string().nullable(),
  ownContributionXp: z.union([z.literal(0), z.literal(100), z.literal(150)]),
}).strip()
export type OwnerSchoolGrowth = z.infer<typeof OwnerSchoolGrowthSchema>
export type OwnerGrowthResponse = {
  contribution: { contributed: boolean; xp: 0 | 100 | 150 }
  growth: OwnerSchoolGrowth
}

/** Caller-scoped client only. Never public fallback, service role or shared cache. */
export async function getOwnSchoolGrowth(client: SupabaseClient, schoolId: string): Promise<OwnerSchoolGrowth | null> {
  if (!z.string().uuid().safeParse(schoolId).success) return null
  try {
    const { data, error } = await client.rpc('get_own_school_growth_live', {
      requested_school_id: schoolId,
    }).abortSignal(AbortSignal.timeout(2500))
    if (error) return null
    const parsed = OwnerSchoolGrowthSchema.safeParse(data)
    if (!parsed.success || parsed.data.schoolId !== schoolId || parsed.data.nearLevelUp !== (parsed.data.progress >= 80)) return null
    return parsed.data
  } catch { return null }
}
