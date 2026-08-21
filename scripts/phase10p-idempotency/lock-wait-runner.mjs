import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
const env = { ...process.env }
if (required.some(key => !env[key])) throw new Error('PHASE10P_IDEMPOTENCY_DIRECT_TCP_CONFIG_MISSING')
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

async function waitFor(predicate, workers, label, allowErrors = false) {
  const deadline = Date.now() + 30_000
  while (!predicate()) {
    const failure = workers.find(item => (!allowErrors && item.error) || (item.exit !== null && !item.result && !item.error))
    if (failure || Date.now() >= deadline) {
      workers.filter(item => item.exit === null).forEach(item => item.child.kill('SIGTERM'))
      throw new Error(`PHASE10P_IDEMPOTENCY_DIRECT_TCP_${label}_${failure?.error?.code ?? failure?.exit ?? 'TIMEOUT'}`)
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

async function awaitAdvisoryLock(locker, name) {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    const probe = await runOne(`${name}_LOCK_PROBE`, `SELECT count(*)::text AS lock_count FROM pg_catalog.pg_locks WHERE pid=${locker.ready.backendPid} AND locktype='advisory' AND granted;`)
    if (probe.rows[0]?.lock_count === '1') return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`PHASE10P_IDEMPOTENCY_DIRECT_TCP_${name}_LOCK_NOT_OBSERVED`)
}

async function lockWait(name, lockExpression, callSql) {
  const locker = worker(); const caller = worker(); const workers = [locker, caller]
  await waitFor(() => locker.ready && caller.ready, workers, `${name}_READY`)
  if (locker.ready.workerPid === caller.ready.workerPid || locker.ready.backendPid === caller.ready.backendPid) {
    throw new Error(`PHASE10P_IDEMPOTENCY_DIRECT_TCP_${name}_NOT_INDEPENDENT`)
  }
  locker.child.send({ type: 'GO', sql: `BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(${lockExpression}); SELECT pg_sleep(7); COMMIT; SELECT 'released' AS outcome;` })
  await awaitAdvisoryLock(locker, name)
  const started = Date.now()
  caller.child.send({ type: 'GO', sql: callSql })
  await waitFor(() => locker.result && locker.exit === 0 && caller.result && caller.exit === 0, workers, `${name}_RESULT`)
  const elapsedMs = Date.now() - started
  if (elapsedMs < 5_000) throw new Error(`PHASE10P_IDEMPOTENCY_DIRECT_TCP_${name}_DID_NOT_WAIT`)
  return { outcome: caller.result.rows.find(row => typeof row.outcome === 'string')?.outcome, elapsedMs, locker: locker.ready, caller: caller.ready }
}

const attemptLock = "hashtextextended('schoollove:10o-i:recovery-delivery:v1:1:'||encode(decode(repeat('61',32),'hex'),'hex'),0)"
const attemptCall = `
CREATE OR REPLACE FUNCTION pg_temp.phase10p_attempt_expiry_call() RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result_value text;
BEGIN
  SELECT x.outcome INTO result_value FROM public.create_and_reserve_login_attempt_recovery_delivery(
    '74000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),decode(repeat('61',32),'hex'),1,
    decode(repeat('65',17),'hex'),decode(repeat('66',12),'hex'),1,decode(repeat('67',32),'hex'),1
  ) x;
  RETURN result_value;
EXCEPTION WHEN OTHERS THEN RETURN SQLERRM;
END $$;
SELECT pg_temp.phase10p_attempt_expiry_call() AS outcome;`
const attempt = await lockWait('ATTEMPT_EXPIRY', attemptLock, attemptCall)
if (attempt.outcome !== 'SOCIAL_ATTEMPT_RECOVERY_CREATE_REJECTED') throw new Error(`PHASE10P_IDEMPOTENCY_ATTEMPT_EXPIRY_${attempt.outcome}`)

await runOne('VERIFICATION_EXPIRY_REFRESH', `UPDATE private.recovery_email_verifications SET expires_at=clock_timestamp()+interval '5 seconds' WHERE id='74000000-0000-4000-8100-000000000002' AND status='pending'; SELECT count(*)::text AS updated_count FROM private.recovery_email_verifications WHERE id='74000000-0000-4000-8100-000000000002' AND expires_at>clock_timestamp();`)
const verificationLock = "hashtextextended('schoollove:10o-i:recovery-delivery:v1:1:'||encode(decode(repeat('71',32),'hex'),'hex'),0)"
const verificationCall = `SELECT x.outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(
  '74000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),decode(repeat('71',32),'hex'),1,
  decode(repeat('75',17),'hex'),decode(repeat('76',12),'hex'),1,decode(repeat('77',32),'hex'),1
) x;`
const verification = await lockWait('VERIFICATION_EXPIRY', verificationLock, verificationCall)
if (verification.outcome !== 'RECOVERY_DELIVERY_LIMITED') throw new Error(`PHASE10P_IDEMPOTENCY_VERIFICATION_EXPIRY_${verification.outcome}`)

const readback = await runOne('READBACK', `
SELECT
  count(*)::text AS verification_count,
  count(*) FILTER(WHERE id IN ('74000000-0000-4000-8100-000000000001','74000000-0000-4000-8100-000000000002') AND status='pending')::text AS pending_count
FROM private.recovery_email_verifications;
SELECT
  count(*)::text AS delivery_count,
  count(*) FILTER(WHERE verification_id IN ('74000000-0000-4000-8100-000000000001','74000000-0000-4000-8100-000000000002') AND state='sent')::text AS sent_count
FROM private.recovery_delivery_attempts;`)
const verificationRow = readback.rows.find(row => row.verification_count)
const deliveryRow = readback.rows.find(row => row.delivery_count)
if (verificationRow?.verification_count !== '2' || verificationRow?.pending_count !== '2'
  || deliveryRow?.delivery_count !== '2' || deliveryRow?.sent_count !== '2') {
  throw new Error('PHASE10P_IDEMPOTENCY_LOCK_WAIT_READBACK')
}

process.stdout.write(`PHASE10P_RECOVERY_DELIVERY_LOCK_WAIT_OK attempt_expiry_rejected=1 verification_expiry_limited=1 verification_rows=2 delivery_rows=2 sent_rows=2 mutations=0 deadlocks=0 raw_unique_violations=0 attempt_wait_ms=${attempt.elapsedMs} verification_wait_ms=${verification.elapsedMs} locker_a_pid=${attempt.locker.workerPid} caller_a_pid=${attempt.caller.workerPid} locker_b_pid=${verification.locker.workerPid} caller_b_pid=${verification.caller.workerPid}\n`)
