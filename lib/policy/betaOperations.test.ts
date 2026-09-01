import { describe,expect,it } from 'vitest'
import { betaFeatureKeys } from './operations'
import {
  assessBetaReadiness,
  assessControlledBetaInvitationEligibility,
  assessControlledBetaFeatureContract,
  BetaAdminActionSchema,
  BetaFeedbackSchema,
  BetaSetupSchema,
  classifyControlledBetaFeatureSet,
  feedbackTextIsSafe,
  firstControlledBetaEnabledFeatures,
  isSyntheticModeAllowed,
  maskSmallAggregate,
  peopleDiscoveryControlledBetaEnabledFeatures,
} from './betaOperations'

const baseSetup={
  draftKey:'beta_01',name:'Beta',startsAt:'2026-08-01T00:00:00.000Z',endsAt:'2026-08-15T00:00:00.000Z',
  maxUsers:20,targetScope:'adult graduates',targetSchoolId:crypto.randomUUID(),
  invitePolicy:{maxUsesPerInvite:1,expiresInDays:7},approvalWaitlistEnabled:true,
  stopConditions:{PRIVACY_EXPOSURE:true,RLS_FAILURE:true,HEALTH_FAILURE:true},operatorMemo:'',status:'validated' as const,
}
const programFlags=(enabled:readonly string[])=>betaFeatureKeys.map((feature_key)=>({feature_key,enabled:enabled.includes(feature_key)}))

