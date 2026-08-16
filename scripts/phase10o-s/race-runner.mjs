import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const env = { ...process.env }
if (['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].some(key => !env[key])) throw new Error('PHASE10O_S_DIRECT_TCP_CONFIG_MISSING')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
function worker() { const child = fork(workerPath, [], { env, silent: true }); const state = { child, ready: null, result: null, error: null, exit: null }; child.on('message', m => { if (m?.type === 'READY') state.ready = m; if (m?.type === 'RESULT') state.result = m; if (m?.type === 'ERROR') state.error = m }); child.on('exit', c => { state.exit = c }); return state }
async function wait(predicate, states, label) { const end = Date.now() + 15_000; while (!predicate()) { if (states.some(s => s.error || (s.exit !== null && !s.result)) || Date.now() > end) { states.forEach(s => s.child.kill('SIGTERM')); throw new Error(`PHASE10O_S_DIRECT_TCP_${label}`) } await new Promise(resolve => setTimeout(resolve, 10)) } }
async function race(label, leftSql, rightSql) { const left = worker(); const right = worker(); await wait(() => left.ready && right.ready, [left, right], `${label}_READY`); if (left.ready.backendPid === right.ready.backendPid) throw new Error(`PHASE10O_S_DIRECT_TCP_${label}_NOT_INDEPENDENT`); left.child.send({ type: 'GO', sql: leftSql }); right.child.send({ type: 'GO', sql: rightSql }); await wait(() => left.result && right.result && left.exit === 0 && right.exit === 0, [left, right], `${label}_RESULT`); return [left.result.rows.at(-1)?.outcome, right.result.rows.at(-1)?.outcome] }
const bind = (h, leg) => `SELECT outcome FROM public.create_or_resume_durable_upstream_continuation(decode(repeat('${h}',32),'hex'),'${leg}','naver',decode(repeat('a1',32),'hex'),extensions.digest(decode(repeat('${h}',32),'hex')||convert_to('race','UTF8'),'sha256'),NULL,NULL,NULL,NULL,NULL,decode(repeat('f1',17),'hex'),decode(repeat('01',12),'hex'),1);`
const double = await race('DOUBLE_CONTINUATION', bind('21', '52000000-0000-4000-8000-000000000011'), bind('21', '52000000-0000-4000-8000-000000000012'))
if (!double.includes('CONTINUATION_BOUND') || !double.includes('CONTINUATION_RESUMED')) throw new Error('PHASE10O_S_DIRECT_TCP_DOUBLE_OUTCOME')
const doubleCount = await race('DOUBLE_READBACK', `SELECT count(*)::text AS outcome FROM private.upstream_login_legs WHERE login_attempt_id=(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10os_race_double');`, `SELECT count(*)::text AS outcome FROM private.upstream_login_legs WHERE login_attempt_id=(SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10os_race_double');`)
if (doubleCount.some(value => value !== '1')) throw new Error('PHASE10O_S_DIRECT_TCP_DOUBLE_LEGS')
await new Promise(resolve => setTimeout(resolve, 1100))
const expiry = await race('CONTINUATION_VS_EXPIRY', bind('22', '52000000-0000-4000-8000-000000000022'), `SELECT public.expire_abandoned_downstream_authorization_transaction('52000000-0000-4000-8000-000000000002') AS outcome;`)
if (!expiry.every(value => ['EXPIRED', 'CORRELATION_REJECTED'].includes(value))) throw new Error('PHASE10O_S_DIRECT_TCP_EXPIRY_OUTCOME')
const callbackBound = bind('23', '52000000-0000-4000-8000-000000000023')
const prepared = worker(); await wait(() => prepared.ready, [prepared], 'CALLBACK_SETUP_READY'); prepared.child.send({ type: 'GO', sql: callbackBound }); await wait(() => prepared.result && prepared.exit === 0, [prepared], 'CALLBACK_SETUP_RESULT')
await new Promise(resolve => setTimeout(resolve, 1100))
const callback = await race('CALLBACK_VS_EXPIRY', `SELECT outcome FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('a1',32),'hex'),extensions.digest(decode(repeat('23',32),'hex')||convert_to('race','UTF8'),'sha256'));`, `SELECT public.expire_abandoned_downstream_authorization_transaction('52000000-0000-4000-8000-000000000003') AS outcome;`)
if (!callback.every(value => ['EXPIRED', 'CORRELATION_REJECTED', 'REPLAY_REJECTED'].includes(value))) throw new Error('PHASE10O_S_DIRECT_TCP_CALLBACK_OUTCOME')
process.stdout.write('PHASE10O_S_DIRECT_TCP_RACES_OK same_continuation_legs=1 continuation_expiry_consistent=true callback_expiry_consistent=true deadlocks=0 raw_constraint_errors=0\n')
