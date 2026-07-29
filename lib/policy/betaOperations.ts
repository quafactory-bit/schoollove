import { z } from 'zod'
import { betaFeatureKeys } from '@/lib/policy/operations'

export const betaReadinessStates = ['blocked','internal_only','limited_beta','beta_stable','launch_candidate'] as const
export const betaTaskTypes = ['beta_approval','onboarding_failure','report','block_review','deletion_request','advertiser_verification','advertiser_review','quote','payment_confirmation','ad_schedule','refund','cron_failure','outbox_failure','feedback','health_warning'] as const

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
})

export const BetaAdminActionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('save_setup'),setup:BetaSetupSchema}),
  z.object({action:z.literal('activate_setup'),draftId:z.string().uuid()}),
  z.object({action:z.literal('review_member'),memberId:z.string().uuid(),status:z.enum(['active','suspended','rejected','withdrawn']),reason:reasonCode}),
  z.object({action:z.literal('update_task'),taskId:z.string().uuid(),status:z.enum(['open','assigned','in_progress','resolved','dismissed']),priority:z.enum(['low','normal','high','urgent']),assignee:z.string().trim().min(1).max(100).nullable(),resolution:reasonCode.nullable()}),
  z.object({action:z.literal('create_task'),programId:z.string().uuid().nullable(),taskType:z.enum(betaTaskTypes),priority:z.enum(['low','normal','high','urgent']),summary:z.string().trim().min(1).max(300),dueAt:z.string().datetime().nullable()}),
  z.object({action:z.literal('create_note'),programId:z.string().uuid().nullable(),entityType:z.enum(['program','member','school','advertiser','feedback','task','incident']),entityId:z.string().uuid().nullable(),note:safeOperatorText}),
  z.object({action:z.literal('create_campaign'),programId:z.string().uuid(),schoolId:z.string().uuid().nullable(),campaignCode:z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/),channel:z.enum(['instagram','threads','x','tiktok','youtube','community','creator','direct','other']),inviteId:z.string().uuid().nullable(),nextAction:z.string().trim().max(300).nullable()}),
  z.object({action:z.literal('record_readiness'),programId:z.string().uuid().nullable(),status:z.enum(betaReadinessStates),criteria:z.record(z.string(),z.union([z.boolean(),z.number().int().nonnegative(),z.string().max(60)])),blockerCodes:z.array(reasonCode).max(30),operatorDecision:z.boolean()}),
  z.object({action:z.literal('stop'),scope:z.enum(['all','people_search','messaging','promotion_application','promotion_operations','invites']),reason:reasonCode}),
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
