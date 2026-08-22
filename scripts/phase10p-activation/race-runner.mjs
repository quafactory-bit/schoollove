import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const env = { ...process.env }
if (['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'].some(key => !env[key])) throw new Error('PHASE10P_ACTIVATION_RACE_CONFIG')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
function worker(){const child=fork(workerPath,[],{env,silent:true});const state={child,ready:null,result:null,error:null,exit:null};child.on('message',m=>{if(m?.type==='READY')state.ready=m;else if(m?.type==='RESULT')state.result=m;else if(m?.type==='ERROR')state.error=m});child.on('exit',c=>{state.exit=c});return state}
async function waitFor(predicate,workers,label){const deadline=Date.now()+30_000;while(!predicate()){const bad=workers.find(w=>w.error||(w.exit!==null&&!w.result));if(bad||Date.now()>deadline){workers.filter(w=>w.exit===null).forEach(w=>w.child.kill('SIGTERM'));throw new Error(`PHASE10P_ACTIVATION_${label}_${bad?.error?.code??bad?.exit??'TIMEOUT'}`)}await new Promise(r=>setTimeout(r,10))}}
async function run(sql,label){const w=worker();await waitFor(()=>w.ready,[w],`${label}_READY`);w.child.send({type:'GO',sql});await waitFor(()=>w.result&&w.exit===0,[w],`${label}_RESULT`);return w.result.rows}

const left=worker(),right=worker(),pair=[left,right]
await waitFor(()=>left.ready&&right.ready,pair,'RACE_READY')
if(left.ready.backendPid===right.ready.backendPid)throw new Error('PHASE10P_ACTIVATION_NOT_INDEPENDENT')
const digest="decode(repeat('e2',32),'hex')"
const subject="'slb:v1:k01:google:'||translate(rtrim(encode("+digest+",'base64'),'='),'+/','-_')"
left.child.send({type:'GO',sql:"SELECT public.activate_social_account_from_attempt('e2000000-0000-4000-8000-000000000003') AS outcome"})
right.child.send({type:'GO',sql:`SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_activation_race_new'),'e2000000-0000-4000-8000-000000000005','google',${subject},${digest},1) AS outcome`})
await waitFor(()=>left.result&&right.result&&left.exit===0&&right.exit===0,pair,'RACE_RESULT')
const activation=left.result.rows[0]?.outcome, reauth=right.result.rows[0]?.outcome
if(activation!=='SOCIAL_ACCOUNT_ACTIVATED'||!['EXISTING_PRIMARY','BOUND_PROVISIONAL_REAUTH_READY'].includes(reauth))throw new Error(`PHASE10P_ACTIVATION_RACE_OUTCOME_${activation}_${reauth}`)
const issue=await run("SELECT outcome FROM public.issue_transaction_bound_broker_authorization_code('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000006',decode(repeat('ec',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL)",'ISSUE')
if(issue[0]?.outcome!=='AUTHORIZATION_CODE_CREATED')throw new Error('PHASE10P_ACTIVATION_RACE_ISSUE')
const final=await run("SELECT (SELECT count(*) FROM private.private_accounts)::text accounts,(SELECT count(*) FROM private.social_identity_registry)::text identities,(SELECT count(*) FROM auth.identities)::text auth_identities,(SELECT count(*) FROM private.broker_authorization_codes)::text codes,(SELECT status FROM private.private_accounts LIMIT 1) account_status,(SELECT status FROM private.social_identity_registry LIMIT 1) identity_status",'READBACK')
const row=final[0]
if(row?.accounts!=='1'||row?.identities!=='1'||row?.auth_identities!=='1'||row?.codes!=='1'||row?.account_status!=='active'||row?.identity_status!=='active')throw new Error('PHASE10P_ACTIVATION_RACE_DUPLICATION')

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
INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,account_id,consumed_at) SELECT 'e3000000-0000-4000-8000-000000000003','att_10p_launch_close_race','google','consumed',s.value,d.value,1,'e3000000-0000-4000-8000-000000000001',clock_timestamp() FROM d,s;
SELECT 'ready' AS result`, 'CLOSE_SETUP')
const closer=worker(),activator=worker(),closePair=[closer,activator]
await waitFor(()=>closer.ready&&activator.ready,closePair,'CLOSE_READY')
closer.child.send({type:'GO',sql:"BEGIN; UPDATE public.public_account_launch_control SET state='closed',account_registration_enabled=false,private_profile_enabled=false,school_membership_enabled=false,emergency_stopped_at=NULL; SELECT pg_sleep(1); COMMIT; SELECT 'closed' AS result"})
await new Promise(r=>setTimeout(r,100))
activator.child.send({type:'GO',sql:"SELECT public.activate_social_account_from_attempt('e3000000-0000-4000-8000-000000000003') AS outcome"})
await waitFor(()=>closer.result&&activator.result&&closer.exit===0&&activator.exit===0,closePair,'CLOSE_RESULT')
if(activator.result.rows.at(-1)?.outcome!=='SOCIAL_ACCOUNT_LAUNCH_CLOSED')throw new Error('PHASE10P_LAUNCH_CLOSE_RACE_FAIL_OPEN')
const closed=await run("SELECT status account_status,(SELECT status FROM private.social_identity_registry LIMIT 1) identity_status FROM private.private_accounts LIMIT 1",'CLOSE_READBACK')
if(closed[0]?.account_status!=='provisional'||closed[0]?.identity_status!=='provisional')throw new Error('PHASE10P_LAUNCH_CLOSE_RACE_MUTATED')

process.stdout.write(`PHASE10P_ACTIVATION_REAUTH_CONCURRENCY_OK activation=${activation} reauth=${reauth} deadlocks=0 raw_unique_violations=0 duplicate_accounts=0 duplicate_identities=0 duplicate_auth_identities=0 duplicate_codes=0\n`)
process.stdout.write('PHASE10P_LAUNCH_CLOSE_RACE_OK activation=SOCIAL_ACCOUNT_LAUNCH_CLOSED account=provisional identity=provisional\n')
