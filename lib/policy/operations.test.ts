import { describe, expect, it } from 'vitest'
import { BetaAdminOperationSchema, csvSafe, isFutureGraduationYear } from './operations'

describe('PHASE 10F operational policy', () => {
  it('rejects a future graduation year using KST year', () => {
    expect(isFutureGraduationYear(2027,new Date('2026-12-31T14:59:59Z'))).toBe(true)
    expect(isFutureGraduationYear(2027,new Date('2026-12-31T15:00:00Z'))).toBe(false)
  })

  it('neutralizes spreadsheet formulas and quotes fields', () => {
    expect(csvSafe('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"')
    expect(csvSafe('normal')).toBe('"normal"')
  })

  it('allows only single-use invites and program-scoped feature changes',()=>{
    const programId=crypto.randomUUID()
    expect(BetaAdminOperationSchema.safeParse({action:'issue_invite',programId,maxUses:1,expiresAt:'2026-08-01T00:00:00.000Z'}).success).toBe(true)
    expect(BetaAdminOperationSchema.safeParse({action:'issue_invite',programId,maxUses:2,expiresAt:'2026-08-01T00:00:00.000Z'}).success).toBe(false)
    expect(BetaAdminOperationSchema.safeParse({action:'set_feature',programId:null,userId:null,feature:'private_profile',enabled:true,reason:'ADMIN_FEATURE_CONTROL'}).success).toBe(false)
  })
})
