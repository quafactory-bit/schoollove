import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { z } from 'zod'
import type { BetaAdminActionSchema } from '@/lib/policy/betaOperations'
import { maskSmallAggregate } from '@/lib/policy/betaOperations'
import { csvSafe } from '@/lib/policy/operations'

type AdminAction = z.infer<typeof BetaAdminActionSchema>

const actor = 'admin:controlled-beta'
const safeRef = (value:string) => `acct_${createHash('sha256').update(value).digest('hex').slice(0,10)}`
const rows = <T>(result:{data:T[]|null,error:unknown}) => { if(result.error) throw new Error('BETA_OPERATIONS_QUERY_FAILED'); return result.data ?? [] }

export async function getControlledBetaState() {
  const admin=getSupabaseAdmin()
  const [programsResult,draftsResult,membersResult,progressResult,feedbackResult,tasksResult,campaignsResult,aggregatesResult,readinessResult,requestsResult,ordersResult,incidentsResult] = await Promise.all([
    admin.from('beta_programs').select('id,program_key,name,status,requires_admin_approval,starts_at,ends_at,emergency_disabled_at,updated_at').order('created_at'),
    admin.from('beta_setup_drafts').select('id,draft_key,name,starts_at,ends_at,max_users,target_scope,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,operator_memo,status,updated_at').order('updated_at',{ascending:false}).limit(20),
    admin.from('beta_members').select('id,program_id,user_id,status,enrolled_at,reviewed_at,reason_code,updated_at').order('enrolled_at',{ascending:false}).limit(200),
    admin.from('beta_onboarding_progress').select('program_id,user_id,stage_key,source_channel,last_synced_at').order('last_synced_at',{ascending:false}).limit(200),
    admin.from('beta_feedback').select('id,program_id,kind,description,page_path,coarse_browser,coarse_device,safe_error_code,status,priority,assigned_to,resolution_code,created_at').order('created_at',{ascending:false}).limit(200),
    admin.from('beta_operation_tasks').select('id,program_id,task_type,priority,status,entity_type,entity_id,due_at,assigned_to,safe_summary,resolution_code,created_at,updated_at').order('created_at',{ascending:false}).limit(200),
    admin.from('beta_campaigns').select('id,program_id,school_id,campaign_code,channel,status,invite_id,next_action,starts_at,ends_at,updated_at').order('updated_at',{ascending:false}).limit(200),
    admin.from('beta_campaign_aggregates').select('campaign_id,metric_date,metric_key,segment_key,metric_count,masked').order('metric_date',{ascending:false}).limit(500),
    admin.from('beta_readiness_snapshots').select('id,program_id,status,criteria,blocker_codes,operator_decision,decided_by,created_at').order('created_at',{ascending:false}).limit(30),
    admin.from('promotion_requests').select('id,status,requested_placement,submitted_at,updated_at,school_id').order('submitted_at',{ascending:false}).limit(100),
    admin.from('promotion_commercial_orders').select('id,request_id,status,total_krw,payment_provider,payment_due_at,updated_at').order('updated_at',{ascending:false}).limit(100),
    admin.from('operational_incidents').select('id,incident_key,severity,status,safe_summary,created_at,resolved_at').order('created_at',{ascending:false}).limit(100),
  ])
  const progress=rows(progressResult)
  const progressByUser=new Map(progress.map((item:any)=>[`${item.program_id}:${item.user_id}`,item]))
  const members=rows(membersResult).map((item:any)=>({id:item.id,program_id:item.program_id,account_ref:safeRef(item.user_id),status:item.status,enrolled_at:item.enrolled_at,reviewed_at:item.reviewed_at,reason_code:item.reason_code,updated_at:item.updated_at,stage:progressByUser.get(`${item.program_id}:${item.user_id}`)?.stage_key ?? 'invite_required'}))
  const statusCounts=members.reduce<Record<string,number>>((acc,item)=>{acc[item.status]=(acc[item.status]??0)+1;return acc},{})
  return {
    programs:rows(programsResult), drafts:rows(draftsResult), members,
    memberSummary:Object.fromEntries(Object.entries(statusCounts).map(([key,value])=>[key,maskSmallAggregate(value)])),
    feedback:rows(feedbackResult), tasks:rows(tasksResult), campaigns:rows(campaignsResult), aggregates:rows(aggregatesResult), readiness:rows(readinessResult),
    advertisers:{requests:rows(requestsResult),orders:rows(ordersResult)}, incidents:rows(incidentsResult),
    privacy:{minimumAggregate:10,rawNames:false,rawEmails:false,rawInstagram:false,rawQueries:false,rawMessages:false},
  }
}
export async function applyControlledBetaAction(operation:AdminAction) {
  const admin=getSupabaseAdmin()
  if(operation.action==='save_setup') {
    const setup=operation.setup
    const {data,error}=await admin.rpc('admin_save_beta_setup',{target_draft_id:setup.id??null,requested_draft_key:setup.draftKey,requested_name:setup.name,requested_starts_at:setup.startsAt,requested_ends_at:setup.endsAt,requested_max_users:setup.maxUsers,requested_target_scope:setup.targetScope,requested_features:setup.enabledFeatures,requested_invite_policy:setup.invitePolicy,requested_waitlist:setup.approvalWaitlistEnabled,requested_stop_conditions:setup.stopConditions,requested_memo:setup.operatorMemo,requested_status:setup.status,admin_actor:actor})
    if(error) throw new Error('SETUP_SAVE_FAILED'); return {id:data}
  }
  if(operation.action==='activate_setup') { const {data,error}=await admin.rpc('admin_activate_beta_setup',{target_draft_id:operation.draftId,admin_actor:actor});if(error)throw new Error('SETUP_ACTIVATION_FAILED');return{id:data,status:'paused'} }
  if(operation.action==='review_member') { const {error}=await admin.rpc('admin_review_beta_member',{target_member_id:operation.memberId,requested_status:operation.status,requested_reason:operation.reason,admin_actor:actor});if(error)throw new Error('MEMBER_REVIEW_FAILED');return{applied:true} }
  if(operation.action==='update_task') { const {error}=await admin.rpc('admin_update_beta_task',{target_task_id:operation.taskId,requested_status:operation.status,requested_priority:operation.priority,requested_assignee:operation.assignee,requested_resolution:operation.resolution,admin_actor:actor});if(error)throw new Error('TASK_UPDATE_FAILED');return{applied:true} }
  if(operation.action==='stop') { const {data,error}=await admin.rpc('admin_controlled_beta_stop',{requested_scope:operation.scope,requested_reason:operation.reason,admin_actor:actor});if(error)throw new Error('STOP_FAILED');return{affected:data} }
  const functionName={create_task:'admin_create_beta_task',create_note:'admin_create_beta_note',create_campaign:'admin_create_beta_campaign',record_readiness:'admin_record_beta_readiness'}[operation.action]
  const params=operation.action==='create_task'?{target_program_id:operation.programId,requested_task_type:operation.taskType,requested_priority:operation.priority,requested_summary:operation.summary,requested_due_at:operation.dueAt,admin_actor:actor}:operation.action==='create_note'?{target_program_id:operation.programId,requested_entity_type:operation.entityType,requested_entity_id:operation.entityId,requested_note:operation.note,admin_actor:actor}:operation.action==='create_campaign'?{target_program_id:operation.programId,target_school_id:operation.schoolId,requested_campaign_code:operation.campaignCode,requested_channel:operation.channel,target_invite_id:operation.inviteId,requested_next_action:operation.nextAction,admin_actor:actor}:{target_program_id:operation.programId,requested_status:operation.status,requested_criteria:operation.criteria,requested_blockers:operation.blockerCodes,requested_operator_decision:operation.operatorDecision,admin_actor:actor}
  const {data,error}=await admin.rpc(functionName,params)
  if(error) throw new Error('BETA_OPERATION_FAILED')
  return {id:data}
}

export async function buildControlledBetaDailyReport(format:'json'|'csv') {
  const state=await getControlledBetaState()
  const report={generated_at:new Date().toISOString(),programs:state.programs.length,members:state.memberSummary,feedback_open:state.feedback.filter((item:any)=>item.status!=='resolved'&&item.status!=='dismissed').length,tasks_open:state.tasks.filter((item:any)=>!['resolved','dismissed'].includes(item.status)).length,advertiser_requests:state.advertisers.requests.length,advertiser_orders:state.advertisers.orders.length,incidents_open:state.incidents.filter((item:any)=>item.status!=='resolved').length,minimum_segment:10}
  if(format==='json') return {contentType:'application/json',body:JSON.stringify(report)}
  const lines=[['metric','value'],...Object.entries(report).map(([key,value])=>[key,typeof value==='object'?JSON.stringify(value):String(value)])]
  return {contentType:'text/csv; charset=utf-8',body:'\uFEFF'+lines.map(row=>row.map(csvSafe).join(',')).join('\r\n')}
}
