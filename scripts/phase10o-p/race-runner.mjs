import { spawn } from 'node:child_process'

const container = process.env.PHASE10O_P_CONTAINER
if (!container) throw new Error('PHASE10O_P_HARNESS_CONFIG_MISSING')

function run(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'phase10op', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) reject(new Error(`PHASE10O_P_WORKER_SQL_${code}_${stderr.slice(0, 160)}`))
      else {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
        const [backendPid, outcome] = line.split('|')
        resolve({ workerPid: child.pid, backendPid: Number(backendPid), outcome })
      }
    })
    child.stdin.end(`SELECT set_config('request.jwt.claim.role','service_role',false); ${sql}`)
  })
}
const call = (codeId, digest) => `SELECT pg_backend_pid()||'|'||outcome FROM public.issue_transaction_bound_broker_authorization_code('e1000000-0000-4000-8000-000000000005','${codeId}',decode(repeat('${digest}',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL);`
const [a, b] = await Promise.all([
  run(call('e1000000-0000-4000-8000-000000000005', '61')),
  run(call('e1000000-0000-4000-8000-000000000006', '62')),
])
if (a.workerPid === b.workerPid || a.backendPid === b.backendPid) throw new Error('PHASE10O_P_RACE_NOT_INDEPENDENT')
const outcomes = [a.outcome, b.outcome]
if (outcomes.filter(value => value === 'AUTHORIZATION_CODE_CREATED').length !== 1 || outcomes.filter(value => value === 'AUTHORIZATION_CODE_REJECTED').length !== 1) throw new Error(`PHASE10O_P_RACE_OUTCOME_${outcomes.join('_')}`)
const restart = await run("SELECT pg_backend_pid()||'|'||(SELECT count(*) FROM private.broker_authorization_codes WHERE authorization_transaction_id='e1000000-0000-4000-8000-000000000005')::text||':'||(SELECT status FROM private.downstream_authorization_transactions WHERE id='e1000000-0000-4000-8000-000000000005')||':'||(SELECT state FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.id='e1000000-0000-4000-8000-000000000005');")
if (restart.outcome !== '1:consumed:broker_code_ready') throw new Error('PHASE10O_P_RESTART_DURABILITY')
process.stdout.write(`PHASE10O_P_CONCURRENCY_OK worker_a_pid=${a.workerPid} worker_a_backend=${a.backendPid} worker_b_pid=${b.workerPid} worker_b_backend=${b.backendPid} restart_pid=${restart.workerPid} restart_backend=${restart.backendPid} winners=1 canonical_rejections=1 deadlocks=0 raw_unique_violations=0\n`)
