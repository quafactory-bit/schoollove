// Two independent sessions decide the same brand-new Google subject at once.
// Exactly one account may exist afterwards; the loser must fail closed.
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const env = { ...process.env }
if (['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].some(key => !env[key])) throw new Error('P2B_RACE_CONFIG')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
function worker() { const child = fork(workerPath, [], { env, silent: true }); const s = { child, ready: null, result: null, error: null, exit: null }; child.on('message', m => { if (m?.type === 'READY') s.ready = m; else if (m?.type === 'RESULT') s.result = m; else if (m?.type === 'ERROR') s.error = m }); child.on('exit', c => { s.exit = c }); return s }
async function waitFor(predicate, workers, label) { const deadline = Date.now() + 30_000; while (!predicate()) { const bad = workers.find(w => w.error || (w.exit !== null && !w.result)); if (bad || Date.now() > deadline) { workers.filter(w => w.exit === null).forEach(w => w.child.kill('SIGTERM')); throw new Error(`P2B_RACE_${label}_${bad?.error?.code ?? bad?.exit ?? 'TIMEOUT'}`) } await new Promise(r => setTimeout(r, 10)) } }

const decide = name => `SELECT set_config('request.jwt.claim.role','service_role',false); BEGIN; SELECT p2b_test.decide('${name}',7) AS outcome; SELECT pg_sleep(0.5); COMMIT;`
const a = worker(); const b = worker()
await waitFor(() => a.ready && b.ready, [a, b], 'READY')
a.child.send({ type: 'GO', sql: decide('raceA') }); b.child.send({ type: 'GO', sql: decide('raceB') })
await waitFor(() => a.result && b.result && a.exit === 0 && b.exit === 0, [a, b], 'RESULT')
const outcomes = [a, b].map(w => w.result.rows.find(row => Object.hasOwn(row, 'outcome'))?.outcome).sort()
const check = worker(); await waitFor(() => check.ready, [check], 'CHECK_READY')
check.child.send({ type: 'GO', sql: "SELECT count(*)::text AS n FROM private.private_accounts WHERE primary_broker_subject=p2b_test.subject(7)" })
await waitFor(() => check.result && check.exit === 0, [check], 'CHECK')
const accounts = check.result.rows[0]?.n
if (accounts !== '1' || outcomes[0] !== 'ACCOUNT_DECIDED_RECOVERY_DEFERRED' || outcomes[1] !== 'IDENTITY_DECISION_IN_PROGRESS') {
  throw new Error(`P2B_RACE_DUPLICATE accounts=${accounts} outcomes=${outcomes.join(',')}`)
}
console.log(`P2B_SAME_SUBJECT_RACE_OK accounts=1 outcomes=${outcomes.join(',')}`)
