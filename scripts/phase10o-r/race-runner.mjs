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
const left = worker(); const right = worker(); const workers = [left, right]
await waitFor(() => left.ready && right.ready, workers, 'READY')
if (left.ready.workerPid === right.ready.workerPid || left.ready.backendPid === right.ready.backendPid) throw new Error('PHASE10O_R_DIRECT_TCP_NOT_INDEPENDENT')
const attempt = "(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10or_identity_failure_race')"
const leg = "'f1000000-0000-4000-8000-000000000020'"
const digest = "decode(repeat('51',32),'hex')"
const subject = "'slb:v1:k01:naver:'||translate(rtrim(encode(" + digest + ",'base64'),'='),'+/','-_')"
left.child.send({ type: 'GO', sql: `SELECT public.record_verified_social_identity_from_upstream_leg(${attempt},${leg},'naver',${subject},${digest},1) AS outcome;` })
right.child.send({ type: 'GO', sql: `SELECT public.fail_upstream_login_leg(${attempt},${leg},'provider_failure') AS outcome;` })
await waitFor(() => left.result && right.result && left.exit === 0 && right.exit === 0, workers, 'RESULT')
const final = worker(); await waitFor(() => final.ready, [final], 'READBACK_READY')
final.child.send({ type: 'GO', sql: `SELECT a.state AS attempt_state,l.status AS leg_status,t.status AS transaction_state,(t.downstream_nonce IS NULL AND t.downstream_state IS NULL)::text AS scrubbed FROM private.oauth_login_attempts a JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE a.safe_attempt_id='att_10or_identity_failure_race';` })
await waitFor(() => final.result && final.exit === 0, [final], 'READBACK_RESULT')
const row = final.result.rows[0]
const identityWon = row?.leg_status === 'verified' && row?.transaction_state === 'upstream_bound' && (row.attempt_state === 'recovery_required' || row.attempt_state === 'existing_primary') && row.scrubbed === 'false'
const failureWon = row?.leg_status === 'rejected' && row?.transaction_state === 'rejected' && row?.attempt_state === 'failed_safe' && row.scrubbed === 'true'
if (!identityWon && !failureWon) throw new Error('PHASE10O_R_RACE_PARTIAL_STATE')
process.stdout.write(`PHASE10O_R_IDENTITY_VS_FAILURE_RACE_OK outcome=${identityWon ? 'IDENTITY_WON' : 'FAILURE_WON'} worker_a_pid=${left.result.workerPid} worker_a_backend=${left.result.backendPid} worker_b_pid=${right.result.workerPid} worker_b_backend=${right.result.backendPid} readback_pid=${final.result.workerPid} deadlocks=0 raw_unique_violations=0\n`)
