import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
const env = { ...process.env }
if (required.some(key => !env[key])) throw new Error('PHASE10P_CROSS_DIRECT_TCP_CONFIG_MISSING')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
function worker() { const child=fork(workerPath,[],{env,silent:true}); const state={child,ready:null,result:null,error:null,exit:null}; child.on('message',m=>{if(m?.type==='READY')state.ready=m;else if(m?.type==='RESULT')state.result=m;else if(m?.type==='ERROR')state.error=m}); child.on('exit',c=>{state.exit=c}); return state }
async function waitFor(predicate,workers,label,timeout=45_000){const deadline=Date.now()+timeout;while(!predicate()){const failure=workers.find(x=>x.error||(x.exit!==null&&!x.result));if(failure||Date.now()>=deadline){workers.filter(x=>x.exit===null).forEach(x=>x.child.kill('SIGTERM'));throw new Error(`PHASE10P_CROSS_${label}_${failure?.error?.code??failure?.exit??'TIMEOUT'}`)}await new Promise(r=>setTimeout(r,10))}}
async function run(sql,label){const w=worker();await waitFor(()=>w.ready,[w],`${label}_READY`);w.child.send({type:'GO',sql});await waitFor(()=>w.result&&w.exit===0,[w],`${label}_RESULT`);return w.result}

const consumer=worker(), adopter=worker(), workers=[consumer,adopter]
await waitFor(()=>consumer.ready&&adopter.ready,workers,'READY')
if(consumer.ready.workerPid===adopter.ready.workerPid||consumer.ready.backendPid===adopter.ready.backendPid)throw new Error('PHASE10P_CROSS_NOT_INDEPENDENT')

const digest="decode(repeat('d1',32),'hex')"
const subject="'slb:v1:k01:google:'||translate(rtrim(encode("+digest+",'base64'),'='),'+/','-_')"
const recoveryBaseline=await run(`SELECT (SELECT count(*) FROM private.recovery_email_verifications)::text AS verifications,(SELECT count(*) FROM private.recovery_delivery_attempts)::text AS deliveries;`,'RECOVERY_BASELINE')
consumer.child.send({type:'GO',sql:`
BEGIN;
DO $$ BEGIN IF (SELECT expires_at<=clock_timestamp() FROM private.broker_authorization_codes WHERE id='75000000-0000-4000-8000-000000000005') THEN RAISE EXCEPTION 'PHASE10P_CROSS_CODE_NOT_LIVE'; END IF; END $$;
SELECT outcome FROM public.consume_broker_authorization_code(decode(repeat('dc',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback',repeat('Q',43));
SELECT pg_sleep(15);
INSERT INTO auth.users(id,email) VALUES('75000000-0000-4000-8000-000000000006',NULL);
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES('75000000-0000-4000-8000-000000000007','75000000-0000-4000-8000-000000000006',${subject},'custom:schoollove-google',jsonb_build_object('sub',${subject}));
SELECT public.bind_social_auth_principal_from_attempt((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_cross_source'),'75000000-0000-4000-8000-000000000006') AS bind_outcome;
COMMIT;
SELECT 'CONSUME_AND_BIND_COMMITTED' AS completion;
`})

await new Promise(resolve=>setTimeout(resolve,12_500))
adopter.child.send({type:'GO',sql:`SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_cross_candidate'),'76000000-0000-4000-8000-000000000002','google',${subject},${digest},1) AS outcome;`})
await waitFor(()=>consumer.result&&adopter.result&&consumer.exit===0&&adopter.exit===0,workers,'RESULT')

const consumerOutcomes=consumer.result.rows.map(row=>row.outcome??row.bind_outcome??row.completion).filter(Boolean)
if(!consumerOutcomes.includes('AUTHORIZATION_CODE_CONSUMED')||!consumerOutcomes.includes('AUTH_PRINCIPAL_BOUND')||!consumerOutcomes.includes('CONSUME_AND_BIND_COMMITTED'))throw new Error('PHASE10P_CROSS_CONSUMER_PATH')
if(adopter.result.rows[0]?.outcome!=='IDENTITY_DECISION_IN_PROGRESS')throw new Error(`PHASE10P_CROSS_ADOPTER_${adopter.result.rows[0]?.outcome??'MISSING'}`)

