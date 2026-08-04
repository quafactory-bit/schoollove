import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getPublicAccountAdminState } from '@/lib/publicAccountLaunch'

const MutationSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('set_state'),state:z.enum(['closed','internal_test','emergency_stopped']),reason:z.string().regex(/^[A-Z0-9_]{2,60}$/)}).strict(),
  z.object({action:z.literal('record_readiness'),reason:z.string().regex(/^[A-Z0-9_]{2,60}$/),commitSha:z.string().regex(/^[0-9a-f]{40}$/),migrationSha256:z.string().regex(/^[A-F0-9]{64}$/),checks:z.object({health:z.literal(true),rlsGrants:z.literal(true),authSmtp:z.literal(true),deletionOperator:z.literal(true),runtimeLogs:z.literal(true),preview:z.literal(true),isolatedDb:z.literal(true),permissions:z.literal(true),operatorDecision:z.literal('affirmative'),blockerCodes:z.array(z.string()).max(0)}).strict()}).strict(),
  z.object({action:z.literal('open'),reason:z.string().regex(/^[A-Z0-9_]{2,60}$/),readinessId:z.string().uuid(),commitSha:z.string().regex(/^[0-9a-f]{40}$/),migrationSha256:z.string().regex(/^[A-F0-9]{64}$/)}).strict(),
  z.object({action:z.literal('complete_deletion'),requestId:z.string().uuid(),reason:z.string().regex(/^[A-Z0-9_]{2,60}$/)}).strict(),
])

export async function GET(request:NextRequest){
  if(!(await requireAdminSession(request)))return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401})
  try{return NextResponse.json(await getPublicAccountAdminState(),{headers:{'Cache-Control':'private, no-store'}})}
  catch{return NextResponse.json({error:'PUBLIC_ACCOUNT_ADMIN_STATE_UNAVAILABLE'},{status:503})}
}

export async function PATCH(request:NextRequest){
  if(!(await requireAdminSession(request)))return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401})
  const parsed=MutationSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return NextResponse.json({error:'INVALID_PUBLIC_ACCOUNT_OPERATION'},{status:400})
  const admin=getSupabaseAdmin()
  if(parsed.data.action==='complete_deletion'){
    const prepared=await admin.rpc('admin_prepare_public_account_deletion',{target_request_id:parsed.data.requestId,requested_reason:parsed.data.reason,admin_actor:'admin_console'})
    if(prepared.error||(prepared.data as {public_data_deleted?:unknown}|null)?.public_data_deleted!==true)return NextResponse.json({error:'PUBLIC_ACCOUNT_DELETION_PREPARE_REJECTED'},{status:409})
    const authPending=await admin.rpc('admin_begin_public_account_auth_deletion',{target_request_id:parsed.data.requestId,admin_actor:'admin_console'})
    const userId=(authPending.data as {user_id?:unknown}|null)?.user_id
    if(authPending.error||typeof userId!=='string')return NextResponse.json({error:'PUBLIC_ACCOUNT_AUTH_DELETION_BEGIN_REJECTED'},{status:409})
    const deleted=await admin.auth.admin.deleteUser(userId,false)
    if(deleted.error){
      await admin.rpc('admin_mark_public_account_auth_deletion_failed',{target_request_id:parsed.data.requestId,requested_reason:'AUTH_PROVIDER_DELETE_FAILED',admin_actor:'admin_console'})
      return NextResponse.json({error:'AUTH_IDENTITY_DELETE_FAILED_RETRY_REQUIRED'},{status:503})
    }
    const finalized=await admin.rpc('admin_finalize_public_account_auth_deletion',{target_request_id:parsed.data.requestId,requested_reason:parsed.data.reason,admin_actor:'admin_console'})
    if(finalized.error||finalized.data!==true)return NextResponse.json({error:'PUBLIC_ACCOUNT_DELETION_FINALIZE_REJECTED'},{status:409})
    return NextResponse.json({ok:true})
  }
  const operation=parsed.data.action==='set_state'
    ? await admin.rpc('admin_set_public_account_launch_state',{requested_state:parsed.data.state,requested_reason:parsed.data.reason,admin_actor:'admin_console'})
    : parsed.data.action==='record_readiness'
      ? await admin.rpc('admin_record_public_account_readiness',{requested_reason:parsed.data.reason,admin_actor:'admin_console',verified_commit_sha:parsed.data.commitSha,verified_migration_sha256:parsed.data.migrationSha256,blocker_count:parsed.data.checks.blockerCodes.length,verified_checks:{migration_version:'20260803120000',operator_decision:parsed.data.checks.operatorDecision,blocker_codes:parsed.data.checks.blockerCodes,preview:parsed.data.checks.preview,health:parsed.data.checks.health,rls_grants:parsed.data.checks.rlsGrants,auth_smtp:parsed.data.checks.authSmtp,deletion_operator:parsed.data.checks.deletionOperator,runtime_logs:parsed.data.checks.runtimeLogs,isolated_db:parsed.data.checks.isolatedDb,permissions:parsed.data.checks.permissions}})
      : await admin.rpc('admin_open_public_account_launch',{readiness_id:parsed.data.readinessId,requested_reason:parsed.data.reason,admin_actor:'admin_console',expected_commit_sha:parsed.data.commitSha,expected_migration_sha256:parsed.data.migrationSha256})
  if(operation.error||operation.data===false||operation.data===null)return NextResponse.json({error:'PUBLIC_ACCOUNT_OPERATION_REJECTED'},{status:409})
  return NextResponse.json({ok:true})
}