describe('controlled beta operations policy',()=>{
  it('masks every segment below ten',()=>{expect(maskSmallAggregate(9)).toEqual({count:null,masked:true,label:'10명 미만'});expect(maskSmallAggregate(10)).toEqual({count:10,masked:false,label:'10'})})
  it('rejects identifiers and query-bearing paths in feedback',()=>{for(const value of ['name@example.com','@somebody','https://example.com','010-1234-5678'])expect(feedbackTextIsSafe(value)).toBe(false);expect(BetaFeedbackSchema.safeParse({programId:crypto.randomUUID(),kind:'error',description:'버튼을 누르면 화면이 멈춥니다',pagePath:'/account',coarseBrowser:'chrome',coarseDevice:'mobile'}).success).toBe(true);expect(BetaFeedbackSchema.safeParse({programId:crypto.randomUUID(),kind:'error',description:'오류입니다',pagePath:'/search?q=name'}).success).toBe(false)})

  it('classifies only the two exact order-independent controlled-beta contracts',()=>{
    expect(classifyControlledBetaFeatureSet(firstControlledBetaEnabledFeatures)).toBe('account_private')
    expect(classifyControlledBetaFeatureSet([...peopleDiscoveryControlledBetaEnabledFeatures].reverse())).toBe('people_discovery')
    for(const invalid of [
      ['people_search'],['connection_request'],['people_search','messaging'],['people_search','instagram_permission'],
      ['account_registration','people_search'],['private_profile','connection_request'],
      ['people_search','connection_request','messaging'],['people_search','people_search'],
    ] as const) expect(classifyControlledBetaFeatureSet(invalid)).toBeNull()
  })

  it('validates either exact contract with the same single-school safety envelope',()=>{
    expect(BetaSetupSchema.safeParse({...baseSetup,enabledFeatures:[...firstControlledBetaEnabledFeatures]}).success).toBe(true)
    expect(BetaSetupSchema.safeParse({...baseSetup,enabledFeatures:[...peopleDiscoveryControlledBetaEnabledFeatures]}).success).toBe(true)
    expect(BetaSetupSchema.safeParse({...baseSetup,targetSchoolId:null,enabledFeatures:[...peopleDiscoveryControlledBetaEnabledFeatures]}).success).toBe(false)
    expect(BetaSetupSchema.safeParse({...baseSetup,enabledFeatures:['account_registration','people_search']}).success).toBe(false)
    expect(BetaSetupSchema.safeParse({...baseSetup,enabledFeatures:['people_search','connection_request'],endsAt:'2026-08-14T00:00:00.000Z'}).success).toBe(false)
    expect(BetaSetupSchema.safeParse({...baseSetup,enabledFeatures:['people_search','connection_request'],stopConditions:{RLS_FAILURE:true}}).success).toBe(false)
  })

  it('derives readiness from the immutable snapshot contract and full eight-flag inventory',()=>{
    const account=assessControlledBetaFeatureContract({snapshotFeatures:firstControlledBetaEnabledFeatures,programFlags:programFlags(firstControlledBetaEnabledFeatures),globalFlags:[]})
    expect(account).toEqual({contractKind:'account_private',programFlagsComplete:true,globalFeatureStopped:false})
    const people=assessControlledBetaFeatureContract({snapshotFeatures:peopleDiscoveryControlledBetaEnabledFeatures,programFlags:programFlags(peopleDiscoveryControlledBetaEnabledFeatures),globalFlags:[]})
    expect(people).toEqual({contractKind:'people_discovery',programFlagsComplete:true,globalFeatureStopped:false})
    expect(assessControlledBetaFeatureContract({snapshotFeatures:peopleDiscoveryControlledBetaEnabledFeatures,programFlags:programFlags(firstControlledBetaEnabledFeatures),globalFlags:[]}).programFlagsComplete).toBe(false)
    expect(assessControlledBetaFeatureContract({snapshotFeatures:peopleDiscoveryControlledBetaEnabledFeatures,programFlags:programFlags(peopleDiscoveryControlledBetaEnabledFeatures),globalFlags:[{feature_key:'people_search',enabled:false}]}).globalFeatureStopped).toBe(true)
  })

  it('allows invitations for either exact controlled-beta feature contract and keeps lifecycle gates fail-closed',()=>{
    const now=Date.parse('2026-08-28T00:00:00.000Z')
    const assess=(features:readonly (typeof betaFeatureKeys)[number][],overrides:Partial<Parameters<typeof assessControlledBetaInvitationEligibility>[0]>={})=>assessControlledBetaInvitationEligibility({
      snapshotFeatures:features,
      programFlags:programFlags(features),
      globalFlags:[],
      snapshotBacked:true,
      schoolAllowlistCount:1,
      schoolContractMatches:true,
      invitePolicy:{maxUsesPerInvite:1,expiresInDays:7},
      approvalWaitlistEnabled:true,
      startsAt:'2026-08-27T00:00:00.000Z',
      endsAt:'2026-09-10T00:00:00.000Z',
      status:'active',
      emergencyDisabledAt:null,
      now,
      ...overrides,
    })
    expect(assess(firstControlledBetaEnabledFeatures)).toBe(true)
    expect(assess(peopleDiscoveryControlledBetaEnabledFeatures)).toBe(true)
    expect(assess(['people_search'])).toBe(false)
    expect(assess(peopleDiscoveryControlledBetaEnabledFeatures,{status:'paused'})).toBe(false)
    expect(assess(peopleDiscoveryControlledBetaEnabledFeatures,{endsAt:'2026-08-28T00:00:00.000Z'})).toBe(false)
    expect(assess(peopleDiscoveryControlledBetaEnabledFeatures,{globalFlags:[{feature_key:'people_search',enabled:false}]})).toBe(false)
  })

  it('validates both configure pairs and rejects mixed administrator actions',()=>{
    const programId=crypto.randomUUID()
    expect(BetaAdminActionSchema.safeParse({action:'start_program',programId,reason:'OPERATOR_APPROVED_START'}).success).toBe(true)
    expect(BetaAdminActionSchema.safeParse({action:'reactivate_program',programId,reason:'OPERATOR_APPROVED_REACTIVATION',resolutionCode:'INCIDENT_RESOLVED'}).success).toBe(true)
    expect(BetaAdminActionSchema.safeParse({action:'configure_features',programId,enabledFeatures:[...firstControlledBetaEnabledFeatures]}).success).toBe(true)
    expect(BetaAdminActionSchema.safeParse({action:'configure_features',programId,enabledFeatures:[...peopleDiscoveryControlledBetaEnabledFeatures]}).success).toBe(true)
    expect(BetaAdminActionSchema.safeParse({action:'configure_features',programId,enabledFeatures:['account_registration','people_search']}).success).toBe(false)
  })

  it('allows synthetic data only behind an explicit non-production flag',()=>{expect(isSyntheticModeAllowed({CONTROLLED_BETA_SYNTHETIC_MODE:'enabled',VERCEL_ENV:'preview'})).toBe(true);expect(isSyntheticModeAllowed({CONTROLLED_BETA_SYNTHETIC_MODE:'enabled',VERCEL_ENV:'production'})).toBe(false);expect(isSyntheticModeAllowed({VERCEL_ENV:'preview'})).toBe(false)})
  it('fails readiness closed on privacy, health, RLS, urgent work or live payment',()=>{expect(assessBetaReadiness({healthOk:false,rlsOk:true,openUrgentTasks:0,privacyIncidents:0,paymentLive:false,lifecycleComplete:true})).toBe('blocked');expect(assessBetaReadiness({healthOk:true,rlsOk:true,openUrgentTasks:1,privacyIncidents:0,paymentLive:false,lifecycleComplete:true})).toBe('internal_only');expect(assessBetaReadiness({healthOk:true,rlsOk:true,openUrgentTasks:0,privacyIncidents:0,paymentLive:false,lifecycleComplete:true})).toBe('limited_beta')})
})
