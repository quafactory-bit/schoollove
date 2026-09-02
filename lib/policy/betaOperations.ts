import { z } from 'zod'
import { betaFeatureKeys } from '@/lib/policy/operations'

export const betaReadinessStates = ['blocked','internal_only','limited_beta','beta_stable','launch_candidate'] as const
export const betaTaskTypes = ['beta_approval','onboarding_failure','report','block_review','deletion_request','advertiser_verification','advertiser_review','quote','payment_confirmation','ad_schedule','refund','cron_failure','outbox_failure','feedback','health_warning'] as const
export const requiredBetaStopConditions = ['PRIVACY_EXPOSURE','RLS_FAILURE','HEALTH_FAILURE'] as const
export const firstControlledBetaEnabledFeatures = ['account_registration','private_profile'] as const
export const peopleDiscoveryControlledBetaEnabledFeatures = ['people_search','connection_request'] as const
export const connectedInstagramControlledBetaEnabledFeatures = ['instagram_permission'] as const
export type ControlledBetaContractKind = 'account_private'|'people_discovery'|'connected_instagram'
export type BetaFeatureKey = typeof betaFeatureKeys[number]

const exactFeatureSet = (features:readonly BetaFeatureKey[],expected:readonly BetaFeatureKey[]) => {
  const unique=new Set(features)
  return features.length===expected.length&&unique.size===expected.length&&expected.every((feature)=>unique.has(feature))
}

export function classifyControlledBetaFeatureSet(features:readonly BetaFeatureKey[]):ControlledBetaContractKind|null {
  if(exactFeatureSet(features,firstControlledBetaEnabledFeatures)) return 'account_private'
  if(exactFeatureSet(features,peopleDiscoveryControlledBetaEnabledFeatures)) return 'people_discovery'
  if(exactFeatureSet(features,connectedInstagramControlledBetaEnabledFeatures)) return 'connected_instagram'
  return null
}

export function controlledBetaMaxUsers(contractKind:ControlledBetaContractKind):number {
  return contractKind==='connected_instagram'?3:20
}

export function assessControlledBetaFeatureContract(input:{
  snapshotFeatures:readonly BetaFeatureKey[]|null|undefined
  programFlags:readonly {feature_key:BetaFeatureKey;enabled:boolean}[]
  globalFlags:readonly {feature_key:BetaFeatureKey;enabled:boolean}[]
}) {
  const contractKind=input.snapshotFeatures?classifyControlledBetaFeatureSet(input.snapshotFeatures):null
  const expected=contractKind==='account_private'?firstControlledBetaEnabledFeatures
    :contractKind==='people_discovery'?peopleDiscoveryControlledBetaEnabledFeatures
    :contractKind==='connected_instagram'?connectedInstagramControlledBetaEnabledFeatures:null
  const enabled=input.programFlags.filter((flag)=>flag.enabled).map((flag)=>flag.feature_key)
  const programFlagsComplete=expected!==null
    && input.programFlags.length===betaFeatureKeys.length
    && exactFeatureSet(enabled,expected)
    && betaFeatureKeys.every((feature)=>input.programFlags.filter((flag)=>flag.feature_key===feature).length===1)
  const globalFeatureStopped=Boolean(expected?.some((feature)=>input.globalFlags.some((flag)=>flag.feature_key===feature&&!flag.enabled)))
  return {contractKind,programFlagsComplete,globalFeatureStopped}
}

