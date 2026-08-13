import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
const env = { ...process.env }
if (required.some(key => !env[key])) throw new Error('PHASE10O_R_DIRECT_TCP_CONFIG_MISSING')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
function worker() {
  const child = fork(workerPath, [], { env, silent: true })
  const state = { child, ready: null, result: null, error: null, exit: null }
  child.on('message', message => { if (message?.type === 'READY') state.ready = message; else if (message?.type === 'RESULT') state.result = message; else if (message?.type === 'ERROR') state.error = message })
  child.on('exit', code => { state.exit = code })
  return state
}
async function waitFor(predicate, workers, label) {
  const deadline = Date.now() + 15_000
  while (!predicate()) {
    const failure = workers.find(item => item.error || (item.exit !== null && !item.result))
    if (failure || Date.now() >= deadline) { workers.filter(item => item.exit === null).forEach(item => item.child.kill('SIGTERM')); throw new Error(`PHASE10O_R_DIRECT_TCP_${label}_${failure?.error?.code ?? failure?.exit ?? 'TIMEOUT'}`) }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
async function runOne(name, sql) {
  const state = worker(); await waitFor(() => state.ready, [state], `${name}_READY`)
  state.child.send({ type: 'GO', sql }); await waitFor(() => state.result && state.exit === 0, [state], `${name}_RESULT`)
  return state.result
}
async function race(name, leftSql, rightSql) {
  const left = worker(); const right = worker(); const workers = [left, right]
  await waitFor(() => left.ready && right.ready, workers, `${name}_READY`)
  if (left.ready.workerPid === right.ready.workerPid || left.ready.backendPid === right.ready.backendPid) throw new Error(`PHASE10O_R_DIRECT_TCP_${name}_NOT_INDEPENDENT`)
  left.child.send({ type: 'GO', sql: leftSql }); right.child.send({ type: 'GO', sql: rightSql })
  await waitFor(() => left.result && right.result && left.exit === 0 && right.exit === 0, workers, `${name}_RESULT`)
  return { left: left.result, right: right.result }
}

const collisionAttempt = "(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10or_live_collision')"
const collisionLeg = "'f1000000-0000-4000-8000-000000000060'"
const collisionDigest = "decode(repeat('52',32),'hex')"
const collisionSubject = "'slb:v1:k01:naver:'||translate(rtrim(encode(" + collisionDigest + ",'base64'),'='),'+/','-_')"
const collision = await race('LIVE_SUBJECT_UNIQUENESS',
  `SELECT public.record_verified_social_identity_from_upstream_leg(${collisionAttempt},${collisionLeg},'naver',${collisionSubject},${collisionDigest},1) AS outcome;`,
  `SELECT pg_sleep(0.2); INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,expires_at) VALUES('f1000000-0000-4000-8000-000000000070','att_10or_live_competing','naver','recovery_required',${collisionSubject},${collisionDigest},1,clock_timestamp()+interval '5 minutes'); SELECT 'COMPETING_LIVE_COMMITTED' AS outcome;`,
)
if (collision.left.rows[0]?.outcome !== 'IDENTITY_DECISION_IN_PROGRESS' || collision.right.rows.at(-1)?.outcome !== 'COMPETING_LIVE_COMMITTED') throw new Error('PHASE10O_R_DIRECT_TCP_LIVE_SUBJECT_COLLISION_OUTCOME')
const collisionReadback = await runOne('LIVE_SUBJECT_READBACK', `SELECT a.state AS attempt_state,l.status AS leg_status,t.status AS transaction_state,(t.downstream_nonce IS NULL AND t.downstream_state IS NULL)::text AS scrubbed,(SELECT count(*)::text FROM private.oauth_login_attempts x WHERE x.safe_attempt_id='att_10or_live_competing' AND x.state='recovery_required') AS competing_live FROM private.oauth_login_attempts a JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE a.safe_attempt_id='att_10or_live_collision';`)
const collisionRow = collisionReadback.rows[0]
if (collisionRow?.attempt_state !== 'failed_safe' || collisionRow?.leg_status !== 'rejected' || collisionRow?.transaction_state !== 'rejected' || collisionRow?.scrubbed !== 'true' || collisionRow?.competing_live !== '1') throw new Error('PHASE10O_R_DIRECT_TCP_LIVE_SUBJECT_COLLISION_STATE')
await runOne('LIVE_SUBJECT_CLEANUP', "DROP TRIGGER phase10or_test_live_collision_delay ON private.oauth_login_attempts; DROP FUNCTION private.phase10or_test_live_collision_delay();")
process.stdout.write(`PHASE10O_R_LIVE_SUBJECT_UNIQUENESS_COLLISION_OK worker_a_pid=${collision.left.workerPid} worker_a_backend=${collision.left.backendPid} worker_b_pid=${collision.right.workerPid} worker_b_backend=${collision.right.backendPid} readback_pid=${collisionReadback.workerPid} deadlocks=0 raw_unique_violations=0\n`)

const attempt = "(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10or_identity_failure_race')"
const leg = "'f1000000-0000-4000-8000-000000000020'"
const digest = "decode(repeat('51',32),'hex')"
const subject = "'slb:v1:k01:naver:'||translate(rtrim(encode(" + digest + ",'base64'),'='),'+/','-_')"
const identityFailure = await race('IDENTITY_VS_FAILURE', `SELECT public.record_verified_social_identity_from_upstream_leg(${attempt},${leg},'naver',${subject},${digest},1) AS outcome;`, `SELECT public.fail_upstream_login_leg(${attempt},${leg},'provider_failure') AS outcome;`)
const final = await runOne('IDENTITY_VS_FAILURE_READBACK', `SELECT a.state AS attempt_state,l.status AS leg_status,t.status AS transaction_state,(t.downstream_nonce IS NULL AND t.downstream_state IS NULL)::text AS scrubbed FROM private.oauth_login_attempts a JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE a.safe_attempt_id='att_10or_identity_failure_race';`)
const row = final.rows[0]
const identityWon = row?.leg_status === 'verified' && row?.transaction_state === 'upstream_bound' && (row.attempt_state === 'recovery_required' || row.attempt_state === 'existing_primary') && row.scrubbed === 'false'
const failureWon = row?.leg_status === 'rejected' && row?.transaction_state === 'rejected' && row?.attempt_state === 'failed_safe' && row.scrubbed === 'true'
if (!identityWon && !failureWon) throw new Error('PHASE10O_R_RACE_PARTIAL_STATE')
process.stdout.write(`PHASE10O_R_IDENTITY_VS_FAILURE_RACE_OK outcome=${identityWon ? 'IDENTITY_WON' : 'FAILURE_WON'} worker_a_pid=${identityFailure.left.workerPid} worker_a_backend=${identityFailure.left.backendPid} worker_b_pid=${identityFailure.right.workerPid} worker_b_backend=${identityFailure.right.backendPid} readback_pid=${final.workerPid} deadlocks=0 raw_unique_violations=0\n`)
