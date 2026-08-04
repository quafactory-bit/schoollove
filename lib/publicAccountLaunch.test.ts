import {describe,expect,it} from 'vitest'
import {CLOSED_PUBLIC_ACCOUNT_LAUNCH,normalizePublicAccountLaunch,getSafeMembershipError} from './publicAccountLaunch'

describe('public account launch normalization',()=>{
  it('closed/internal/open exact feature contracts only accept consistent server rows',()=>{
    expect(normalizePublicAccountLaunch({state:'closed',registration_enabled:false,private_profile_enabled:false,school_membership_enabled:false,emergency_stopped:false}).state).toBe('closed')
    expect(normalizePublicAccountLaunch({state:'internal_test',registration_enabled:false,private_profile_enabled:true,school_membership_enabled:true,emergency_stopped:false}).state).toBe('internal_test')
    expect(normalizePublicAccountLaunch({state:'open',registration_enabled:true,private_profile_enabled:true,school_membership_enabled:true,emergency_stopped:false}).state).toBe('open')
  })

  it('unknown or inconsistent rows fail closed',()=>{
    expect(normalizePublicAccountLaunch({state:'open',registration_enabled:false,private_profile_enabled:true,school_membership_enabled:true,emergency_stopped:false})).toEqual(CLOSED_PUBLIC_ACCOUNT_LAUNCH)
    expect(normalizePublicAccountLaunch({state:'unexpected'})).toEqual(CLOSED_PUBLIC_ACCOUNT_LAUNCH)
  })

  it('maps DB codes to Korean without returning internal codes',()=>{
    expect(getSafeMembershipError({message:'PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED'})).toBe('학교 이력은 최대 3개까지 저장할 수 있습니다.')
    expect(getSafeMembershipError({message:'SOME_INTERNAL_FAILURE'})).toBeNull()
  })
})