export function assessControlledBetaInvitationEligibility(input:{
  snapshotFeatures:readonly BetaFeatureKey[]|null|undefined
  programFlags:readonly {feature_key:BetaFeatureKey;enabled:boolean}[]
  globalFlags:readonly {feature_key:BetaFeatureKey;enabled:boolean}[]
  snapshotBacked:boolean
  schoolAllowlistCount:number
  schoolContractMatches:boolean
  invitePolicy:{maxUsesPerInvite?:number;expiresInDays?:number}|null|undefined
  approvalWaitlistEnabled:boolean|null|undefined
  maxUsers:number|null|undefined
  startsAt:string|null
  endsAt:string|null
  status:string
  emergencyDisabledAt:string|null
  now?:number
}):boolean {
  const featureContract=assessControlledBetaFeatureContract({
    snapshotFeatures:input.snapshotFeatures,
    programFlags:input.programFlags,
    globalFlags:input.globalFlags,
  })
  const startsAt=input.startsAt?new Date(input.startsAt).getTime():NaN
  const endsAt=input.endsAt?new Date(input.endsAt).getTime():NaN
  const now=input.now??Date.now()
  return featureContract.contractKind!==null
    && input.maxUsers===controlledBetaMaxUsers(featureContract.contractKind)
    && featureContract.programFlagsComplete
    && !featureContract.globalFeatureStopped
    && input.snapshotBacked
    && input.schoolAllowlistCount===1
    && input.schoolContractMatches
    && input.invitePolicy?.maxUsesPerInvite===1
    && input.invitePolicy.expiresInDays===7
    && input.approvalWaitlistEnabled===true
    && Number.isFinite(startsAt)
    && Number.isFinite(endsAt)
    && now>=startsAt
    && now<endsAt
    && input.status==='active'
    && input.emergencyDisabledAt===null
}
export const controlledBetaSafeErrorCodes = [
  'TARGET_SCHOOL_REQUIRED','TARGET_SCHOOL_NOT_FOUND','INVALID_FIRST_BETA_FEATURE_SET','INVALID_CONTROLLED_BETA_FEATURE_SET',
  'INVALID_FIRST_BETA_INVITE_POLICY','INVALID_FIRST_BETA_CONTRACT','DRAFT_ALREADY_ACTIVATED',
  'PROGRAM_NOT_FOUND','PROGRAM_NOT_PAUSED','PROGRAM_NOT_CONFIGURABLE','PROGRAM_ALREADY_USED',
  'PROGRAM_SETUP_SNAPSHOT_REQUIRED','PROGRAM_SETUP_CONTRACT_INVALID','PROGRAM_SCHOOL_CONTRACT_INVALID',
  'PROGRAM_FEATURE_SET_INCOMPLETE','FRESH_READINESS_REQUIRED','REACTIVATION_REQUIRED',
  'PROGRAM_NOT_REACTIVATABLE','LEGACY_PROGRAM_REJECTED','LEGACY_OR_EMERGENCY_PROGRAM_REJECTED',
  'PROGRAM_UNAVAILABLE','PROGRAM_FULL','INVALID_FIRST_BETA_INVITE','INVITE_EXCEEDS_PROGRAM_END',
  'INVITE_POLICY_NOT_ACTIVE','MEMBER_NOT_PENDING_REVIEW','ADULT_CONSENT_REQUIRED',
  'INVITE_CONTRACT_INVALID','APPROVAL_POLICY_INVALID','SCHOOL_OUTSIDE_BETA_SCOPE',
  'SECOND_SCHOOL_NOT_ALLOWED','ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED',
  'CONNECTED_INSTAGRAM_PREREQUISITES_REQUIRED','CONNECTED_INSTAGRAM_APPROVAL_PREREQUISITES_REQUIRED',
] as const

const reasonCode = z.string().regex(/^[A-Z0-9_]{2,60}$/)
const safeOperatorText = z.string().trim().min(1).max(2000)
const safePagePath = z.string().trim().regex(/^\/[A-Za-z0-9_/-]*$/).max(300)

