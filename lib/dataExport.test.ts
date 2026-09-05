import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminMock = vi.hoisted(() => {
  const filters: Array<{ table: string; column: string; value: string }> = []
  const rows: Record<string, unknown[]> = {
    profile_school_memberships: [
      { id: 'membership-a', school_id: 'school-a', graduation_year: 2007, class_number: null, created_at: '2026-08-27T00:00:00Z' },
      { id: 'membership-b', school_id: 'school-b', graduation_year: 2011, class_number: null, created_at: '2026-08-27T00:00:00Z' },
    ],
    profile_school_class_histories: [
      { membership_id: 'membership-a', grade_number: 1, class_number: 2, created_at: '2026-08-27T00:00:00Z', updated_at: '2026-08-27T00:00:00Z' },
      { membership_id: 'membership-a', grade_number: 2, class_number: 5, created_at: '2026-08-27T00:00:00Z', updated_at: '2026-08-27T00:00:00Z' },
    ],
  }
  const from = vi.fn((table: string) => {
    const result = () => ({ data: rows[table] ?? [], error: null })
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn((column: string, value: string) => {
      filters.push({ table, column, value })
      return builder
    })
    builder.not = vi.fn(() => builder)
    builder.or = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({ data: table === 'private_profiles' ? null : (rows[table]?.[0] ?? null), error: null }))
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
    return builder
  })
  return { filters, from }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: adminMock.from }),
}))

import { buildOwnerExport } from './dataExport'

const source = readFileSync(join(process.cwd(), 'lib/dataExport.ts'), 'utf8')

describe('owner data export grade/class history', () => {
  beforeEach(() => {
    adminMock.filters.length = 0
    adminMock.from.mockClear()
  })

  it('학교 이력과 학년별 반을 같은 owner 경계로 조회한다', () => {
    expect(source).toContain("from('profile_school_memberships')")
    expect(source).toContain("from('profile_school_class_histories')")
    expect(source.match(/\.eq\('owner_user_id',userId\)/g)?.length).toBeGreaterThanOrEqual(5)
    expect(source).toContain("select('membership_id,grade_number,class_number,created_at,updated_at')")
  })

  it('학년별 반을 membership 아래에 포함하고 cross-user 식별자를 내보내지 않는다', () => {
    expect(source).toContain('class_history: (classHistories.data ?? [])')
    expect(source).toContain('history.membership_id === id')
    expect(source).toContain('({ id, ...membership })')
    expect(source).toContain('membership_id: _membershipId')
    expect(source).not.toContain("select('owner_user_id,membership_id")
  })

  it('실제 export 결과에서 owner로 filter한 child만 parent 아래에 중첩하고 내부 ID를 제거한다', async () => {
    const data = await buildOwnerExport('owner-a')
    expect(data.memberships).toEqual([
      {
        school_id: 'school-a', graduation_year: 2007, class_number: null, created_at: '2026-08-27T00:00:00Z',
        class_history: [
          { grade_number: 1, class_number: 2, created_at: '2026-08-27T00:00:00Z', updated_at: '2026-08-27T00:00:00Z' },
          { grade_number: 2, class_number: 5, created_at: '2026-08-27T00:00:00Z', updated_at: '2026-08-27T00:00:00Z' },
        ],
      },
      { school_id: 'school-b', graduation_year: 2011, class_number: null, created_at: '2026-08-27T00:00:00Z', class_history: [] },
    ])
    expect(adminMock.filters).toContainEqual({ table: 'profile_school_memberships', column: 'owner_user_id', value: 'owner-a' })
    expect(adminMock.filters).toContainEqual({ table: 'profile_school_class_histories', column: 'owner_user_id', value: 'owner-a' })
    expect(JSON.stringify(data.memberships)).not.toContain('membership-a')
    expect(JSON.stringify(data.memberships)).not.toContain('owner_user_id')
  })
})
