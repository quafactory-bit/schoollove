import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export type OwnClassDiscoveryChoice = {
  schoolId: string
  schoolName: string
  schoolType: 'elementary' | 'middle' | 'high'
  region: string | null
  graduationYear: number
  gradeNumber: number
  classNumber: number
}

const schoolSchema = z.object({
  id: z.string().uuid(), school_name: z.string().trim().min(1),
  school_type: z.enum(['elementary', 'middle', 'high']),
  sido: z.string().nullable(), sigungu: z.string().nullable(),
})
const membershipSchema = z.object({
  graduation_year: z.number().int().min(1900).max(2200),
  school: schoolSchema,
  class_history: z.array(z.unknown()),
})
const classSchema = z.object({
  grade_number: z.number().int().min(1).max(6),
  class_number: z.number().int().min(1).max(100),
})

export async function getOwnClassDiscoveryChoices(
  client: SupabaseClient, userId: string,
): Promise<{ status: 'ok' | 'unavailable'; choices: OwnClassDiscoveryChoice[] }> {
  try {
    const { data, error } = await client.from('profile_school_memberships')
      .select('graduation_year, class_history:profile_school_class_histories(grade_number, class_number), school:schools(id, school_name, school_type, sido, sigungu)')
      .eq('owner_user_id', userId)
    if (error || !Array.isArray(data)) return { status: 'unavailable', choices: [] }
    const unique = new Map<string, OwnClassDiscoveryChoice>()
    for (const row of data) {
      const parsed = membershipSchema.safeParse(row)
      if (!parsed.success) continue
      const { school, graduation_year, class_history } = parsed.data
      for (const child of class_history) {
        const parsedClass = classSchema.safeParse(child)
        if (!parsedClass.success) continue
        const { grade_number, class_number } = parsedClass.data
        if (grade_number > (school.school_type === 'elementary' ? 6 : 3)) continue
        const key = `${school.id}:${graduation_year}:${grade_number}:${class_number}`
        unique.set(key, {
          schoolId: school.id, schoolName: school.school_name, schoolType: school.school_type,
          region: [school.sido, school.sigungu].filter(value => value?.trim()).join(' ') || null,
          graduationYear: graduation_year, gradeNumber: grade_number, classNumber: class_number,
        })
      }
    }
    const choices = [...unique.values()].sort((a, b) =>
      b.graduationYear - a.graduationYear || a.schoolName.localeCompare(b.schoolName, 'ko') ||
      a.gradeNumber - b.gradeNumber || a.classNumber - b.classNumber || a.schoolId.localeCompare(b.schoolId))
    return { status: 'ok', choices }
  } catch {
    return { status: 'unavailable', choices: [] }
  }
}
