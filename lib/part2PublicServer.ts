import 'server-only'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'

// Part 2 P1 (server only): reads the private Part 2 aggregate with the service role.
// Never import this file from a client component.

const slugSchema = z.string().min(1).max(200)
const popularSchema = z.array(z.object({ school_name: z.string().min(1), slug: slugSchema }).strict()).max(6)
export type PopularSchool = z.infer<typeof popularSchema>[number]

/** "지금 동창들이 많이 찾는 학교" chips from the last 7 days of real selections (server only). */
export async function getPopularSchools(): Promise<PopularSchool[]> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('part2_popular_schools')
    if (error) return []
    const parsed = popularSchema.safeParse(data)
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}
