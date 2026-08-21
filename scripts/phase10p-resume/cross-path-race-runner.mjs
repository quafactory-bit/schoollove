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
  (SELECT count(*) FROM private.private_accounts)::text AS accounts,
  (SELECT count(*) FROM private.social_identity_registry)::text AS identities,
  (SELECT count(*) FROM auth.users)::text AS auth_users,
  (SELECT count(*) FROM auth.identities)::text AS auth_identities,
  (SELECT count(*) FROM private.broker_authorization_codes GROUP BY authorization_transaction_id HAVING count(*)>1)::text AS duplicate_codes;`,'READBACK')
const row=read.rows[0]
if(row?.source_code_state!=='consumed'||row?.source_attempt_state!=='consumed'||row?.source_tx_state!=='consumed'||row?.source_leg_state!=='verified'||row?.candidate_state!=='failed_safe'||row?.candidate_unadopted!=='true'||row?.accounts!=='1'||row?.identities!=='1'||row?.auth_users!=='1'||row?.auth_identities!=='1'||row?.duplicate_codes!==null)throw new Error('PHASE10P_CROSS_READBACK')

process.stdout.write(`PHASE10P_PROVISIONAL_RESUME_TOKEN_BIND_CROSS_PATH_OK consumer_backend=${consumer.ready.backendPid} adopter_backend=${adopter.ready.backendPid} consume_bind_winners=1 safe_resume_losers=1 accounts=1 identities=1 auth_principals=1 duplicate_codes=0 deadlocks=0 raw_unique_violations=0\n`)
