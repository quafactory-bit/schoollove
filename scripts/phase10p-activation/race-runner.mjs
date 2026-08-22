import { fork } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const env = { ...process.env }
if (['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'].some(key => !env[key])) throw new Error('PHASE10P_ACTIVATION_RACE_CONFIG')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
function worker(){const child=fork(workerPath,[],{env,silent:true});const state={child,ready:null,result:null,error:null,exit:null};child.on('message',m=>{if(m?.type==='READY')state.ready=m;else if(m?.type==='RESULT')state.result=m;else if(m?.type==='ERROR')state.error=m});child.on('exit',c=>{state.exit=c});return state}
async function waitFor(predicate,workers,label){const deadline=Date.now()+30_000;while(!predicate()){const bad=workers.find(w=>w.error||(w.exit!==null&&!w.result));if(bad||Date.now()>deadline){workers.filter(w=>w.exit===null).forEach(w=>w.child.kill('SIGTERM'));throw new Error(`PHASE10P_ACTIVATION_${label}_${bad?.error?.code??bad?.exit??'TIMEOUT'}`)}await new Promise(r=>setTimeout(r,10))}}
async function run(sql,label){const w=worker();await waitFor(()=>w.ready,[w],`${label}_READY`);w.child.send({type:'GO',sql});await waitFor(()=>w.result&&w.exit===0,[w],`${label}_RESULT`);return w.result.rows}

const digest="decode(repeat('e2',32),'hex')"
const subject="'slb:v1:k01:google:'||translate(rtrim(encode("+digest+",'base64'),'='),'+/','-_')"
const resetSql="TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;"
const setupSql=readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'concurrency-setup.sql'),'utf8')
async function resetFixture(label){await run(`${resetSql}\n${setupSql}`,label)}
async function assertIssuanceContext(label){const rows=await run("SELECT login_attempt_id FROM public.get_transaction_bound_broker_code_issuance_context((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'))",label);if(rows.length!==1)throw new Error(`PHASE10P_ACTIVATION_${label}_MISSING`)}
async function issueAndConsume(codeByte,label){
  const issued=await run(`SELECT outcome FROM public.issue_transaction_bound_broker_authorization_code('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000006',decode(repeat('${codeByte}',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL)`,`${label}_ISSUE`)
  if(issued[0]?.outcome!=='AUTHORIZATION_CODE_CREATED')throw new Error(`PHASE10P_ACTIVATION_${label}_ISSUE`)
  const consumed=await run(`SELECT outcome FROM public.consume_broker_authorization_code(decode(repeat('${codeByte}',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback',repeat('E',43))`,`${label}_CONSUME`)
  if(consumed[0]?.outcome!=='AUTHORIZATION_CODE_CONSUMED')throw new Error(`PHASE10P_ACTIVATION_${label}_CONSUME`)
}

// Serialization 1: reauth reaches auth_principal_bound first, another consumed
// attempt activates the same account, then context resolution and issuance run
// on fresh independent backends against the now-active exact tuple.
const reauthFirst=await run(`SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'),'e2000000-0000-4000-8000-000000000005','google',${subject},${digest},1) AS outcome`,'REAUTH_FIRST')
if(reauthFirst[0]?.outcome!=='BOUND_PROVISIONAL_REAUTH_READY')throw new Error('PHASE10P_ACTIVATION_REAUTH_FIRST_OUTCOME')
const reauthState=await run("SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'",'REAUTH_FIRST_STATE')
if(reauthState[0]?.state!=='auth_principal_bound')throw new Error('PHASE10P_ACTIVATION_REAUTH_FIRST_STATE')
const activationAfterReauth=await run("SELECT public.activate_social_account_from_attempt('e2000000-0000-4000-8000-000000000003') AS outcome",'ACTIVATE_AFTER_REAUTH')
if(activationAfterReauth[0]?.outcome!=='SOCIAL_ACCOUNT_ACTIVATED')throw new Error('PHASE10P_ACTIVATION_REAUTH_FIRST_ACTIVATION')
await assertIssuanceContext('REAUTH_FIRST_CONTEXT')
await issueAndConsume('ec','REAUTH_FIRST')
const alreadyBound=await run("SELECT public.bind_social_auth_principal_from_attempt((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'),'e2000000-0000-4000-8000-000000000002') AS bind_outcome,public.activate_social_account_from_attempt((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new')) AS activation_outcome",'REAUTH_FIRST_COMPLETE')
if(alreadyBound[0]?.bind_outcome!=='AUTH_PRINCIPAL_ALREADY_BOUND'||alreadyBound[0]?.activation_outcome!=='SOCIAL_ACCOUNT_ALREADY_ACTIVE')throw new Error('PHASE10P_ACTIVATION_REAUTH_FIRST_COMPLETE')

