import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

const schoolRosterSchema = z.array(z.object({
  display_name: z.string().min(1).max(50),
  graduation_year: z.number().int().min(1900).max(2200),
  class_history: z.array(z.object({
    grade_number: z.number().int().min(1).max(6),
    class_number: z.number().int().min(1).max(100),
  }).strict()).max(6),
}).strict()).max(500)

export type SchoolRosterEntry = z.infer<typeof schoolRosterSchema>[number]

export async function getSchoolRoster(client: SupabaseClient, schoolId: string): Promise<{
  status: 'ok' | 'unavailable'
  entries: SchoolRosterEntry[]
}> {
  const { data, error } = await client.rpc('get_school_member_roster', { requested_school_id: schoolId })
  if (error) return { status: 'unavailable', entries: [] }
  const parsed = schoolRosterSchema.safeParse(data)
  return parsed.success
    ? { status: 'ok', entries: parsed.data }
    : { status: 'unavailable', entries: [] }
}
