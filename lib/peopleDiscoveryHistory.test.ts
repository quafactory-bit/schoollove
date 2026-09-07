import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
vi.mock('server-only', () => ({}))
import { getOwnClassDiscoveryChoices } from './peopleDiscoveryHistory'

const schoolId = '00000000-0000-4000-8000-000000000001'
const row = () => ({ graduation_year: 2016, school: { id: schoolId, school_name: '합성고등학교', school_type: 'high', sido: '서울', sigungu: '테스트구' }, class_history: [{ grade_number: 3, class_number: 1 }] })
const eq = vi.fn(), select = vi.fn(), from = vi.fn()
const client = { from } as unknown as SupabaseClient
beforeEach(() => { vi.clearAllMocks(); from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockResolvedValue({ data: [row()], error: null }) })

describe('owner history minimal projection', () => {
  it('uses only the supplied authenticated client and explicit owner filter; outputs seven safe fields', async () => {
    const result = await getOwnClassDiscoveryChoices(client, 'owner-fixture')
    expect(from).toHaveBeenCalledExactlyOnceWith('profile_school_memberships')
    expect(eq).toHaveBeenCalledExactlyOnceWith('owner_user_id', 'owner-fixture')
    expect(select.mock.calls[0][0]).toBe('graduation_year, class_history:profile_school_class_histories(grade_number, class_number), school:schools(id, school_name, school_type, sido, sigungu)')
    expect(result).toEqual({ status: 'ok', choices: [{ schoolId, schoolName: '합성고등학교', schoolType: 'high', region: '서울 테스트구', graduationYear: 2016, gradeNumber: 3, classNumber: 1 }] })
  })
  it('projects away private row IDs and extra data', async () => {
    eq.mockResolvedValue({ data: [{ ...row(), id: 'private-id', owner_user_id: 'owner', profile_id: 'profile', email: 'private', instagram_handle: 'private', class_history: [{ id: 'child', grade_number: 3, class_number: 1 }] }], error: null })
    expect(JSON.stringify(await getOwnClassDiscoveryChoices(client, 'owner'))).not.toMatch(/private|owner|profile|email|instagram|child/)
  })
  it('keeps all three grades sorted, deduplicates exact choices and sorts year descending', async () => {
    const a = row(); a.class_history = [3, 1, 2, 1].map(grade_number => ({ grade_number, class_number: 1 }))
    eq.mockResolvedValue({ data: [a, { ...row(), graduation_year: 2020 }, row()], error: null })
    const { choices } = await getOwnClassDiscoveryChoices(client, 'owner')
    expect(choices.map(c => [c.graduationYear, c.gradeNumber])).toEqual([[2020, 3], [2016, 1], [2016, 2], [2016, 3]])
  })
  it('sorts equal years by school name then grade/class independently of input order', async () => {
    const a = row(), b = row(); a.school.school_name = '가학교'; b.school.school_name = '나학교'; b.school.id = '00000000-0000-4000-8000-000000000002'
    eq.mockResolvedValue({ data: [b, a], error: null })
    expect((await getOwnClassDiscoveryChoices(client, 'owner')).choices.map(c => c.schoolName)).toEqual(['가학교', '나학교'])
  })
  it('accepts elementary grade six, rejects middle/high grade four', async () => {
    eq.mockResolvedValue({ data: ['elementary', 'middle', 'high'].map(school_type => ({ ...row(), school: { ...row().school, school_type }, class_history: [{ grade_number: school_type === 'elementary' ? 6 : 4, class_number: 1 }] })), error: null })
    expect((await getOwnClassDiscoveryChoices(client, 'owner')).choices).toHaveLength(1)
  })
  it.each([0, 7, 1.5, '3', null])('rejects invalid grade %s without losing valid siblings', async grade_number => {
    eq.mockResolvedValue({ data: [{ ...row(), class_history: [{ grade_number, class_number: 1 }, ...row().class_history] }], error: null })
    expect((await getOwnClassDiscoveryChoices(client, 'owner')).choices).toHaveLength(1)
  })
  it.each([0, 101, 1.5, '1', null])('rejects invalid class %s', async class_number => {
    eq.mockResolvedValue({ data: [{ ...row(), class_history: [{ grade_number: 3, class_number }] }], error: null })
    expect((await getOwnClassDiscoveryChoices(client, 'owner')).choices).toEqual([])
  })
  it.each([
    { graduation_year: 1899 }, { graduation_year: '2016' }, { graduation_year: 2201 },
    { school: null }, { school: [] }, { school: { ...row().school, id: 'not-uuid' } },
    { school: { ...row().school, school_type: 'university' } }, { school: { ...row().school, school_name: ' ' } },
    { class_history: null }, { class_history: [] },
  ])('skips malformed or non-K12 rows %j', async override => {
    eq.mockResolvedValue({ data: [{ ...row(), ...override }], error: null })
    expect(await getOwnClassDiscoveryChoices(client, 'owner')).toEqual({ status: 'ok', choices: [] })
  })
  it('returns empty history and nullable region honestly', async () => {
    eq.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ ...row(), school: { ...row().school, sido: null, sigungu: null } }], error: null })
    expect(await getOwnClassDiscoveryChoices(client, 'owner')).toEqual({ status: 'ok', choices: [] })
    expect((await getOwnClassDiscoveryChoices(client, 'owner')).choices[0].region).toBeNull()
  })
  it.each([{ data: null, error: null }, { data: [row()], error: { message: 'sensitive database detail' } }])('returns safe unavailable for failed reads', async response => {
    eq.mockResolvedValue(response)
    expect(await getOwnClassDiscoveryChoices(client, 'owner')).toEqual({ status: 'unavailable', choices: [] })
  })
  it('contains thrown errors without logging or exposing them', async () => {
    eq.mockRejectedValue(new Error('sensitive'))
    expect(await getOwnClassDiscoveryChoices(client, 'owner')).toEqual({ status: 'unavailable', choices: [] })
  })
})