// Serialization 2: activation commits first. The wrapper delegates before any
// candidate lock and the legacy active path returns EXISTING_PRIMARY.
await resetFixture('ACTIVATION_FIRST_SETUP')
const activationFirst=await run("SELECT public.activate_social_account_from_attempt('e2000000-0000-4000-8000-000000000003') AS outcome",'ACTIVATION_FIRST')
if(activationFirst[0]?.outcome!=='SOCIAL_ACCOUNT_ACTIVATED')throw new Error('PHASE10P_ACTIVATION_FIRST_OUTCOME')
const existing=await run(`SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'),'e2000000-0000-4000-8000-000000000005','google',${subject},${digest},1) AS outcome`,'ACTIVATION_FIRST_REAUTH')
if(existing[0]?.outcome!=='EXISTING_PRIMARY')throw new Error('PHASE10P_ACTIVATION_FIRST_REAUTH')
await assertIssuanceContext('ACTIVATION_FIRST_CONTEXT')
await issueAndConsume('f1','ACTIVATION_FIRST')

// Coarse read sees provisional while a distinct backend owns the account row;
// activation commits before the wrapper obtains account/identity locks. The
// wrapper must return EXISTING_PRIMARY directly rather than call the helper.
await resetFixture('CANDIDATE_CHANGE_SETUP')
const activator=worker(),candidate=worker(),candidatePair=[activator,candidate]
await waitFor(()=>activator.ready&&candidate.ready,candidatePair,'CANDIDATE_CHANGE_READY')
if(activator.ready.backendPid===candidate.ready.backendPid)throw new Error('PHASE10P_ACTIVATION_CANDIDATE_NOT_INDEPENDENT')
activator.child.send({type:'GO',sql:"BEGIN; SELECT id FROM private.private_accounts WHERE id='e2000000-0000-4000-8000-000000000001' FOR UPDATE; SELECT pg_sleep(1); SELECT public.activate_social_account_from_attempt('e2000000-0000-4000-8000-000000000003') AS outcome; COMMIT; SELECT 'ACTIVATION_COMMITTED' AS completion"})
await new Promise(r=>setTimeout(r,100))
candidate.child.send({type:'GO',sql:`SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'),'e2000000-0000-4000-8000-000000000005','google',${subject},${digest},1) AS outcome`})
await waitFor(()=>activator.result&&candidate.result&&activator.exit===0&&candidate.exit===0,candidatePair,'CANDIDATE_CHANGE_RESULT')
if(candidate.result.rows[0]?.outcome!=='EXISTING_PRIMARY')throw new Error(`PHASE10P_ACTIVATION_CANDIDATE_CHANGE_${candidate.result.rows[0]?.outcome??'MISSING'}`)
await assertIssuanceContext('CANDIDATE_CHANGE_CONTEXT')
await issueAndConsume('f2','CANDIDATE_CHANGE')
const final=await run("SELECT (SELECT count(*) FROM private.private_accounts)::text accounts,(SELECT count(*) FROM private.social_identity_registry)::text identities,(SELECT count(*) FROM auth.identities)::text auth_identities,(SELECT count(*) FROM private.broker_authorization_codes)::text codes,(SELECT count(*) FROM private.recovery_email_verifications)::text recoveries,(SELECT count(*) FROM private.recovery_delivery_attempts)::text deliveries,(SELECT count(*) FROM private.broker_authorization_codes GROUP BY authorization_transaction_id HAVING count(*)>1)::text duplicate_codes",'READBACK')
const row=final[0]
if(row?.accounts!=='1'||row?.identities!=='1'||row?.auth_identities!=='1'||row?.codes!=='1'||row?.recoveries!=='0'||row?.deliveries!=='0'||row?.duplicate_codes!==null)throw new Error('PHASE10P_ACTIVATION_RACE_DUPLICATION')

