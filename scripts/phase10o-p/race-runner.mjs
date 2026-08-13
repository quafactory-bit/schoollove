import { fork, spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
const env = { ...process.env }
if (required.some(key => !env[key])) throw new Error('PHASE10O_P_DIRECT_TCP_CONFIG_MISSING')

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
    if (failure || Date.now() >= deadline) {
      workers.filter(item => item.exit === null).forEach(item => item.child.kill('SIGTERM'))
      throw new Error(`PHASE10O_P_DIRECT_TCP_${label}_${failure?.error?.code ?? failure?.exit ?? 'TIMEOUT'}`)
    }
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
  if (left.ready.workerPid === right.ready.workerPid || left.ready.backendPid === right.ready.backendPid) throw new Error(`PHASE10O_P_DIRECT_TCP_${name}_NOT_INDEPENDENT`)
  // The parent releases both already-connected direct TCP workers only after both READY messages.
  left.child.send({ type: 'GO', sql: leftSql }); right.child.send({ type: 'GO', sql: rightSql })
  await waitFor(() => left.result && right.result && left.exit === 0 && right.exit === 0, workers, `${name}_RESULT`)
  return { left: left.result, right: right.result }
}
const issue = (tx, code, digest) => `SELECT outcome FROM public.issue_transaction_bound_broker_authorization_code('${tx}','${code}',decode(repeat('${digest}',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL);`
const transaction = 'e1000000-0000-4000-8000-000000000005'
const same = await race('SAME_TRANSACTION_ISSUE', issue(transaction, 'e1000000-0000-4000-8000-000000000005', '61'), issue(transaction, 'e1000000-0000-4000-8000-000000000006', '62'))
const outcomes = [same.left.rows[0]?.outcome, same.right.rows[0]?.outcome]
if (outcomes.filter(value => value === 'AUTHORIZATION_CODE_CREATED').length !== 1 || outcomes.filter(value => value === 'AUTHORIZATION_CODE_REJECTED').length !== 1) throw new Error('PHASE10O_P_DIRECT_TCP_SAME_TRANSACTION_OUTCOME')
const restart = await runOne('RESTART_READBACK', `SELECT (SELECT count(*) FROM private.broker_authorization_codes WHERE authorization_transaction_id='${transaction}')::text AS codes,(SELECT status FROM private.downstream_authorization_transactions WHERE id='${transaction}') AS transaction_state,(SELECT state FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.id='${transaction}') AS attempt_state;`)
const row = restart.rows[0]
if (row?.codes !== '1' || row.transaction_state !== 'consumed' || row.attempt_state !== 'broker_code_ready') throw new Error('PHASE10O_P_DIRECT_TCP_RESTART_DURABILITY')
const detail = [same.left, same.right, restart].map(item => `worker_pid=${item.workerPid},db_pid=${item.backendPid}`).join(' ')
process.stdout.write(`PHASE10O_P_DIRECT_TCP_CONCURRENCY_OK ${detail} ready_go_barrier=true winners=1 canonical_rejections=1 deadlocks=0 raw_unique_violations=0\n`)

const loader = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server-only-loader.mjs')
const resume = path.join(path.dirname(fileURLToPath(import.meta.url)), 'resume-runner.mjs')
async function freshResume(safeId, nonce, state) {
  // Setup-only harness lookup: the child receives only the trusted UUID. It
  // never selects a transaction row; it resolves issuance context via RPC.
  const attemptLookup = await runOne('TRUSTED_ATTEMPT_ID', `SELECT id::text AS attempt_id FROM private.oauth_login_attempts WHERE safe_attempt_id='${safeId}';`)
  const attemptId = attemptLookup.rows[0]?.attempt_id
  if (!attemptId) throw new Error('PHASE10O_P_FRESH_PROCESS_ATTEMPT_MISSING')
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--experimental-loader', pathToFileURL(loader).href, resume], {
      env: { ...env, PHASE10O_P_ATTEMPT_ID: attemptId, PHASE10O_P_EXPECT_NONCE: String(nonce), PHASE10O_P_EXPECT_STATE: state }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', value => { stdout += value.toString('utf8') }); child.stderr.on('data', value => { stderr += value.toString('utf8') })
    child.on('error', reject); child.on('close', code => code === 0 && stdout.includes('PHASE10O_P_FRESH_PROCESS_RESUME_OK') ? resolve() : reject(new Error(`PHASE10O_P_FRESH_PROCESS_RESUME_${code}_${stderr.slice(0, 900)}_${stdout.slice(0, 400)}`)))
  })
}
await freshResume('att_10op_restart_nonce_01', true, 'restart state +/%?')
await freshResume('att_10op_restart_plain_01', false, 'restart plain state')
process.stdout.write('PHASE10O_P_FRESH_PROCESS_CONTEXT_RESUME_OK nonce_bearing=PASS no_nonce=PASS direct_private_context_select=0\n')

const expiryTransaction = 'e1000000-0000-4000-8000-000000000011'
const expiryRace = await race('EXPIRY_VS_ISSUANCE', issue(expiryTransaction, 'e1000000-0000-4000-8000-000000000011', '71'), `WITH changed AS (UPDATE private.downstream_authorization_transactions SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id='${expiryTransaction}' AND status='upstream_bound' RETURNING 1) SELECT COALESCE((SELECT count(*)::text FROM changed),'0') AS outcome;`)
const expiryReadback = await runOne('EXPIRY_VS_ISSUANCE_READBACK', `SELECT (SELECT count(*) FROM private.broker_authorization_codes WHERE authorization_transaction_id='${expiryTransaction}')::text AS codes,(SELECT status FROM private.downstream_authorization_transactions WHERE id='${expiryTransaction}') AS transaction_state,(SELECT state FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.id='${expiryTransaction}') AS attempt_state;`)
const expiryFinal = expiryReadback.rows[0]
const issueWon = expiryFinal?.codes === '1' && expiryFinal.transaction_state === 'consumed' && expiryFinal.attempt_state === 'broker_code_ready'
const expiryWon = expiryFinal?.codes === '0' && expiryFinal.transaction_state === 'expired' && expiryFinal.attempt_state === 'expired'
if (!issueWon && !expiryWon) throw new Error('PHASE10O_P_DIRECT_TCP_EXPIRY_PARTIAL_STATE')
process.stdout.write(`PHASE10O_P_EXPIRY_VS_ISSUANCE_OK outcome=${issueWon ? 'ISSUANCE_WON' : 'EXPIRY_WON'} worker_a_pid=${expiryRace.left.workerPid} worker_a_backend=${expiryRace.left.backendPid} worker_b_pid=${expiryRace.right.workerPid} worker_b_backend=${expiryRace.right.backendPid} restart_pid=${expiryReadback.workerPid} restart_backend=${expiryReadback.backendPid} deadlocks=0 raw_unique_violations=0\n`)