const read=await run(`SELECT
  (SELECT state FROM private.broker_authorization_codes WHERE id='75000000-0000-4000-8000-000000000005') AS source_code_state,
  (SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_cross_source') AS source_attempt_state,
  (SELECT status FROM private.downstream_authorization_transactions WHERE id='75000000-0000-4000-8000-000000000001') AS source_tx_state,
  (SELECT status FROM private.upstream_login_legs WHERE id='75000000-0000-4000-8000-000000000002') AS source_leg_state,
  (SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_cross_candidate') AS candidate_state,
  (SELECT account_id IS NULL FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_cross_candidate')::text AS candidate_unadopted,
  (SELECT count(*) FROM private.private_accounts WHERE id='75000000-0000-4000-8000-000000000004')::text AS accounts,
  (SELECT count(*) FROM private.social_identity_registry WHERE broker_subject=${subject})::text AS identities,
  (SELECT count(*) FROM auth.users)::text AS auth_users,
  (SELECT count(*) FROM auth.identities)::text AS auth_identities,
  (SELECT count(*) FROM private.broker_authorization_codes GROUP BY authorization_transaction_id HAVING count(*)>1)::text AS duplicate_codes;`,'READBACK')
const row=read.rows[0]
if(row?.source_code_state!=='consumed'||row?.source_attempt_state!=='consumed'||row?.source_tx_state!=='consumed'||row?.source_leg_state!=='verified'||row?.candidate_state!=='failed_safe'||row?.candidate_unadopted!=='true'||row?.accounts!=='1'||row?.identities!=='1'||row?.auth_users!=='1'||row?.auth_identities!=='1'||row?.duplicate_codes!==null)throw new Error('PHASE10P_CROSS_READBACK')

process.stdout.write(`PHASE10P_PROVISIONAL_RESUME_TOKEN_BIND_CROSS_PATH_OK consumer_backend=${consumer.ready.backendPid} adopter_backend=${adopter.ready.backendPid} consume_bind_winners=1 safe_resume_losers=1 accounts=1 identities=1 auth_principals=1 duplicate_codes=0 deadlocks=0 raw_unique_violations=0\n`)

const waitDigest="decode(repeat('f1',32),'hex')"
const waitSubject="'slb:v1:k01:google:'||translate(rtrim(encode("+waitDigest+",'base64'),'='),'+/','-_')"
const candidateSetup=await run(`
DO $$ BEGIN
  IF (SELECT expires_at>clock_timestamp() FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_source_01')
    OR (SELECT expires_at>clock_timestamp() FROM private.broker_authorization_codes WHERE id='77000000-0000-4000-8000-000000000005')
  THEN RAISE EXCEPTION 'PHASE10P_WAIT_SOURCE_NOT_EXPIRED'; END IF;
END $$;
SELECT public.create_social_login_attempt('att_10p_wait_candidate_01','google',clock_timestamp()+interval '12 seconds');
SELECT public.create_downstream_authorization_transaction('78000000-0000-4000-8000-000000000001',(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_candidate_01'),decode(repeat('fd',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('W',43),'S256',NULL,'wait-candidate',clock_timestamp()+interval '11 seconds');
SELECT public.claim_downstream_authorization_transaction_by_handle(decode(repeat('fd',32),'hex'));
SELECT public.create_upstream_login_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_candidate_01'),'78000000-0000-4000-8000-000000000002','google',decode(repeat('fe',32),'hex'),decode(repeat('ff',32),'hex'),decode(repeat('01',32),'hex'),repeat('X',43),decode(repeat('02',17),'hex'),decode(repeat('03',12),'hex'),1);
SELECT public.bind_downstream_authorization_transaction_upstream_leg('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000002');
SELECT public.claim_upstream_login_callback_by_state('google',decode(repeat('fe',32),'hex'),decode(repeat('ff',32),'hex'));
SELECT 'TARGET_CANDIDATE_READY' AS completion;
`,'TARGET_CANDIDATE_SETUP')
if(!candidateSetup.rows.some(row=>row.completion==='TARGET_CANDIDATE_READY'))throw new Error('PHASE10P_WAIT_CANDIDATE_SETUP')

