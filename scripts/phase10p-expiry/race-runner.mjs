import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
const env = { ...process.env }
if (required.some(key => !env[key])) throw new Error('PHASE10P_EXPIRY_DIRECT_TCP_CONFIG_MISSING')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')

function worker() {
  const child = fork(workerPath, [], { env, silent: true })
  const state = { child, ready: null, result: null, error: null, exit: null }
  child.on('message', message => {
    if (message?.type === 'READY') state.ready = message
    else if (message?.type === 'RESULT') state.result = message
    else if (message?.type === 'ERROR') state.error = message
  })
  child.on('exit', code => { state.exit = code })
  return state
}

async function waitFor(predicate, workers, label) {
  const deadline = Date.now() + 20_000
  while (!predicate()) {
    const failure = workers.find(item => item.error || (item.exit !== null && !item.result))
    if (failure || Date.now() >= deadline) {
      workers.filter(item => item.exit === null).forEach(item => item.child.kill('SIGTERM'))
      throw new Error(`PHASE10P_EXPIRY_DIRECT_TCP_${label}_${failure?.error?.code ?? failure?.exit ?? 'TIMEOUT'}`)
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function runOne(name, sql) {
  const state = worker()
  await waitFor(() => state.ready, [state], `${name}_READY`)
  state.child.send({ type: 'GO', sql })
  await waitFor(() => state.result && state.exit === 0, [state], `${name}_RESULT`)
  return state.result
}

async function race(name, sql) {
  const left = worker(); const right = worker(); const workers = [left, right]
  await waitFor(() => left.ready && right.ready, workers, `${name}_READY`)
  if (left.ready.workerPid === right.ready.workerPid || left.ready.backendPid === right.ready.backendPid) {
    throw new Error(`PHASE10P_EXPIRY_DIRECT_TCP_${name}_NOT_INDEPENDENT`)
  }
  left.child.send({ type: 'GO', sql: sql(1) })
  right.child.send({ type: 'GO', sql: sql(2) })
  await waitFor(() => left.result && right.result && left.exit === 0 && right.exit === 0, workers, `${name}_RESULT`)
  return { left: left.result, right: right.result }
}

const digest = "decode(repeat('81',32),'hex')"
const subject = "'slb:v1:k01:google:'||translate(rtrim(encode(" + digest + ",'base64'),'='),'+/','-_')"
const raced = await race('SAME_SUBJECT', index => {
  const safeId = `att_10p_expiry_race_00${index}`
  const legId = index === 1 ? '63000000-0000-4000-8000-000000000002' : '63000000-0000-4000-8000-000000000012'
  return `SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='${safeId}'),'${legId}','google',${subject},${digest},1) AS outcome;`
})
const outcomes = [raced.left.rows[0]?.outcome, raced.right.rows[0]?.outcome].sort()
if (outcomes.join(',') !== 'IDENTITY_DECISION_IN_PROGRESS,RECOVERY_REQUIRED') {
  throw new Error(`PHASE10P_EXPIRY_RACE_OUTCOME_${outcomes.join('_')}`)
}

const readback = await runOne('READBACK', `
SELECT
  count(*) FILTER(WHERE a.state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified'))::text AS live_count,
  count(*) FILTER(WHERE a.state='recovery_required' AND l.status='verified' AND t.status='upstream_bound')::text AS winner_count,
  count(*) FILTER(WHERE a.state='failed_safe' AND l.status='rejected' AND t.status='rejected' AND t.downstream_nonce IS NULL AND t.downstream_state IS NULL)::text AS safe_loser_count,
  count(*)::text AS total_count
FROM private.oauth_login_attempts a
JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id
JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id
WHERE a.safe_attempt_id IN ('att_10p_expiry_race_001','att_10p_expiry_race_002');`)
const row = readback.rows[0]
if (row?.live_count !== '1' || row?.winner_count !== '1' || row?.safe_loser_count !== '1' || row?.total_count !== '2') {
  throw new Error('PHASE10P_EXPIRY_RACE_READBACK')
}

process.stdout.write(`PHASE10P_STALE_EXPIRY_CONCURRENCY_OK winners=1 safe_losers=1 live_subject_rows=1 duplicates=0 deadlocks=0 raw_unique_violations=0 worker_a_pid=${raced.left.workerPid} worker_a_backend=${raced.left.backendPid} worker_b_pid=${raced.right.workerPid} worker_b_backend=${raced.right.backendPid} readback_pid=${readback.workerPid}\n`)
