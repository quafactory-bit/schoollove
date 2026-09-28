import { describe, expect, it, vi } from 'vitest'
import { getSchoolRoster } from './schoolRoster'

describe('getSchoolRoster', () => {
  it('accepts only the narrow full-name, graduation-year and class projection', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      display_name: '김하늘',
      graduation_year: 2014,
      class_history: [{ grade_number: 3, class_number: 2 }],
    }], error: null })
    await expect(getSchoolRoster({ rpc } as never, '00000000-0000-4000-8000-000000000001')).resolves.toEqual({
      status: 'ok',
      entries: [{ display_name: '김하늘', graduation_year: 2014, class_history: [{ grade_number: 3, class_number: 2 }] }],
    })
    expect(rpc).toHaveBeenCalledWith('get_school_member_roster', { requested_school_id: '00000000-0000-4000-8000-000000000001' })
  })

  it('fails closed for extra identifiers or an RPC error', async () => {
    const extra = vi.fn().mockResolvedValue({ data: [{ display_name: '김하늘', graduation_year: 2014, class_history: [], owner_user_id: 'private' }], error: null })
    await expect(getSchoolRoster({ rpc: extra } as never, 'school')).resolves.toEqual({ status: 'unavailable', entries: [] })
    const failed = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(getSchoolRoster({ rpc: failed } as never, 'school')).resolves.toEqual({ status: 'unavailable', entries: [] })
  })
})
