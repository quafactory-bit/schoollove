import { z } from 'zod'
import { supabase } from '@/lib/supabase'

// Part 2 P1: public previews. Every function fails closed (hidden/empty) instead of throwing,
// so a missing migration or DB error never breaks the public pages.

const maskedSchema = z.array(z.object({ masked_name: z.string().min(1).max(3) }).strict()).max(6)
const STATUS_TAG_VALUES = ['직장인', '자영업', '프리랜서', '육아 중', '공부 중', '쉬는 중', '이직 준비', '해외 거주'] as const
const maskedV2Schema = z.array(z.object({
  masked_name: z.string().min(1).max(3),
  tags: z.array(z.enum(STATUS_TAG_VALUES)).max(3),
  note: z.string().min(1).max(30).nullable(),
}).strict()).max(6)

export type MaskedPreviewEntry = { masked_name: string; tags: string[]; note: string | null }

/**
 * Masked names (+ 근황 태그·한마디 only where the owner turned on "학교 페이지에 보이기") for a logged-out
 * year page. Masking happens in the database. Falls back to the P1 name-only function before P3 is applied.
 */
export async function getYearMaskedPreview(schoolId: string, year: number): Promise<MaskedPreviewEntry[]> {
  try {
    const v2 = await supabase.rpc('part2_year_masked_preview_v2', { p_school_id: schoolId, p_year: year })
    if (!v2.error) {
      const parsed = maskedV2Schema.safeParse(v2.data)
      return parsed.success ? parsed.data : []
    }
    const { data, error } = await supabase.rpc('part2_year_masked_preview', { p_school_id: schoolId, p_year: year })
    if (error) return []
    const parsed = maskedSchema.safeParse(data)
    return parsed.success ? parsed.data.map((row) => ({ masked_name: row.masked_name, tags: [], note: null })) : []
  } catch {
    return []
  }
}

const summonsSchema = z.array(z.object({
  school_name: z.string().min(1).max(100),
  school_slug: z.string().min(1).max(200),
  graduation_year: z.number().int().min(1950).max(2100),
  target_name: z.string().min(2).max(10),
}).strict()).max(1)
export type PublicSummons = z.infer<typeof summonsSchema>[number]

/** Public summons card: school, year, target name only. Hidden/expired/unknown → null. */
export async function getPublicSummons(code: string): Promise<PublicSummons | null> {
  if (!/^[a-f0-9]{12}$/.test(code)) return null
  try {
    const { data, error } = await supabase.rpc('part2_get_public_summons', { p_code: code })
    if (error) return null
    const parsed = summonsSchema.safeParse(data)
    return parsed.success && parsed.data.length === 1 ? parsed.data[0] : null
  } catch {
    return null
  }
}

const flagsSchema = z.array(z.object({ school_id: z.string().uuid(), has_roster: z.boolean() }).strict()).max(50)

/** Search badges: true = 출석부 열림, false = 1대 반장 모집 중. Missing key = unknown (no badge). */
export async function getSchoolRosterFlags(schoolIds: string[]): Promise<Record<string, boolean>> {
  const ids = Array.from(new Set(schoolIds)).slice(0, 50)
  if (ids.length === 0) return {}
  try {
    const { data, error } = await supabase.rpc('part2_school_roster_flags', { p_school_ids: ids })
    if (error) return {}
    const parsed = flagsSchema.safeParse(data)
    if (!parsed.success) return {}
    return Object.fromEntries(parsed.data.map((row) => [row.school_id, row.has_roster]))
  } catch {
    return {}
  }
}

const slugSchema = z.string().min(1).max(200)
const homeSchema = z.union([
  z.object({ visible: z.literal(false) }).strict(),
  z.object({
    visible: z.literal(true),
    recent_total: z.number().int().min(5),
    ticker: z.array(z.object({ school_name: z.string().min(1), slug: slugSchema, graduation_year: z.number().int(), count: z.number().int().min(1) }).strict()).max(8),
    top: z.array(z.object({ school_name: z.string().min(1), slug: slugSchema, count: z.number().int().min(1) }).strict()).max(5),
  }).strict(),
])

export type HomeAttendance = z.infer<typeof homeSchema>

/** LIVE ticker + TOP 5. The DB hides both when fewer than 5 check-ins in 7 days. */
export async function getHomeAttendance(): Promise<HomeAttendance> {
  try {
    const { data, error } = await supabase.rpc('part2_home_attendance')
    if (error) return { visible: false }
    const parsed = homeSchema.safeParse(data)
    return parsed.success ? parsed.data : { visible: false }
  } catch {
    return { visible: false }
  }
}