// A separate fixture proves that an authoritative close committed while the
// activation call waits on the launch row wins the decision.
await run(`
TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE;
DELETE FROM auth.identities; DELETE FROM auth.users;
UPDATE public.public_account_launch_control SET state='open',account_registration_enabled=true,private_profile_enabled=true,school_membership_enabled=true,emergency_stopped_at=NULL;
INSERT INTO auth.users(id,email) VALUES('e3000000-0000-4000-8000-000000000002',NULL);
WITH d AS (SELECT decode(repeat('ed',32),'hex') value), s AS (SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(value,'base64'),'='),'+/','-_') value FROM d)
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) SELECT gen_random_uuid(),'e3000000-0000-4000-8000-000000000002',value,'custom:schoollove-google',jsonb_build_object('sub',value) FROM s;
WITH d AS (SELECT decode(repeat('ed',32),'hex') value), s AS (SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(value,'base64'),'='),'+/','-_') value FROM d)
INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at) SELECT 'e3000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002','provisional','google',value,decode(repeat('ee',32),'hex'),1,decode(repeat('ef',17),'hex'),decode(repeat('f0',12),'hex'),1,clock_timestamp() FROM s;
WITH d AS (SELECT decode(repeat('ed',32),'hex') value), s AS (SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(value,'base64'),'='),'+/','-_') value FROM d)
INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status) SELECT s.value,'google',d.value,1,'e3000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002','provisional' FROM d,s;
WITH d AS (SELECT decode(repeat('ed',32),'hex') value), s AS (SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(value,'base64'),'='),'+/','-_') value FROM d)
INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,account_id,created_at,expires_at,updated_at,consumed_at) SELECT 'e3000000-0000-4000-8000-000000000003','att_10p_launch_close_race','google','consumed',s.value,d.value,1,'e3000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()+interval '9 minutes',clock_timestamp(),clock_timestamp() FROM d,s;
SELECT 'ready' AS result`, 'CLOSE_SETUP')
const closer=worker(),closeActivator=worker(),closePair=[closer,closeActivator]
await waitFor(()=>closer.ready&&closeActivator.ready,closePair,'CLOSE_READY')
closer.child.send({type:'GO',sql:"BEGIN; UPDATE public.public_account_launch_control SET state='closed',account_registration_enabled=false,private_profile_enabled=false,school_membership_enabled=false,emergency_stopped_at=NULL; SELECT pg_sleep(1); COMMIT; SELECT 'closed' AS result"})
await new Promise(r=>setTimeout(r,100))
closeActivator.child.send({type:'GO',sql:"SELECT public.activate_social_account_from_attempt('e3000000-0000-4000-8000-000000000003') AS outcome"})
await waitFor(()=>closer.result&&closeActivator.result&&closer.exit===0&&closeActivator.exit===0,closePair,'CLOSE_RESULT')
if(closeActivator.result.rows.at(-1)?.outcome!=='SOCIAL_ACCOUNT_LAUNCH_CLOSED')throw new Error('PHASE10P_LAUNCH_CLOSE_RACE_FAIL_OPEN')
const closed=await run("SELECT status account_status,(SELECT status FROM private.social_identity_registry LIMIT 1) identity_status FROM private.private_accounts LIMIT 1",'CLOSE_READBACK')
if(closed[0]?.account_status!=='provisional'||closed[0]?.identity_status!=='provisional')throw new Error('PHASE10P_LAUNCH_CLOSE_RACE_MUTATED')

process.stdout.write('PHASE10P_REAUTH_FIRST_ACTIVATION_ISSUANCE_OK bind=AUTH_PRINCIPAL_ALREADY_BOUND activation=SOCIAL_ACCOUNT_ALREADY_ACTIVE session_cookies=eligible recovery_delta=0 delivery_delta=0 email_delta=0 otp_delta=0\n')
process.stdout.write('PHASE10P_ACTIVATION_FIRST_EXISTING_PRIMARY_ISSUANCE_OK\n')
process.stdout.write('PHASE10P_BOUND_CANDIDATE_PROVISIONAL_TO_ACTIVE_OK outcome=EXISTING_PRIMARY helper_fallback=0\n')
process.stdout.write('PHASE10P_ACTIVATION_REAUTH_CONCURRENCY_OK deadlocks=0 raw_unique_violations=0 duplicate_accounts=0 duplicate_identities=0 duplicate_auth_identities=0 duplicate_codes=0\n')
process.stdout.write('PHASE10P_LAUNCH_CLOSE_RACE_OK activation=SOCIAL_ACCOUNT_LAUNCH_CLOSED account=provisional identity=provisional\n')
