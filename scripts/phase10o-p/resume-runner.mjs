import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { prepareTransactionBoundBrokerCode } from '../../lib/auth/social-broker/transaction-bound-code-issuance.ts'

process.on('uncaughtException', error => { process.stdout.write(`PHASE10O_P_RESUME_ERROR ${error instanceof Error ? error.stack : String(error)}\n`); process.exit(1) })

const attemptId = process.env.PHASE10O_P_ATTEMPT_ID
const expectedNonce = process.env.PHASE10O_P_EXPECT_NONCE === 'true'
const expectedState = process.env.PHASE10O_P_EXPECT_STATE
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')
if (!attemptId || expectedState === undefined || ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].some(key => !process.env[key])) throw new Error('PHASE10O_P_RESUME_CONFIG_MISSING')
function db(sql) {
  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [], { env: process.env, silent: true }); const state = { ready: null, result: null, error: null, exit: null }
    child.on('message', message => { if (message?.type === 'READY') state.ready = message; else if (message?.type === 'RESULT') state.result = message; else if (message?.type === 'ERROR') state.error = message })
    child.on('exit', code => { state.exit = code })
    const deadline = Date.now() + 15_000
    const tick = () => {
      if (state.error || (state.exit !== null && !state.result) || Date.now() > deadline) return reject(new Error(`PHASE10O_P_RESUME_DB_${state.error?.code ?? state.exit ?? 'TIMEOUT'}`))
      if (!state.ready) return setTimeout(tick, 10)
      child.send({ type: 'GO', sql })
      function resultTick() { return state.result && state.exit === 0 ? resolve(state.result) : (state.error || (state.exit !== null && !state.result) || Date.now() > deadline ? reject(new Error(`PHASE10O_P_RESUME_RESULT_${state.error?.code ?? state.exit ?? 'TIMEOUT'}`)) : setTimeout(resultTick, 10)) }
      resultTick()
    }
    tick()
  })
}
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
const hex = value => Buffer.from(value).toString('hex')
const contextResult = await db(`SELECT authorization_transaction_id::text,login_attempt_id::text,client_id,redirect_uri,pkce_s256_challenge,downstream_nonce,downstream_state FROM public.get_transaction_bound_broker_code_issuance_context('${attemptId}');`)
const context = contextResult.rows[0]
if (!context || context.login_attempt_id !== attemptId || context.downstream_state !== expectedState || (context.downstream_nonce !== null) !== expectedNonce) throw new Error('PHASE10O_P_RESUME_CONTEXT_REJECTED')
const key = { version: 17, material: Buffer.alloc(32, 0x17) }
const prepared = prepareTransactionBoundBrokerCode({
  context: {
    authorizationTransactionId: context.authorization_transaction_id,
    loginAttemptId: context.login_attempt_id,
    clientId: context.client_id,
    redirectUri: context.redirect_uri,
    pkceS256Challenge: context.pkce_s256_challenge,
    downstreamNonce: context.downstream_nonce,
    downstreamState: context.downstream_state,
  },
  authenticationTime: Math.floor(Date.now() / 1000) - 1,
  ...(context.downstream_nonce === null ? {} : { downstreamNonceKey: key }),
})
const nonce = prepared.database.code.downstreamNonce
const issueResult = await db(`SELECT outcome,downstream_state FROM public.issue_transaction_bound_broker_authorization_code(${quote(prepared.database.authorizationTransactionId)},${quote(prepared.database.code.codeId)},decode('${hex(prepared.database.code.codeDigest)}','hex'),${prepared.database.code.authenticationTime},${quote(prepared.database.downstreamNonceProof)},${nonce === null ? 'NULL' : `decode('${hex(nonce.digest)}','hex')`},${nonce === null ? 'NULL' : `decode('${hex(nonce.ciphertext)}','hex')`},${nonce === null ? 'NULL' : `decode('${hex(nonce.iv)}','hex')`},${nonce === null ? 'NULL' : nonce.keyVersion});`)
const issued = issueResult.rows[0]
if (issued?.outcome !== 'AUTHORIZATION_CODE_CREATED' || issued.downstream_state !== expectedState) throw new Error('PHASE10O_P_RESUME_ISSUE_REJECTED')
const readback = await db(`SELECT (SELECT count(*) FROM private.broker_authorization_codes WHERE authorization_transaction_id='${context.authorization_transaction_id}')::text AS codes,(SELECT status FROM private.downstream_authorization_transactions WHERE id='${context.authorization_transaction_id}') AS transaction_state,(SELECT state FROM private.oauth_login_attempts WHERE id='${attemptId}') AS attempt_state;`)
const final = readback.rows[0]
if (final?.codes !== '1' || final.transaction_state !== 'consumed' || final.attempt_state !== 'broker_code_ready') throw new Error('PHASE10O_P_RESUME_FINAL_STATE')
process.stdout.write(`PHASE10O_P_FRESH_PROCESS_RESUME_OK attempt=${attemptId} nonce=${expectedNonce} worker_pid=${contextResult.workerPid} db_pid=${contextResult.backendPid} issue_worker_pid=${issueResult.workerPid} issue_db_pid=${issueResult.backendPid} raw_code_output=0\n`)