export function feedbackTextIsSafe(value: string): boolean {
  if (/https?:\/\/|www\.|@[A-Za-z0-9_.]{2,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return false
  if (/\b(?:\+?82[- ]?)?0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}\b/.test(value)) return false
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
}

export const BetaFeedbackSchema = z.object({
  programId: z.string().uuid(),
  kind: z.enum(['error','confusing','missing_feature','greeting_message','privacy','advertising','other']),
  description: z.string().trim().min(3).max(2000).refine(feedbackTextIsSafe, 'PERSONAL_OR_EXTERNAL_IDENTIFIER_NOT_ALLOWED'),
  pagePath: safePagePath,
  coarseBrowser: z.enum(['chrome','safari','edge','firefox','other']).optional(),
  coarseDevice: z.enum(['mobile','tablet','desktop','other']).optional(),
  safeErrorCode: reasonCode.optional(),
})

export const BetaSetupSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  draftKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,39}$/),
  name: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  maxUsers: z.number().int().min(1).max(1000),
  targetScope: z.string().trim().min(2).max(120),
  targetSchoolId: z.string().uuid().nullable(),
  enabledFeatures: z.array(z.enum(betaFeatureKeys)).max(betaFeatureKeys.length),
  invitePolicy: z.object({ maxUsesPerInvite:z.number().int().min(1).max(100), expiresInDays:z.number().int().min(1).max(30) }),
  approvalWaitlistEnabled: z.boolean(),
  stopConditions: z.record(z.string(),z.boolean()).refine((value)=>Object.keys(value).every((key)=>/^[A-Z0-9_]{2,60}$/.test(key))),
  operatorMemo: z.string().max(2000),
  status: z.enum(['draft','validated','archived']),
}).superRefine((value,context)=>{
  if (value.startsAt && value.endsAt && new Date(value.endsAt)<=new Date(value.startsAt)) context.addIssue({code:'custom',path:['endsAt'],message:'END_MUST_FOLLOW_START'})
  if (value.enabledFeatures.includes('messaging') && !value.enabledFeatures.includes('connection_request')) context.addIssue({code:'custom',path:['enabledFeatures'],message:'MESSAGING_REQUIRES_CONNECTIONS'})
  if (value.enabledFeatures.includes('connection_request') && !value.enabledFeatures.includes('people_search')) context.addIssue({code:'custom',path:['enabledFeatures'],message:'CONNECTIONS_REQUIRE_SEARCH'})
  for(const condition of requiredBetaStopConditions) if(value.stopConditions[condition]!==true) context.addIssue({code:'custom',path:['stopConditions',condition],message:'REQUIRED_STOP_CONDITION_MISSING'})
  if(!classifyControlledBetaFeatureSet(value.enabledFeatures)) context.addIssue({code:'custom',path:['enabledFeatures'],message:'INVALID_CONTROLLED_BETA_FEATURE_SET'})
  if(value.status==='validated') {
    if(!value.targetSchoolId) context.addIssue({code:'custom',path:['targetSchoolId'],message:'TARGET_SCHOOL_REQUIRED'})
    const contractKind=classifyControlledBetaFeatureSet(value.enabledFeatures)
    if(contractKind&&value.maxUsers!==controlledBetaMaxUsers(contractKind)) context.addIssue({code:'custom',path:['maxUsers'],message:contractKind==='connected_instagram'?'CONNECTED_INSTAGRAM_MAX_USERS_MUST_BE_3':'FIRST_BETA_MAX_USERS_MUST_BE_20'})
    if(!value.startsAt || !value.endsAt || new Date(value.endsAt).getTime()-new Date(value.startsAt).getTime()!==14*24*60*60*1000) context.addIssue({code:'custom',path:['endsAt'],message:'FIRST_BETA_DURATION_MUST_BE_14_DAYS'})
    if(value.invitePolicy.maxUsesPerInvite!==1 || value.invitePolicy.expiresInDays!==7) context.addIssue({code:'custom',path:['invitePolicy'],message:'INVALID_FIRST_BETA_INVITE_POLICY'})
    if(!value.approvalWaitlistEnabled) context.addIssue({code:'custom',path:['approvalWaitlistEnabled'],message:'APPROVAL_WAITLIST_REQUIRED'})
  }
})