const locker=worker(), expiringCandidate=worker(), expiryWorkers=[locker,expiringCandidate]
await waitFor(()=>locker.ready&&expiringCandidate.ready,expiryWorkers,'TARGET_EXPIRY_READY')
if(locker.ready.workerPid===expiringCandidate.ready.workerPid||locker.ready.backendPid===expiringCandidate.ready.backendPid)throw new Error('PHASE10P_WAIT_NOT_INDEPENDENT')
locker.child.send({type:'GO',sql:`BEGIN; SELECT id FROM private.broker_authorization_codes WHERE id='77000000-0000-4000-8000-000000000005' FOR UPDATE; SELECT pg_sleep(15); COMMIT; SELECT 'SOURCE_CODE_LOCK_RELEASED' AS completion;`})
await new Promise(resolve=>setTimeout(resolve,500))
const waitStarted=Date.now()
expiringCandidate.child.send({type:'GO',sql:`SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_candidate_01'),'78000000-0000-4000-8000-000000000002','google',${waitSubject},${waitDigest},1) AS outcome;`})
await waitFor(()=>locker.result&&expiringCandidate.result&&locker.exit===0&&expiringCandidate.exit===0,expiryWorkers,'TARGET_EXPIRY_RESULT')
const waitMs=Date.now()-waitStarted
if(!locker.result.rows.some(row=>row.completion==='SOURCE_CODE_LOCK_RELEASED'))throw new Error('PHASE10P_WAIT_LOCKER_RESULT')
if(expiringCandidate.result.rows[0]?.outcome!=='EXPIRED'||waitMs<10_000)throw new Error(`PHASE10P_WAIT_TARGET_${expiringCandidate.result.rows[0]?.outcome??'MISSING'}_${waitMs}`)

const expiryRead=await run(`SELECT
  (SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_source_01') AS source_attempt_state,
  (SELECT state FROM private.broker_authorization_codes WHERE id='77000000-0000-4000-8000-000000000005') AS source_code_state,
  (SELECT status FROM private.private_accounts WHERE id='77000000-0000-4000-8000-000000000004') AS account_state,
  (SELECT auth_user_id IS NULL FROM private.private_accounts WHERE id='77000000-0000-4000-8000-000000000004')::text AS account_unbound,
  (SELECT status FROM private.social_identity_registry WHERE broker_subject=${waitSubject}) AS identity_state,
  (SELECT auth_user_id IS NULL FROM private.social_identity_registry WHERE broker_subject=${waitSubject})::text AS identity_unbound,
  (SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_candidate_01') AS candidate_state,
  (SELECT account_id IS NULL FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_candidate_01')::text AS candidate_account_null,
  (SELECT status FROM private.downstream_authorization_transactions WHERE id='78000000-0000-4000-8000-000000000001') AS candidate_tx_state,
  (SELECT downstream_nonce IS NULL AND downstream_state IS NULL FROM private.downstream_authorization_transactions WHERE id='78000000-0000-4000-8000-000000000001')::text AS candidate_tx_scrubbed,
  (SELECT status FROM private.upstream_login_legs WHERE id='78000000-0000-4000-8000-000000000002') AS candidate_leg_state,
  (SELECT count(*) FROM private.private_accounts WHERE id='77000000-0000-4000-8000-000000000004')::text AS accounts,
  (SELECT count(*) FROM private.social_identity_registry WHERE broker_subject=${waitSubject})::text AS identities;`,'TARGET_EXPIRY_READBACK')
const expiryRow=expiryRead.rows[0]
if(expiryRow?.source_attempt_state!=='broker_code_ready'||expiryRow?.source_code_state!=='ready'||expiryRow?.account_state!=='provisional'||expiryRow?.account_unbound!=='true'||expiryRow?.identity_state!=='provisional'||expiryRow?.identity_unbound!=='true'||expiryRow?.candidate_state!=='expired'||expiryRow?.candidate_account_null!=='true'||expiryRow?.candidate_tx_state!=='expired'||expiryRow?.candidate_tx_scrubbed!=='true'||expiryRow?.candidate_leg_state!=='expired'||expiryRow?.accounts!=='1'||expiryRow?.identities!=='1')throw new Error('PHASE10P_WAIT_SOURCE_OR_TARGET_CORRUPTED')

