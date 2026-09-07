import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const page = readFileSync('app/account/page.tsx','utf8'), client = readFileSync('app/account/AccountClient.tsx','utf8')
describe('class-only UI source boundary (real rendering in verify-ui.cjs)', () => {
  it('reads private-profile and people-search authority independently', () => {
    expect(page).toContain("hasBetaFeatureAccess(auth.client,auth.user.id,'private_profile')")
    expect(page).toContain("hasBetaFeatureAccess(auth.client,auth.user.id,'people_search')")
    expect(page).toContain('peopleSearchBetaAccess={peopleSearchBetaAccess}')
  })
  it('keeps school/profile writes unchanged and gates class editing separately', () => {
    expect(client).toContain('const classHistoryWritable=(schoolMembershipWritable||peopleSearchBetaAccess)&&!launch.emergencyStopped&&!deletionBlocked')
    expect(client).toContain('const schoolMembershipWritable=(launch.schoolMembershipEnabled||controlledBetaAccess||inviteOnboardingAccess)')
    expect(client).toContain('const privateProfileWritable=(launch.privateProfileEnabled||controlledBetaAccess||inviteOnboardingAccess)')
    expect(client).toContain('classHistoryWritable={classHistoryWritable}')
  })
})
