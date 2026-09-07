import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ account: vi.fn(), beta: vi.fn() }))
vi.mock('@/lib/publicAccountLaunch', () => ({ hasAccountOnboardingWriteAccess: mocks.account }))
vi.mock('@/lib/beta', () => ({ hasBetaFeatureAccess: mocks.beta }))
import { hasClassHistorySelfServiceWriteAccess } from './classHistoryAccess'
describe('class-only coarse access', () => {
  beforeEach(() => vi.resetAllMocks())
  it.each(['public', 'claimed onboarding'])('preserves %s authority', async () => {
    mocks.account.mockResolvedValue(true)
    expect(await hasClassHistorySelfServiceWriteAccess({} as never, 'owner')).toBe(true)
    expect(mocks.beta).not.toHaveBeenCalled()
  })
  it('falls back only to people_search, not Instagram or profile mutation', async () => {
    mocks.account.mockResolvedValue(false); mocks.beta.mockResolvedValue(true)
    expect(await hasClassHistorySelfServiceWriteAccess({} as never, 'owner')).toBe(true)
    expect(mocks.beta).toHaveBeenCalledWith({}, 'owner', 'people_search')
  })
  it('denies when both authorities deny', async () => {
    mocks.account.mockResolvedValue(false); mocks.beta.mockResolvedValue(false)
    expect(await hasClassHistorySelfServiceWriteAccess({} as never, 'owner')).toBe(false)
  })
})