const third=await run(`
SELECT public.create_social_login_attempt('att_10p_wait_third_01','google',clock_timestamp()+interval '10 minutes');
SELECT public.create_downstream_authorization_transaction('79000000-0000-4000-8000-000000000001',(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_third_01'),decode(repeat('04',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('Y',43),'S256',NULL,'wait-third',clock_timestamp()+interval '5 minutes');
SELECT public.claim_downstream_authorization_transaction_by_handle(decode(repeat('04',32),'hex'));
SELECT public.create_upstream_login_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_third_01'),'79000000-0000-4000-8000-000000000002','google',decode(repeat('05',32),'hex'),decode(repeat('06',32),'hex'),decode(repeat('07',32),'hex'),repeat('Z',43),decode(repeat('08',17),'hex'),decode(repeat('09',12),'hex'),1);
SELECT public.bind_downstream_authorization_transaction_upstream_leg('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000002');
SELECT public.claim_upstream_login_callback_by_state('google',decode(repeat('05',32),'hex'),decode(repeat('06',32),'hex'));
SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_third_01'),'79000000-0000-4000-8000-000000000002','google',${waitSubject},${waitDigest},1) AS resume_outcome;
SELECT outcome AS issue_outcome FROM public.issue_transaction_bound_broker_authorization_code('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000003',decode(repeat('0a',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL);
`,'THIRD_RESUME')
if(!third.rows.some(row=>row.resume_outcome==='PROVISIONAL_RESUME_READY')||!third.rows.some(row=>row.issue_outcome==='AUTHORIZATION_CODE_CREATED'))throw new Error('PHASE10P_WAIT_THIRD_RESUME')

const final=await run(`SELECT
  (SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_source_01') AS source_attempt_state,
  (SELECT state FROM private.broker_authorization_codes WHERE id='77000000-0000-4000-8000-000000000005') AS source_code_state,
  (SELECT state FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_wait_third_01') AS third_state,
  (SELECT count(*) FROM private.private_accounts WHERE id='77000000-0000-4000-8000-000000000004')::text AS accounts,
  (SELECT count(*) FROM private.social_identity_registry WHERE broker_subject=${waitSubject})::text AS identities,
  (SELECT count(*) FROM private.recovery_email_verifications)::text AS verifications,
  (SELECT count(*) FROM private.recovery_delivery_attempts)::text AS deliveries,
  (SELECT count(*) FROM private.broker_authorization_codes GROUP BY authorization_transaction_id HAVING count(*)>1)::text AS duplicate_codes;`,'TARGET_FINAL')
const finalRow=final.rows[0]
if(finalRow?.source_attempt_state!=='expired'||finalRow?.source_code_state!=='expired'||finalRow?.third_state!=='broker_code_ready'||finalRow?.accounts!=='1'||finalRow?.identities!=='1'||finalRow?.verifications!==recoveryBaseline.rows[0]?.verifications||finalRow?.deliveries!==recoveryBaseline.rows[0]?.deliveries||finalRow?.duplicate_codes!==null)throw new Error('PHASE10P_WAIT_FINAL')

process.stdout.write(`PHASE10P_PROVISIONAL_RESUME_TARGET_EXPIRY_WAIT_OK locker_backend=${locker.ready.backendPid} candidate_backend=${expiringCandidate.ready.backendPid} wait_ms=${waitMs} source_preserved=1 expired_candidate_account_null=1 deadlocks=0 raw_unique_violations=0\n`)
process.stdout.write('PHASE10P_PROVISIONAL_RESUME_AFTER_TARGET_EXPIRY_OK third_resume_winners=1 accounts=1 identities=1 duplicate_codes=0 second_recovery_emails=0 second_otps=0\n')
