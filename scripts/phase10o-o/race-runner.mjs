import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pg-worker.mjs')
const timeoutMs = 15_000
const env = { ...process.env }
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
if (required.some(key => !env[key])) throw new Error('PHASE10O_O_HARNESS_CONFIG_MISSING')

function worker() {
  const child = fork(workerPath, [], { env, silent: true })
  const state = { child, ready: null, result: null, error: null, exit: null, close: null, stderr: '' }
  child.stderr.on('data', chunk => { state.stderr += chunk.toString('utf8').slice(0, 256) })
  child.on('message', message => { if (message?.type === 'READY') state.ready = message; else if (message?.type === 'RESULT') state.result = message; else if (message?.type === 'ERROR') state.error = message })
  child.on('exit', (code, signal) => { state.exit = { code, signal } })
  child.on('close', (code, signal) => { state.close = { code, signal } })
  return state
}

async function until(check, states, label) {
  const deadline = Date.now() + timeoutMs
  while (!check()) { if (states.some(state => state.error || (state.exit && !state.result)) || Date.now() >= deadline) { for (const state of states) if (!state.exit) state.child.kill('SIGTERM'); const error = states.find(state => state.error); throw new Error(`PHASE10O_O_HARNESS_${label}${error ? `_${error.error.code}` : ''}`) } await new Promise(resolve => setTimeout(resolve, 10)) }
}

async function race(name, sqlA, sqlB) {
  const a = worker(); const b = worker(); const states = [a, b]
  await until(() => a.ready && b.ready, states, `${name}_READY`)
  if (a.ready.workerPid === b.ready.workerPid || a.ready.backendPid === b.ready.backendPid) throw new Error(`PHASE10O_O_HARNESS_${name}_INDEPENDENCE`)
  a.child.send({ type: 'GO', sql: sqlA }); b.child.send({ type: 'GO', sql: sqlB })
  await until(() => a.result && b.result, states, `${name}_RESULT`)
  await until(() => a.exit && b.exit && a.exit.code === 0 && b.exit.code === 0, states, `${name}_EXIT`)
  return { a: a.result, b: b.result }
}

async function runOne(name, sql) {
  const state = worker()
  await until(() => state.ready, [state], `${name}_READY`)
  state.child.send({ type: 'GO', sql })
  await until(() => state.result, [state], `${name}_RESULT`)
  await until(() => state.exit && state.exit.code === 0, [state], `${name}_EXIT`)
  return state.result
}

function outcomes(pair) { return [pair.a.rows[0]?.outcome, pair.b.rows[0]?.outcome] }
function exactly(values, expected) { return expected.every(([value, count]) => values.filter(item => item === value).length === count) }

const same = await race('SAME_HANDLE', "SELECT 'outcome' AS kind, outcome FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('91',32),'hex'));", "SELECT 'outcome' AS kind, outcome FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('91',32),'hex'));")
if (!exactly(outcomes(same), [['TRANSACTION_CLAIMED', 1], ['CORRELATION_REJECTED', 1]])) throw new Error('PHASE10O_O_SECURITY_SAME_HANDLE')

const validBind = await race('VALID_BIND', "SELECT 'outcome' AS kind, public.bind_downstream_authorization_transaction_upstream_leg('d1000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000010') AS outcome;", "SELECT 'outcome' AS kind, public.bind_downstream_authorization_transaction_upstream_leg('d1000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000010') AS outcome;")
if (!exactly(outcomes(validBind), [['UPSTREAM_BOUND', 1], ['BINDING_REJECTED', 1]])) throw new Error('PHASE10O_O_SECURITY_VALID_BIND')

const foreign = await runOne('FOREIGN_REJECT', "SELECT 'outcome' AS kind, public.bind_downstream_authorization_transaction_upstream_leg('d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000004') AS outcome;")
if (foreign.rows[0]?.outcome !== 'BINDING_REJECTED') throw new Error('PHASE10O_O_SECURITY_FOREIGN_STALE_REJECTION')
const foreignReadback = await runOne('FOREIGN_READBACK', "SELECT 'outcome' AS kind, status AS outcome FROM private.downstream_authorization_transactions WHERE id='d1000000-0000-4000-8000-000000000002';")
if (foreignReadback.rows[0]?.outcome !== 'claimed') throw new Error('PHASE10O_O_SECURITY_FOREIGN_TERMINALIZATION')
const subsequentValid = await runOne('SUBSEQUENT_VALID_BIND', "SELECT 'outcome' AS kind, public.bind_downstream_authorization_transaction_upstream_leg('d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003') AS outcome;")
if (subsequentValid.rows[0]?.outcome !== 'UPSTREAM_BOUND') throw new Error('PHASE10O_O_SECURITY_SUBSEQUENT_VALID')

const expired = await race('EXPIRED_CLAIM', "SELECT 'outcome' AS kind, outcome FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('95',32),'hex'));", "SELECT 'outcome' AS kind, outcome FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('95',32),'hex'));")
if (!exactly(outcomes(expired), [['EXPIRED', 1], ['CORRELATION_REJECTED', 1]])) throw new Error('PHASE10O_O_SECURITY_EXPIRED')

const restart = await runOne('RESTART_READBACK', "SELECT 'outcome' AS kind, count(*)::text AS outcome FROM private.downstream_authorization_transactions WHERE id IN ('d1000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000002') AND status='upstream_bound';")
if (restart.rows[0]?.outcome !== '2') throw new Error('PHASE10O_O_SECURITY_RESTART')

const transactionCardinality = await runOne('TRANSACTION_CARDINALITY_AUDIT', "SELECT 'outcome' AS kind, count(*)::text AS outcome FROM pg_constraint WHERE conrelid='private.downstream_authorization_transactions'::regclass AND contype='u';")
const legCardinality = await runOne('LEG_CARDINALITY_AUDIT', "SELECT 'outcome' AS kind, count(*)::text AS outcome FROM pg_constraint WHERE conrelid='private.upstream_login_legs'::regclass AND contype='u';")
if (transactionCardinality.rows[0]?.outcome !== '2' || legCardinality.rows[0]?.outcome !== '1') throw new Error('PHASE10O_O_BINDING_CARDINALITY_REVIEW_BLOCKED')

const details = [same.a, same.b, validBind.a, validBind.b, foreign, foreignReadback, subsequentValid, expired.a, expired.b, restart, transactionCardinality, legCardinality].map(result => `worker_pid=${result.workerPid},db_pid=${result.backendPid}`).join(' ')
process.stdout.write(`PHASE10O_O_CONCURRENCY_OK ${details} same_handle_claimed=1 same_handle_rejected=1 competing_valid_bind=1/1 foreign_rejected_without_terminalization=true subsequent_valid_bind=true same_leg_two_transactions=STRUCTURALLY_PREVENTED expired=1 restart=PASS deadlocks=0 raw_unique_violations=0\n`)