export const BetaAdminActionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('save_setup'),setup:BetaSetupSchema}),
  z.object({action:z.literal('activate_setup'),draftId:z.string().uuid()}),
  z.object({action:z.literal('configure_features'),programId:z.string().uuid(),enabledFeatures:z.array(z.enum(betaFeatureKeys)).min(1).max(2).refine((value)=>classifyControlledBetaFeatureSet(value)!==null,'INVALID_CONTROLLED_BETA_FEATURE_SET')}),
  z.object({action:z.literal('start_program'),programId:z.string().uuid(),reason:reasonCode}),
  z.object({action:z.literal('reactivate_program'),programId:z.string().uuid(),reason:reasonCode,resolutionCode:reasonCode}),
  z.object({action:z.literal('review_member'),memberId:z.string().uuid(),status:z.enum(['active','suspended','rejected','withdrawn']),reason:reasonCode}),
  z.object({action:z.literal('update_task'),taskId:z.string().uuid(),status:z.enum(['open','assigned','in_progress','resolved','dismissed']),priority:z.enum(['low','normal','high','urgent']),assignee:z.string().trim().min(1).max(100).nullable(),resolution:reasonCode.nullable()}),
  z.object({action:z.literal('create_task'),programId:z.string().uuid().nullable(),taskType:z.enum(betaTaskTypes),priority:z.enum(['low','normal','high','urgent']),summary:z.string().trim().min(1).max(300),dueAt:z.string().datetime().nullable()}),
  z.object({action:z.literal('create_note'),programId:z.string().uuid().nullable(),entityType:z.enum(['program','member','school','advertiser','feedback','task','incident']),entityId:z.string().uuid().nullable(),note:safeOperatorText}),
  z.object({action:z.literal('create_campaign'),programId:z.string().uuid(),schoolId:z.string().uuid().nullable(),campaignCode:z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/),channel:z.enum(['instagram','threads','x','tiktok','youtube','community','creator','direct','other']),inviteId:z.string().uuid().nullable(),nextAction:z.string().trim().max(300).nullable()}),
  z.object({action:z.literal('record_readiness'),programId:z.string().uuid().nullable(),status:z.enum(betaReadinessStates),criteria:z.record(z.string(),z.union([z.boolean(),z.number().int().nonnegative(),z.string().max(60)])),blockerCodes:z.array(reasonCode).max(30),operatorDecision:z.boolean()}),
  z.object({action:z.literal('stop'),scope:z.enum(['all','account_registration','private_profile','people_search','messaging','promotion_application','promotion_operations','invites']),reason:reasonCode}),
])

export function maskSmallAggregate(count: number, minimum = 10): { count:number|null; masked:boolean; label:string } {
  return count < minimum ? { count:null, masked:true, label:`${minimum}명 미만` } : { count, masked:false, label:String(count) }
}

export function isSyntheticModeAllowed(env?: { CONTROLLED_BETA_SYNTHETIC_MODE?:string; VERCEL_ENV?:string }): boolean {
  const source=env??{CONTROLLED_BETA_SYNTHETIC_MODE:process.env.CONTROLLED_BETA_SYNTHETIC_MODE,VERCEL_ENV:process.env.VERCEL_ENV}
  return source.CONTROLLED_BETA_SYNTHETIC_MODE === 'enabled' && source.VERCEL_ENV !== 'production'
}

export function assessBetaReadiness(input:{ healthOk:boolean; rlsOk:boolean; openUrgentTasks:number; privacyIncidents:number; paymentLive:boolean; lifecycleComplete:boolean }): typeof betaReadinessStates[number] {
  if (!input.healthOk || !input.rlsOk || input.privacyIncidents>0) return 'blocked'
  if (!input.lifecycleComplete || input.openUrgentTasks>0) return 'internal_only'
  if (input.paymentLive) return 'blocked'
  return 'limited_beta'
}

export const syntheticBetaScenario = Object.freeze({
  mode:'synthetic',
  users:[
    {ref:'TEST_BETA_USER_A',status:'active',stage:'ready'},
    {ref:'TEST_BETA_USER_B',status:'active',stage:'school_required'},
    {ref:'TEST_WAITLIST_USER',status:'pending_review',stage:'approval_pending'},
    {ref:'TEST_REJECTED_USER',status:'rejected',stage:'invite_required'},
  ],
  lifecycle:['invite','redeem','approve','onboarding','search','greeting','accept','message','advertiser_review','quote','manual_payment_review','schedule','aggregate_report'],
  counts:{profiles:0,payments:0,publicLaunches:0},
})
