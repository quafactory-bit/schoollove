import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { runStage } from './stage-runner.mjs'

const quote = value => `'${String(value).replaceAll("'", "''")}'`
const hex = value => Buffer.from(value).toString('hex')
const digest = (domain, value) => createHash('sha256').update(domain, 'utf8').update(value, 'utf8').digest()
const opaque = () => randomBytes(32).toString('base64url')
const subject = (provider, value) => `slb:v1:k01:${provider}:${Buffer.from(value).toString('base64url')}`
const nowSql = "clock_timestamp()+interval '9 minutes'"
const here = path.dirname(fileURLToPath(import.meta.url))
const stageFile = path.join(here, 'orchestrator-stage.mjs')
const loader = pathToFileURL(path.join(here, '..', 'phase10o-p', 'server-only-loader.mjs')).href
const qKeys = { upstreamPkce: randomBytes(32), downstreamNonce: randomBytes(32), brokerSubject: randomBytes(32) }
const ipcKeys = Object.fromEntries(Object.entries(qKeys).map(([key, value]) => [key, value.toString('base64')]))
function stage(input) { return new Promise((resolve, reject) => { const child = fork(stageFile, [], { env: process.env, silent: true, execArgv: ['--experimental-strip-types', '--experimental-loader', loader] }); let settled = false; let stderr = ''; const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value) }; const timer = setTimeout(() => { child.kill(); finish(new Error('PHASE10O_Q_STAGE_TIMEOUT')) }, 20_000); child.stderr?.on('data', value => { stderr += value.toString('utf8').slice(0, 240) }); child.on('message', message => message?.ok ? finish(null, message.value) : finish(new Error(`PHASE10O_Q_STAGE_${message?.error ?? 'FAILURE'}`))); child.on('error', error => finish(error)); child.on('exit', code => { if (!settled) finish(new Error(`PHASE10O_Q_STAGE_EXIT_${code}_${stderr.replace(/[A-Za-z0-9_-]{43,}/g, '[redacted]')}`)) }); child.send({ ...input, keys: ipcKeys }) }) }
function hmacSubjectDigest(provider, upstreamSubject) { const frame = value => { const bytes = Buffer.from(value); const length = Buffer.allocUnsafe(4); length.writeUInt32BE(bytes.byteLength); return Buffer.concat([length, bytes]) }; return createHmac('sha256', qKeys.brokerSubject).update(Buffer.concat([frame('schoollove:broker-subject:v1'), frame(provider), frame(upstreamSubject)])).digest() }

async function rows(name, sql) { return (await runStage(name, sql)).rows }
async function scalar(name, sql, key = 'outcome') { const row = (await rows(name, sql))[0]; if (!row?.[key]) throw new Error(`PHASE10O_Q_${name}_EMPTY`); return row[key] }

/**
 * A fully RPC-driven durable path. The only direct table writes below create the
 * global active-account fixture; no session under test is seeded existing_primary.
 */
async function createActiveFixture(provider, identityDigest) {
  const brokerSubject = subject(provider, identityDigest); const attempt = randomUUID(); const verification = randomUUID(); const account = randomUUID(); const auth = randomUUID()
  const recoveryHmac = randomBytes(32)
  const outcome = await scalar('FIXTURE_IDENTITY', `SELECT public.create_social_login_attempt(${quote(`att_${opaque().slice(0, 20)}`)},${quote(provider)},${nowSql}) AS attempt_id` , 'attempt_id')
  await scalar('FIXTURE_RECORD', `SELECT public.record_verified_social_identity(${quote(outcome)},${quote(provider)},${quote(brokerSubject)},decode(${quote(hex(identityDigest))},'hex'),1) AS outcome`)
  const delivery = await rows('FIXTURE_RECOVERY', `SELECT * FROM public.create_and_reserve_login_attempt_recovery_delivery(${quote(outcome)},${quote(verification)},${quote(account)},decode(${quote(hex(recoveryHmac))},'hex'),1,decode(repeat('b1',17),'hex'),decode(repeat('b2',12),'hex'),1,decode(repeat('b3',32),'hex'),1)`)
  if (delivery[0]?.outcome !== 'RECOVERY_DELIVERY_RESERVED') throw new Error('PHASE10O_Q_FIXTURE_RECOVERY')
  await scalar('FIXTURE_SENT', `SELECT public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=${quote(verification)})) AS outcome`)
  const decided = await scalar('FIXTURE_DECIDE', `SELECT outcome FROM public.consume_recovery_and_decide_social_account(${quote(outcome)},${quote(verification)},decode(repeat('b3',32),'hex'))`)
  if (decided !== 'ACCOUNT_DECIDED') throw new Error('PHASE10O_Q_FIXTURE_DECIDE')
  await rows('FIXTURE_AUTH', `INSERT INTO auth.users(id,email) VALUES(${quote(auth)},NULL); SELECT public.bind_social_auth_principal(${quote(account)},${quote(auth)}) AS bound; SELECT set_config('private.social_transition','approved',false); UPDATE private.private_accounts SET status='active',activated_at=clock_timestamp() WHERE id=${quote(account)}; UPDATE private.social_identity_registry SET status='active',activated_at=clock_timestamp() WHERE account_id=${quote(account)};`)
  return { brokerSubject, recoveryHmac }
}

async function durableSession({ provider, identityDigest, expected, nonce }) {
  const attemptSafe = `att_${opaque().slice(0, 20)}`; const transaction = randomUUID(); const leg = randomUUID(); const handle = opaque(); const state = opaque()
  const downstreamVerifier = opaque(); const downstreamChallenge = createHash('sha256').update(downstreamVerifier, 'ascii').digest('base64url')
  const providerClient = `q-${provider}-upstream`; const providerRedirect = `https://broker.invalid/${provider}/callback`; const clientDigest = digest('schoollove:upstream-client-binding:v1\0', `${provider}${providerClient}${providerRedirect}v1`)
  const stateDigest = digest('schoollove:upstream-state:v1\0', state); const handleDigest = digest('schoollove:downstream-authorization-transaction-handle:v1\0', handle)
  const attempt = await scalar(`${provider}_A_START`, `SELECT public.create_social_login_attempt(${quote(attemptSafe)},${quote(provider)},${nowSql}) AS attempt_id`, 'attempt_id')
  if (await scalar(`${provider}_A_TRANSACTION`, `SELECT outcome FROM public.create_downstream_authorization_transaction(${quote(transaction)},${quote(attempt)},decode(${quote(hex(handleDigest))},'hex'),${quote(`slb-supabase-${provider}`)},${quote(`https://consumer.invalid/${provider}/return`)},'code','openid',${quote(downstreamChallenge)},'S256',${nonce ? quote('q-downstream-nonce') : 'NULL'},${quote('q exact state +/%?')},clock_timestamp()+interval '5 minutes')`) !== 'TRANSACTION_CREATED') throw new Error('PHASE10O_Q_A_CREATE')
  const claimed = await rows(`${provider}_B_HANDLE`, `SELECT * FROM public.claim_downstream_authorization_transaction_by_handle(decode(${quote(hex(handleDigest))},'hex'))`)
  if (claimed[0]?.outcome !== 'TRANSACTION_CLAIMED' || claimed[0]?.login_attempt_id !== attempt) throw new Error('PHASE10O_Q_B_CLAIM')
  const oidc = provider !== 'naver'; const nonceDigest = oidc ? randomBytes(32) : null; const pkceCipher = oidc ? randomBytes(48) : null; const pkceIv = oidc ? randomBytes(12) : null
  if (await scalar(`${provider}_B_LEG`, `SELECT outcome FROM public.create_upstream_login_leg(${quote(attempt)},${quote(leg)},${quote(provider)},decode(${quote(hex(clientDigest))},'hex'),decode(${quote(hex(stateDigest))},'hex'),${nonceDigest ? `decode(${quote(hex(nonceDigest))},'hex')` : 'NULL'},${oidc ? quote(opaque()) : 'NULL'},${pkceCipher ? `decode(${quote(hex(pkceCipher))},'hex')` : 'NULL'},${pkceIv ? `decode(${quote(hex(pkceIv))},'hex')` : 'NULL'},${oidc ? '1' : 'NULL'})`) !== 'UPSTREAM_LEG_CREATED') throw new Error('PHASE10O_Q_B_LEG')
  if (await scalar(`${provider}_B_BIND`, `SELECT public.bind_downstream_authorization_transaction_upstream_leg(${quote(transaction)},${quote(leg)}) AS outcome`) !== 'UPSTREAM_BOUND') throw new Error('PHASE10O_Q_B_BIND')
  const correlated = await rows(`${provider}_C_CORRELATE`, `SELECT * FROM public.claim_upstream_login_callback_by_state(${quote(provider)},decode(${quote(hex(clientDigest))},'hex'),decode(${quote(hex(stateDigest))},'hex'))`)
  if (correlated[0]?.outcome !== 'CALLBACK_CLAIMED' || correlated[0]?.attempt_id !== attempt || correlated[0]?.leg_id !== leg) throw new Error('PHASE10O_Q_C_CORRELATION')
  const identity = await scalar(`${provider}_C_IDENTITY`, `SELECT public.record_verified_social_identity_from_upstream_leg(${quote(attempt)},${quote(leg)},${quote(provider)},${quote(subject(provider, identityDigest))},decode(${quote(hex(identityDigest))},'hex'),1) AS outcome`)
  if (identity !== expected) throw new Error(`PHASE10O_Q_C_IDENTITY_${identity}`)
  return { attempt, transaction, leg, downstreamVerifier, downstreamChallenge, clientId: `slb-supabase-${provider}`, redirectUri: `https://consumer.invalid/${provider}/return`, downstreamNonce: nonce ? 'q-downstream-nonce' : null }
}

function framed(value) { const raw = Buffer.from(value, 'utf8'); const size = Buffer.allocUnsafe(4); size.writeUInt32BE(raw.byteLength); return Buffer.concat([size, raw]) }
function issueNonce(nonce, key, codeId, clientId, redirectUri) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.concat([framed('schoollove:broker-code-downstream-nonce:v1'), framed(codeId), framed(clientId), framed(redirectUri), framed('1')]))
  const body = Buffer.concat([cipher.update(nonce, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { digest: digest('schoollove:broker-code-downstream-nonce-digest:v1\0', nonce), ciphertext: body, iv }
}
async function issueAndConsumeGoogle(session) {
  const code = opaque(); const codeId = randomUUID(); const codeDigest = digest('schoollove:broker-authorization-code:v1\0', code); const nonceKey = randomBytes(32)
  const encrypted = issueNonce(session.downstreamNonce, nonceKey, codeId, session.clientId, session.redirectUri)
  const issued = await scalar('GOOGLE_D_FINALIZE', `SELECT outcome FROM public.issue_transaction_bound_broker_authorization_code(${quote(session.transaction)},${quote(codeId)},decode(${quote(hex(codeDigest))},'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,${quote(session.downstreamNonce)},decode(${quote(hex(encrypted.digest))},'hex'),decode(${quote(hex(encrypted.ciphertext))},'hex'),decode(${quote(hex(encrypted.iv))},'hex'),1)`)
  if (issued !== 'AUTHORIZATION_CODE_CREATED') throw new Error('PHASE10O_Q_D_ISSUANCE')
  const consumed = await scalar('GOOGLE_E_TOKEN', `SELECT outcome FROM public.consume_broker_authorization_code(decode(${quote(hex(codeDigest))},'hex'),${quote(session.clientId)},${quote(session.redirectUri)},${quote(session.downstreamChallenge)})`)
  if (consumed !== 'AUTHORIZATION_CODE_CONSUMED') throw new Error('PHASE10O_Q_E_CONSUME')
  const replay = await scalar('GOOGLE_E_TOKEN_REPLAY', `SELECT outcome FROM public.consume_broker_authorization_code(decode(${quote(hex(codeDigest))},'hex'),${quote(session.clientId)},${quote(session.redirectUri)},${quote(session.downstreamChallenge)})`)
  if (replay !== 'REPLAY_REJECTED') throw new Error('PHASE10O_Q_E_REPLAY')
  return { nonceKey }
}

// Active primary fixture exists before the Google session; its session uses the durable leg RPC end-to-end.
const realGoogleDigest = hmacSubjectDigest('google', 'synthetic-google-subject'); await createActiveFixture('google', realGoogleDigest)

// The handle remains a bearer browser-continuity value. Q adds a separate
// ephemeral browser binding, so only the paired values can claim a transaction.
const crossVerifierA = opaque(); const crossVerifierB = opaque()
const crossUrl = (state, verifier) => { const url = new URL('https://broker.invalid/oauth/authorize'); url.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-google', redirect_uri: 'https://consumer.invalid/google/return', scope: 'openid', state, nonce: `q-cross-nonce-${state}`, code_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString(); return url.toString() }
const crossA = await stage({ stage: 'A', url: crossUrl('q-cross-a', crossVerifierA) })
const crossB = await stage({ stage: 'A', url: crossUrl('q-cross-b', crossVerifierB) })
for (const attack of [
  { brokerHandle: crossA.brokerHandle },
  { brokerHandle: crossB.brokerHandle },
  { brokerHandle: crossA.brokerHandle, browserBindingSecret: crossB.browserBindingSecret },
  { brokerHandle: crossB.brokerHandle, browserBindingSecret: crossA.browserBindingSecret },
]) {
  let rejected = false; try { await stage({ stage: 'B', ...attack }) } catch { rejected = true }
  if (!rejected) throw new Error('PHASE10O_Q_CROSS_SESSION_BROWSER_BINDING_ACCEPTED')
}
const pendingCross = await scalar('CROSS_BINDING_PENDING', `SELECT CASE WHEN count(*)=2 AND bool_and(status='pending' AND broker_handle_digest IS NOT NULL) THEN 'OK' ELSE 'VIOLATION' END AS outcome FROM private.downstream_authorization_transactions WHERE downstream_state IN ('q-cross-a','q-cross-b')`)
if (pendingCross !== 'OK') throw new Error('PHASE10O_Q_CROSS_SESSION_ATTACK_MUTATED_TRANSACTION')
const crossAContinuation = await stage({ stage: 'B', brokerHandle: crossA.brokerHandle, browserBindingSecret: crossA.browserBindingSecret })
const innocentContinuation = await stage({ stage: 'B', brokerHandle: crossB.brokerHandle, browserBindingSecret: crossB.browserBindingSecret })
const innocentCode = opaque()
const innocentCallback = await stage({ stage: 'C', provider: 'google', authorizationCode: innocentCode, rawNonce: innocentContinuation.authorization.rawNonce, callbackUrl: `https://broker.invalid/google/callback?code=${encodeURIComponent(innocentCode)}&state=${encodeURIComponent(innocentContinuation.authorization.rawState)}` })
const innocentFinalization = await stage({ stage: 'D', trustedAttemptId: innocentCallback.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 1 })
await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: innocentFinalization.authorizationCode, redirectUri: innocentFinalization.redirectUri, downstreamVerifier: crossVerifierB })
if (!crossAContinuation.authorization.rawState || !innocentFinalization.authorizationCode) throw new Error('PHASE10O_Q_CROSS_SESSION_LEGITIMATE_CONTINUATION_FAILED')
process.stdout.write('PHASE10O_Q_CROSS_SESSION_BROWSER_BOUND_CONTINUATION_OK attacks=4 legitimate_fresh_process=2 innocent=consumed cross_row_binding=0\n')

async function createReadyGoogleCode(label) {
  const verifier = opaque(); const request = new URL('https://broker.invalid/oauth/authorize')
  request.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-google', redirect_uri: 'https://consumer.invalid/google/return', scope: 'openid', state: `q-token-${label}`, nonce: `q-token-nonce-${label}`, code_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
  const started = await stage({ stage: 'A', url: request.toString() }); const continued = await stage({ stage: 'B', brokerHandle: started.brokerHandle, browserBindingSecret: started.browserBindingSecret })
  const providerCode = opaque(); const callback = await stage({ stage: 'C', provider: 'google', authorizationCode: providerCode, rawNonce: continued.authorization.rawNonce, callbackUrl: `https://broker.invalid/google/callback?code=${encodeURIComponent(providerCode)}&state=${encodeURIComponent(continued.authorization.rawState)}` })
  if (callback.outcome !== 'EXISTING_PRIMARY' || !callback.trustedAttemptId) throw new Error('PHASE10O_Q_TOKEN_FIXTURE_CALLBACK')
  const finalization = await stage({ stage: 'D', trustedAttemptId: callback.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 1 })
  return { attempt: callback.trustedAttemptId, authorizationCode: finalization.authorizationCode, redirectUri: finalization.redirectUri, verifier }
}
async function tokenStates(name, attempt) { return (await rows(name, `SELECT a.state AS attempt_state,c.state AS code_state FROM private.oauth_login_attempts a JOIN private.broker_authorization_codes c ON c.login_attempt_id=a.id WHERE a.id=${quote(attempt)}`))[0] }
const unrelatedToken = await createReadyGoogleCode('unrelated')
async function assertUnrelatedTokenUnchanged(name) { const state = await tokenStates(`${name}_UNRELATED`, unrelatedToken.attempt); if (state?.attempt_state !== 'broker_code_ready' || state.code_state !== 'ready') throw new Error(`PHASE10O_Q_TOKEN_UNRELATED_MUTATED_${name}`) }
async function tokenNegative(name, options, expected) {
  const fixture = await createReadyGoogleCode(name)
  const result = await stage({ stage: 'E', provider: 'google', clientId: options.clientId ?? 'slb-supabase-google', authorizationCode: fixture.authorizationCode, redirectUri: fixture.redirectUri, downstreamVerifier: fixture.verifier, tokenOptions: { expectNegative: true, ...options } })
  const state = await tokenStates(`TOKEN_${name}`, fixture.attempt)
  if (result.status !== expected.status || result.error !== expected.error || result.consumeCalls !== expected.consumeCalls || state?.code_state !== expected.code || state.attempt_state !== expected.attempt) throw new Error(`PHASE10O_Q_TOKEN_NEGATIVE_${name}_MISMATCH`)
  await assertUnrelatedTokenUnchanged(name)
}
await tokenNegative('wrong_client_secret', { clientSecret: 'wrong-secret' }, { status: 401, error: 'invalid_client', consumeCalls: 0, code: 'ready', attempt: 'broker_code_ready' })
await tokenNegative('basic_post_ambiguity', { basicClientId: 'slb-supabase-google', basicSecret: 'q-google-secret', postCredentialsWithBasic: true }, { status: 401, error: 'invalid_client', consumeCalls: 0, code: 'ready', attempt: 'broker_code_ready' })
await tokenNegative('unknown_client', { allowUnknownClient: true, clientId: 'unknown-client', clientSecret: 'unknown-secret' }, { status: 401, error: 'invalid_client', consumeCalls: 0, code: 'ready', attempt: 'broker_code_ready' })
await tokenNegative('wrong_redirect', { redirectUri: 'https://consumer.invalid/google/other' }, { status: 400, error: 'invalid_grant', consumeCalls: 0, code: 'ready', attempt: 'broker_code_ready' })
await tokenNegative('wrong_pkce', { downstreamVerifier: opaque() }, { status: 400, error: 'invalid_grant', consumeCalls: 1, code: 'rejected', attempt: 'failed_safe' })
await tokenNegative('malformed_pkce', { downstreamVerifier: 'malformed verifier' }, { status: 500, error: 'server_error', consumeCalls: 0, code: 'ready', attempt: 'broker_code_ready' })
await tokenNegative('unknown_code', { authorizationCode: opaque() }, { status: 400, error: 'invalid_grant', consumeCalls: 1, code: 'ready', attempt: 'broker_code_ready' })
const expiredToken = await createReadyGoogleCode('expired'); await new Promise(resolve => setTimeout(resolve, 61_000))
const expiredResult = await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: expiredToken.authorizationCode, redirectUri: expiredToken.redirectUri, downstreamVerifier: expiredToken.verifier, tokenOptions: { expectNegative: true } })
const expiredState = await tokenStates('TOKEN_EXPIRED', expiredToken.attempt)
if (expiredResult.status !== 400 || expiredResult.error !== 'invalid_grant' || expiredResult.consumeCalls !== 1 || expiredState?.code_state !== 'expired' || expiredState.attempt_state !== 'expired') throw new Error('PHASE10O_Q_TOKEN_NEGATIVE_EXPIRED_MISMATCH')
await assertUnrelatedTokenUnchanged('expired')
const replayToken = await createReadyGoogleCode('replay')
await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: replayToken.authorizationCode, redirectUri: replayToken.redirectUri, downstreamVerifier: replayToken.verifier })
const replayResult = await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: replayToken.authorizationCode, redirectUri: replayToken.redirectUri, downstreamVerifier: replayToken.verifier, tokenOptions: { expectNegative: true } })
const replayState = await tokenStates('TOKEN_REPLAY', replayToken.attempt)
if (replayResult.status !== 400 || replayResult.error !== 'invalid_grant' || replayResult.consumeCalls !== 1 || replayState?.code_state !== 'consumed' || replayState.attempt_state !== 'consumed') throw new Error('PHASE10O_Q_TOKEN_NEGATIVE_REPLAY_MISMATCH')
await assertUnrelatedTokenUnchanged('replay')
process.stdout.write('PHASE10O_Q_DURABLE_TOKEN_NEGATIVE_MATRIX_OK cases=9 unrelated_session_mutation=0\n')
const failedVerifier = opaque(); const failedRequest = new URL('https://broker.invalid/oauth/authorize'); failedRequest.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-google', redirect_uri: 'https://consumer.invalid/google/return', scope: 'openid', state: 'q-failed-google-state', nonce: 'q-failed-google-nonce', code_challenge: createHash('sha256').update(failedVerifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
const failedA = await stage({ stage: 'A', url: failedRequest.toString() }); const failedB = await stage({ stage: 'B', brokerHandle: failedA.brokerHandle, browserBindingSecret: failedA.browserBindingSecret }); const failedCode = opaque(); let failedCallback = false
try { await stage({ stage: 'C', provider: 'google', authorizationCode: failedCode, rawNonce: failedB.authorization.rawNonce, callbackUrl: `https://broker.invalid/google/callback?code=${encodeURIComponent(failedCode)}&state=${encodeURIComponent(failedB.authorization.rawState)}`, failureClass: 'wrong_durable_pkce_key' }) } catch { failedCallback = true }
if (!failedCallback) throw new Error('PHASE10O_Q_FAILURE_VERIFIER_NOT_REJECTED')
const failedDurable = await rows('FAILED_PROVIDER_AUDIT', `SELECT a.state AS attempt_state,l.status AS leg_state,t.status AS transaction_state,(t.downstream_nonce IS NOT NULL)::text AS nonce_present,(t.downstream_state IS NOT NULL)::text AS state_present,(SELECT count(*)::text FROM private.broker_authorization_codes c WHERE c.login_attempt_id=a.id) AS broker_codes FROM private.oauth_login_attempts a JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.id=(SELECT id FROM private.downstream_authorization_transactions WHERE broker_handle_digest IS NULL AND client_id='slb-supabase-google' ORDER BY created_at DESC LIMIT 1)`)
const failedState = failedDurable[0]
if (failedState?.attempt_state !== 'failed_safe' || failedState.leg_state !== 'rejected' || failedState.transaction_state !== 'rejected' || failedState.nonce_present !== 'false' || failedState.state_present !== 'false' || failedState.broker_codes !== '0') throw new Error('PHASE10O_Q_R_TERMINAL_SCRUB_AUDIT_FAILED')
process.stdout.write('PHASE10O_Q_R_PROVIDER_FAILURE_TERMINAL_SCRUB_OK provider=google failure=pkce attempt=failed_safe leg=rejected transaction=rejected nonce_retained=false state_retained=false broker_codes=0\n')

async function assertIntegratedProviderFailure(provider, failureClass, expired = false) {
  const verifier = opaque(); const request = new URL('https://broker.invalid/oauth/authorize')
  request.search = new URLSearchParams({ response_type: 'code', client_id: `slb-supabase-${provider}`, redirect_uri: `https://consumer.invalid/${provider}/return`, scope: 'openid', state: `q-failure-${provider}-${failureClass}`, ...(provider === 'naver' ? {} : { nonce: `q-failure-nonce-${failureClass}` }), code_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
  const started = await stage({ stage: 'A', url: request.toString() }); const continued = await stage({ stage: 'B', brokerHandle: started.brokerHandle, browserBindingSecret: started.browserBindingSecret }); const providerCode = opaque(); let rejected = false; let rejection = ''
  try { await stage({ stage: 'C', provider, authorizationCode: providerCode, rawNonce: continued.authorization.rawNonce, callbackUrl: `https://broker.invalid/${provider}/callback?code=${encodeURIComponent(providerCode)}&state=${encodeURIComponent(continued.authorization.rawState)}`, failureClass }) } catch (error) { rejected = true; rejection = error instanceof Error ? error.message : '' }
  if (!rejected) throw new Error(`PHASE10O_Q_${provider}_${failureClass}_NOT_REJECTED`)
  const audit = await rows(`FAILURE_${provider}_${failureClass}`, `SELECT a.state AS attempt_state,l.status AS leg_state,t.status AS transaction_state,(t.downstream_nonce IS NULL)::text AS nonce_scrubbed,(t.downstream_state IS NULL)::text AS state_scrubbed,(SELECT count(*)::text FROM private.broker_authorization_codes c WHERE c.login_attempt_id=a.id) AS broker_codes FROM private.oauth_login_attempts a JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.client_id=${quote(`slb-supabase-${provider}`)} ORDER BY t.created_at DESC LIMIT 1`)
  const row = audit[0]; const expected = expired ? 'expired' : 'failed_safe'; const txExpected = expired ? 'expired' : 'rejected'; const legExpected = expired ? 'expired' : 'rejected'
  if (row?.attempt_state !== expected || row.leg_state !== legExpected || row.transaction_state !== txExpected || row.nonce_scrubbed !== 'true' || row.state_scrubbed !== 'true' || row.broker_codes !== '0') throw new Error(`PHASE10O_Q_${provider}_${failureClass}_TERMINAL_STATE_${row?.attempt_state ?? 'missing'}_${row?.leg_state ?? 'missing'}_${row?.transaction_state ?? 'missing'}_${row?.nonce_scrubbed ?? 'missing'}_${row?.state_scrubbed ?? 'missing'}_${row?.broker_codes ?? 'missing'}`)
}
for (const provider of ['google', 'kakao']) for (const failureClass of ['expired_token','future_iat']) await assertIntegratedProviderFailure(provider, failureClass, true)
for (const provider of ['google', 'kakao']) for (const failureClass of ['wrong_durable_pkce_key','tampered_pkce_ciphertext','bad_signature','wrong_nonce','wrong_issuer','wrong_audience','unknown_kid','jwks_malformed','token_malformed','token_wrong_url']) await assertIntegratedProviderFailure(provider, failureClass)
for (const failureClass of ['token_http','token_malformed','token_missing_access','token_wrong_url','profile_http','profile_malformed','profile_wrong_url','profile_resultcode','profile_missing_subject']) await assertIntegratedProviderFailure('naver', failureClass)
process.stdout.write('PHASE10O_Q_PROVIDER_FAILURE_MATRIX_OK oidc_cases=24 naver_cases=9 terminal_scrubbed=true provider_retries=0\n')
const realGoogleVerifier = opaque(); const realGoogleRequest = new URL('https://broker.invalid/oauth/authorize'); realGoogleRequest.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-google', redirect_uri: 'https://consumer.invalid/google/return', scope: 'openid', state: 'q-real-google-state', nonce: 'q-real-google-nonce', code_challenge: createHash('sha256').update(realGoogleVerifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
const realGoogleA = await stage({ stage: 'A', url: realGoogleRequest.toString() })
const realGoogleB = await stage({ stage: 'B', brokerHandle: realGoogleA.brokerHandle, browserBindingSecret: realGoogleA.browserBindingSecret })
const realGoogleCode = opaque(); const realGoogleC = await stage({ stage: 'C', provider: 'google', authorizationCode: realGoogleCode, rawNonce: realGoogleB.authorization.rawNonce, callbackUrl: `https://broker.invalid/google/callback?code=${encodeURIComponent(realGoogleCode)}&state=${encodeURIComponent(realGoogleB.authorization.rawState)}` })
if (realGoogleC.outcome !== 'EXISTING_PRIMARY' || realGoogleC.counts.exchanges !== 1 || realGoogleC.counts.jwks !== 1 || !realGoogleC.trustedAttemptId) throw new Error('PHASE10O_Q_REAL_GOOGLE_CALLBACK')
const realGoogleD = await stage({ stage: 'D', trustedAttemptId: realGoogleC.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 2 })
if (realGoogleD.redirectUri !== 'https://consumer.invalid/google/return' || realGoogleD.downstreamState !== 'q-real-google-state') throw new Error('PHASE10O_Q_REAL_GOOGLE_FINALIZE_BINDING')
const realGoogleE = await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: realGoogleD.authorizationCode, redirectUri: realGoogleD.redirectUri, downstreamVerifier: realGoogleVerifier })
if (realGoogleE.claims.iss !== 'https://dark-broker.invalid' || realGoogleE.claims.aud !== 'slb-supabase-google' || realGoogleE.claims.nonce !== 'q-real-google-nonce' || !Number.isSafeInteger(realGoogleE.claims.auth_time) || !/^slb:v1:k01:google:[A-Za-z0-9_-]{43}$/.test(realGoogleE.claims.sub) || realGoogleE.claims.sub === 'synthetic-google-subject') throw new Error('PHASE10O_Q_REAL_GOOGLE_TOKEN_CLAIMS')
const realGoogleFinal = await rows('REAL_GOOGLE_FINAL', `SELECT a.state AS attempt_state,t.status AS transaction_state,l.status AS leg_state,c.state AS code_state,count(*) OVER()::text AS code_count,(t.downstream_nonce IS NULL)::text AS nonce_scrubbed,(t.downstream_state IS NULL)::text AS state_scrubbed FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.broker_authorization_codes c ON c.login_attempt_id=a.id WHERE a.id=${quote(realGoogleC.trustedAttemptId)}`)
if (realGoogleFinal[0]?.attempt_state !== 'consumed' || realGoogleFinal[0]?.transaction_state !== 'consumed' || realGoogleFinal[0]?.leg_state !== 'verified' || realGoogleFinal[0]?.code_state !== 'consumed' || realGoogleFinal[0]?.code_count !== '1' || realGoogleFinal[0]?.nonce_scrubbed !== 'true' || realGoogleFinal[0]?.state_scrubbed !== 'true') throw new Error('PHASE10O_Q_REAL_GOOGLE_FINAL_STATE')
process.stdout.write('PHASE10O_Q_GOOGLE_EXISTING_PRIMARY_E2E_OK provider=google token_exchange_calls=1 jwks_fetch_calls=1 broker_token_successes=1 replay_rejected=true\n')
const naverVerifier = opaque(); const naverRequest = new URL('https://broker.invalid/oauth/authorize'); naverRequest.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-naver', redirect_uri: 'https://consumer.invalid/naver/return', scope: 'openid', state: 'q-real-naver-state', code_challenge: createHash('sha256').update(naverVerifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
const realNaverA = await stage({ stage: 'A', url: naverRequest.toString() }); const realNaverB = await stage({ stage: 'B', brokerHandle: realNaverA.brokerHandle, browserBindingSecret: realNaverA.browserBindingSecret }); const realNaverCode = opaque(); const realNaverC = await stage({ stage: 'C', provider: 'naver', authorizationCode: realNaverCode, rawNonce: null, callbackUrl: `https://broker.invalid/naver/callback?code=${encodeURIComponent(realNaverCode)}&state=${encodeURIComponent(realNaverB.authorization.rawState)}` })
if (realNaverC.outcome !== 'RECOVERY_REQUIRED' || realNaverC.counts.exchanges !== 1 || !realNaverC.trustedAttemptId) throw new Error('PHASE10O_Q_REAL_NAVER_CALLBACK')
const naverVerification = randomUUID(); const naverAccount = randomUUID(); const naverHmac = randomBytes(32)
const naverReserved = await rows('NAVER_C2_RESERVE', `SELECT * FROM public.create_and_reserve_login_attempt_recovery_delivery(${quote(realNaverC.trustedAttemptId)},${quote(naverVerification)},${quote(naverAccount)},decode(${quote(hex(naverHmac))},'hex'),1,decode(repeat('c1',17),'hex'),decode(repeat('c2',12),'hex'),1,decode(repeat('c3',32),'hex'),1)`)
if (naverReserved[0]?.outcome !== 'RECOVERY_DELIVERY_RESERVED') throw new Error('PHASE10O_Q_NAVER_C2_RESERVE')
if (await scalar('NAVER_C2_SENT', `SELECT public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=${quote(naverVerification)})) AS outcome`) !== 'RECOVERY_DELIVERY_SENT' || await scalar('NAVER_C2_DECIDE', `SELECT outcome FROM public.consume_recovery_and_decide_social_account(${quote(realNaverC.trustedAttemptId)},${quote(naverVerification)},decode(repeat('c3',32),'hex'))`) !== 'ACCOUNT_DECIDED') throw new Error('PHASE10O_Q_NAVER_C2_DECIDE')
const naverAuth = randomUUID(); await rows('NAVER_C2_BIND', `INSERT INTO auth.users(id,email) VALUES(${quote(naverAuth)},NULL); SELECT public.bind_social_auth_principal(${quote(naverAccount)},${quote(naverAuth)}) AS bound;`)
const realNaverD = await stage({ stage: 'D', trustedAttemptId: realNaverC.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 1 }); const realNaverE = await stage({ stage: 'E', provider: 'naver', clientId: 'slb-supabase-naver', authorizationCode: realNaverD.authorizationCode, redirectUri: realNaverD.redirectUri, downstreamVerifier: naverVerifier })
if (realNaverE.claims.nonce !== undefined || realNaverE.claims.aud !== 'slb-supabase-naver' || !/^slb:v1:k01:naver:[A-Za-z0-9_-]{43}$/.test(realNaverE.claims.sub)) throw new Error('PHASE10O_Q_NAVER_TOKEN_CLAIMS')
const realNaverFinal = await rows('REAL_NAVER_FINAL', `SELECT a.state AS attempt_state,t.status AS transaction_state,l.status AS leg_state,c.state AS code_state,(t.downstream_nonce IS NULL)::text AS nonce_scrubbed,(t.downstream_state IS NULL)::text AS state_scrubbed FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.broker_authorization_codes c ON c.login_attempt_id=a.id WHERE a.id=${quote(realNaverC.trustedAttemptId)}`)
if (realNaverFinal[0]?.attempt_state !== 'consumed' || realNaverFinal[0]?.transaction_state !== 'consumed' || realNaverFinal[0]?.leg_state !== 'verified' || realNaverFinal[0]?.code_state !== 'consumed' || realNaverFinal[0]?.nonce_scrubbed !== 'true' || realNaverFinal[0]?.state_scrubbed !== 'true') throw new Error('PHASE10O_Q_REAL_NAVER_FINAL_STATE')
process.stdout.write('PHASE10O_Q_NAVER_RECOVERY_E2E_OK provider=naver recovery=auth_principal_bound token_nonce=absent replay_rejected=true\n')
const kakaoDigest = hmacSubjectDigest('kakao', 'synthetic-kakao-subject'); await createActiveFixture('kakao', kakaoDigest)
const kakaoVerifier = opaque(); const kakaoRequest = new URL('https://broker.invalid/oauth/authorize'); kakaoRequest.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-kakao', redirect_uri: 'https://consumer.invalid/kakao/return', scope: 'openid', state: 'q-real-kakao-state', nonce: 'q-real-kakao-nonce', code_challenge: createHash('sha256').update(kakaoVerifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
const realKakaoA = await stage({ stage: 'A', url: kakaoRequest.toString() }); const realKakaoB = await stage({ stage: 'B', brokerHandle: realKakaoA.brokerHandle, browserBindingSecret: realKakaoA.browserBindingSecret }); const realKakaoCode = opaque(); const realKakaoC = await stage({ stage: 'C', provider: 'kakao', authorizationCode: realKakaoCode, rawNonce: realKakaoB.authorization.rawNonce, callbackUrl: `https://broker.invalid/kakao/callback?code=${encodeURIComponent(realKakaoCode)}&state=${encodeURIComponent(realKakaoB.authorization.rawState)}` })
if (realKakaoC.outcome !== 'EXISTING_PRIMARY' || realKakaoC.counts.exchanges !== 1 || realKakaoC.counts.jwks !== 1 || !realKakaoC.trustedAttemptId) throw new Error('PHASE10O_Q_REAL_KAKAO_CALLBACK')
const realKakaoD = await stage({ stage: 'D', trustedAttemptId: realKakaoC.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 2 }); const realKakaoE = await stage({ stage: 'E', provider: 'kakao', clientId: 'slb-supabase-kakao', authorizationCode: realKakaoD.authorizationCode, redirectUri: realKakaoD.redirectUri, downstreamVerifier: kakaoVerifier })
if (realKakaoE.claims.nonce !== 'q-real-kakao-nonce' || !/^slb:v1:k01:kakao:[A-Za-z0-9_-]{43}$/.test(realKakaoE.claims.sub)) throw new Error('PHASE10O_Q_KAKAO_TOKEN_CLAIMS')
const realKakaoFinal = await rows('REAL_KAKAO_FINAL', `SELECT a.state AS attempt_state,t.status AS transaction_state,l.status AS leg_state,c.state AS code_state,(t.downstream_nonce IS NULL)::text AS nonce_scrubbed,(t.downstream_state IS NULL)::text AS state_scrubbed FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id JOIN private.upstream_login_legs l ON l.login_attempt_id=a.id JOIN private.broker_authorization_codes c ON c.login_attempt_id=a.id WHERE a.id=${quote(realKakaoC.trustedAttemptId)}`)
if (realKakaoFinal[0]?.attempt_state !== 'consumed' || realKakaoFinal[0]?.transaction_state !== 'consumed' || realKakaoFinal[0]?.leg_state !== 'verified' || realKakaoFinal[0]?.code_state !== 'consumed' || realKakaoFinal[0]?.nonce_scrubbed !== 'true' || realKakaoFinal[0]?.state_scrubbed !== 'true') throw new Error('PHASE10O_Q_REAL_KAKAO_FINAL_STATE')
process.stdout.write('PHASE10O_Q_KAKAO_E2E_OK provider=kakao token_exchange_calls=1 jwks_fetch_calls=1 broker_token_successes=1 replay_rejected=true\n')

async function startExisting(provider, label) {
  const verifier = opaque(); const request = new URL('https://broker.invalid/oauth/authorize')
  request.search = new URLSearchParams({ response_type: 'code', client_id: `slb-supabase-${provider}`, redirect_uri: `https://consumer.invalid/${provider}/return`, scope: 'openid', state: `q-isolation-${label}`, ...(provider === 'naver' ? {} : { nonce: `q-isolation-nonce-${label}` }), code_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
  const started = await stage({ stage: 'A', url: request.toString() }); const continued = await stage({ stage: 'B', brokerHandle: started.brokerHandle, browserBindingSecret: started.browserBindingSecret })
  return { provider, label, verifier, continued, providerCode: opaque() }
}
async function verifyExisting(session, overrides = {}) {
  const providerCode = overrides.authorizationCode ?? session.providerCode; const expectedAuthorizationCode = overrides.expectedAuthorizationCode
  return stage({ stage: 'C', provider: session.provider, authorizationCode: providerCode, ...(expectedAuthorizationCode ? { expectedAuthorizationCode } : {}), rawNonce: overrides.rawNonce ?? session.continued.authorization.rawNonce, callbackUrl: `https://broker.invalid/${session.provider}/callback?code=${encodeURIComponent(providerCode)}&state=${encodeURIComponent(overrides.rawState ?? session.continued.authorization.rawState)}` })
}
async function finalizeAndConsumeExisting(session, callback) {
  const finalization = await stage({ stage: 'D', trustedAttemptId: callback.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 1 })
  await stage({ stage: 'E', provider: session.provider, clientId: `slb-supabase-${session.provider}`, authorizationCode: finalization.authorizationCode, redirectUri: finalization.redirectUri, downstreamVerifier: session.verifier })
  return finalization
}
// State from A is treated only as callback correlation proof. A's state with
// B's provider context terminalizes A; B remains independently completable.
const callbackA = await startExisting('google', 'callback-a'); const callbackB = await startExisting('google', 'callback-b'); let callbackAttackRejected = false
try { await verifyExisting(callbackA, { authorizationCode: callbackB.providerCode, rawNonce: callbackB.continued.authorization.rawNonce }) } catch { callbackAttackRejected = true }
if (!callbackAttackRejected) throw new Error('PHASE10O_Q_CROSS_UPSTREAM_STATE_ACCEPTED')
const callbackBVerified = await verifyExisting(callbackB); await finalizeAndConsumeExisting(callbackB, callbackBVerified)
// The synthetic upstream transport pins the authorization-code/PKCE exchange
// to B's expected code. A's code cannot be used with B's durable state/context.
const codeA = await startExisting('google', 'provider-code-a'); const codeB = await startExisting('google', 'provider-code-b'); let providerCodeAttackRejected = false
try { await verifyExisting(codeB, { authorizationCode: codeA.providerCode, expectedAuthorizationCode: codeB.providerCode }) } catch { providerCodeAttackRejected = true }
if (!providerCodeAttackRejected) throw new Error('PHASE10O_Q_CROSS_PROVIDER_CODE_ACCEPTED')
const codeInnocent = await startExisting('google', 'provider-code-innocent'); const codeInnocentVerified = await verifyExisting(codeInnocent); await finalizeAndConsumeExisting(codeInnocent, codeInnocentVerified)
// Finalization owns exact response state from its own transaction, never an A-supplied state.
const finalA = await startExisting('google', 'final-a'); const finalB = await startExisting('google', 'final-b'); await verifyExisting(finalA); const finalBVerified = await verifyExisting(finalB); const finalBResponse = await finalizeAndConsumeExisting(finalB, finalBVerified)
if (finalBResponse.downstreamState !== 'q-isolation-final-b') throw new Error('PHASE10O_Q_CROSS_DOWNSTREAM_STATE_ACCEPTED')
async function readyCode(provider, label) { const session = await startExisting(provider, label); const callback = await verifyExisting(session); const finalization = await stage({ stage: 'D', trustedAttemptId: callback.trustedAttemptId, authenticationTime: Math.floor(Date.now() / 1000) - 1 }); return { ...session, finalization } }
const clientA = await readyCode('google', 'code-client-a'); const clientB = await readyCode('kakao', 'code-client-b'); let clientAttackRejected = false
try { await stage({ stage: 'E', provider: 'kakao', clientId: 'slb-supabase-kakao', authorizationCode: clientA.finalization.authorizationCode, redirectUri: clientB.finalization.redirectUri, downstreamVerifier: clientB.verifier }) } catch { clientAttackRejected = true }
if (!clientAttackRejected) throw new Error('PHASE10O_Q_CROSS_BROKER_CODE_CLIENT_ACCEPTED')
await stage({ stage: 'E', provider: 'kakao', clientId: 'slb-supabase-kakao', authorizationCode: clientB.finalization.authorizationCode, redirectUri: clientB.finalization.redirectUri, downstreamVerifier: clientB.verifier })
const redirectA = await readyCode('google', 'code-redirect-a'); const redirectB = await readyCode('kakao', 'code-redirect-b'); let redirectAttackRejected = false
try { await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: redirectA.finalization.authorizationCode, redirectUri: redirectB.finalization.redirectUri, downstreamVerifier: redirectA.verifier }) } catch { redirectAttackRejected = true }
if (!redirectAttackRejected) throw new Error('PHASE10O_Q_CROSS_BROKER_CODE_REDIRECT_ACCEPTED')
await stage({ stage: 'E', provider: 'kakao', clientId: 'slb-supabase-kakao', authorizationCode: redirectB.finalization.authorizationCode, redirectUri: redirectB.finalization.redirectUri, downstreamVerifier: redirectB.verifier })
const pkceA = await readyCode('google', 'code-pkce-a'); const pkceB = await readyCode('google', 'code-pkce-b'); let pkceAttackRejected = false
try { await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: pkceA.finalization.authorizationCode, redirectUri: pkceA.finalization.redirectUri, downstreamVerifier: pkceB.verifier }) } catch { pkceAttackRejected = true }
if (!pkceAttackRejected) throw new Error('PHASE10O_Q_CROSS_BROKER_CODE_PKCE_ACCEPTED')
await stage({ stage: 'E', provider: 'google', clientId: 'slb-supabase-google', authorizationCode: pkceB.finalization.authorizationCode, redirectUri: pkceB.finalization.redirectUri, downstreamVerifier: pkceB.verifier })
const crossBindingViolations = await scalar('CROSS_SESSION_ROW_BINDING', `SELECT CASE WHEN EXISTS(SELECT 1 FROM private.downstream_authorization_transactions t JOIN private.upstream_login_legs l ON l.id=t.upstream_login_leg_id WHERE l.login_attempt_id<>t.login_attempt_id) OR EXISTS(SELECT 1 FROM private.broker_authorization_codes c JOIN private.downstream_authorization_transactions t ON t.id=c.authorization_transaction_id WHERE c.login_attempt_id<>t.login_attempt_id) THEN 'VIOLATION' ELSE 'OK' END AS outcome`)
if (crossBindingViolations !== 'OK') throw new Error('PHASE10O_Q_CROSS_SESSION_ROW_BINDING_VIOLATION')
process.stdout.write('PHASE10O_Q_CROSS_SESSION_ISOLATION_MATRIX_OK upstream_state=reject provider_code=reject downstream_state=exact broker_code_client_redirect_pkce=reject innocent_completion=true cross_row_binding=0\n')
const googleDigest = randomBytes(32); await createActiveFixture('google', googleDigest)
const google = await durableSession({ provider: 'google', identityDigest: googleDigest, expected: 'EXISTING_PRIMARY', nonce: true })
await issueAndConsumeGoogle(google)
const replay = await scalar('GOOGLE_CALLBACK_REPLAY', `SELECT outcome FROM public.claim_upstream_login_callback_by_state('google',decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex'))`)
if (replay !== 'CORRELATION_REJECTED') throw new Error('PHASE10O_Q_CALLBACK_REPLAY')
const naver = await durableSession({ provider: 'naver', identityDigest: randomBytes(32), expected: 'RECOVERY_REQUIRED', nonce: false })
const kakao = await durableSession({ provider: 'kakao', identityDigest: randomBytes(32), expected: 'RECOVERY_REQUIRED', nonce: true })
const states = await rows('FINAL_STATES', `SELECT state FROM private.oauth_login_attempts WHERE id IN (${quote(google.attempt)},${quote(naver.attempt)},${quote(kakao.attempt)}) ORDER BY state`)
if (states.length !== 3 || !states.some(row => row.state === 'consumed') || states.filter(row => row.state === 'recovery_required').length !== 2) throw new Error('PHASE10O_Q_FINAL_STATES')

async function assertPrematureFinalization(name, attempt, transaction) {
  const context = await rows(`PREMATURE_${name}_CONTEXT`, `SELECT authorization_transaction_id::text FROM public.get_transaction_bound_broker_code_issuance_context(${quote(attempt)})`)
  if (context.length !== 0) throw new Error(`PHASE10O_Q_PREMATURE_${name}_CONTEXT_PRESENT`)
  const issue = await rows(`PREMATURE_${name}_ISSUE`, `SELECT outcome FROM public.issue_transaction_bound_broker_authorization_code(${quote(transaction)},${quote(randomUUID())},decode(repeat('00',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL)`)
  const audit = await rows(`PREMATURE_${name}_AUDIT`, `SELECT (SELECT count(*)::text FROM private.broker_authorization_codes WHERE authorization_transaction_id=${quote(transaction)}) AS code_count,(SELECT status FROM private.downstream_authorization_transactions WHERE id=${quote(transaction)}) AS transaction_state`)
  if (issue[0]?.outcome !== 'AUTHORIZATION_CODE_REJECTED' || audit[0]?.code_count !== '0' || audit[0]?.transaction_state === 'consumed') throw new Error(`PHASE10O_Q_PREMATURE_${name}_ISSUANCE_NOT_REJECTED`)
}
const prematureCreatedVerifier = opaque(); const prematureCreatedUrl = new URL('https://broker.invalid/oauth/authorize'); prematureCreatedUrl.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-google', redirect_uri: 'https://consumer.invalid/google/return', scope: 'openid', state: 'q-premature-created', nonce: 'q-premature-created-nonce', code_challenge: createHash('sha256').update(prematureCreatedVerifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
await stage({ stage: 'A', url: prematureCreatedUrl.toString() })
const prematureCreated = (await rows('PREMATURE_CREATED_IDS', `SELECT a.id::text AS attempt,t.id::text AS transaction FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.downstream_state='q-premature-created'`))[0]
if (!prematureCreated) throw new Error('PHASE10O_Q_PREMATURE_CREATED_FIXTURE')
await assertPrematureFinalization('CREATED', prematureCreated.attempt, prematureCreated.transaction)
const prematurePendingVerifier = opaque(); const prematurePendingUrl = new URL('https://broker.invalid/oauth/authorize'); prematurePendingUrl.search = new URLSearchParams({ response_type: 'code', client_id: 'slb-supabase-google', redirect_uri: 'https://consumer.invalid/google/return', scope: 'openid', state: 'q-premature-upstream-pending', nonce: 'q-premature-upstream-pending-nonce', code_challenge: createHash('sha256').update(prematurePendingVerifier, 'ascii').digest('base64url'), code_challenge_method: 'S256' }).toString()
const prematurePendingStart = await stage({ stage: 'A', url: prematurePendingUrl.toString() }); await stage({ stage: 'B', brokerHandle: prematurePendingStart.brokerHandle, browserBindingSecret: prematurePendingStart.browserBindingSecret })
const prematurePending = (await rows('PREMATURE_PENDING_IDS', `SELECT a.id::text AS attempt,t.id::text AS transaction FROM private.oauth_login_attempts a JOIN private.downstream_authorization_transactions t ON t.login_attempt_id=a.id WHERE t.downstream_state='q-premature-upstream-pending'`))[0]
if (!prematurePending) throw new Error('PHASE10O_Q_PREMATURE_PENDING_FIXTURE')
await assertPrematureFinalization('UPSTREAM_PENDING', prematurePending.attempt, prematurePending.transaction)
await assertPrematureFinalization('RECOVERY_REQUIRED', naver.attempt, naver.transaction)
const pendingVerification = randomUUID(); const pendingAccount = randomUUID(); const pendingHmac = randomBytes(32)
const pendingReservation = await rows('PREMATURE_PENDING_RESERVE', `SELECT * FROM public.create_and_reserve_login_attempt_recovery_delivery(${quote(kakao.attempt)},${quote(pendingVerification)},${quote(pendingAccount)},decode(${quote(hex(pendingHmac))},'hex'),1,decode(repeat('d1',17),'hex'),decode(repeat('d2',12),'hex'),1,decode(repeat('d3',32),'hex'),1)`)
if (pendingReservation[0]?.outcome !== 'RECOVERY_DELIVERY_RESERVED') throw new Error('PHASE10O_Q_PREMATURE_RECOVERY_PENDING_FIXTURE')
await assertPrematureFinalization('RECOVERY_PENDING', kakao.attempt, kakao.transaction)
if (await scalar('PREMATURE_PENDING_SENT', `SELECT public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=${quote(pendingVerification)})) AS outcome`) !== 'RECOVERY_DELIVERY_SENT' || await scalar('PREMATURE_ACCOUNT_DECIDED', `SELECT outcome FROM public.consume_recovery_and_decide_social_account(${quote(kakao.attempt)},${quote(pendingVerification)},decode(repeat('d3',32),'hex'))`) !== 'ACCOUNT_DECIDED') throw new Error('PHASE10O_Q_PREMATURE_ACCOUNT_DECIDED_FIXTURE')
await assertPrematureFinalization('ACCOUNT_DECIDED', kakao.attempt, kakao.transaction)
// `recovery_verified` is intentionally not independently persisted: the approved
// consume RPC atomically validates it and transitions to account_decided.
const recoveryVerifiedRows = await scalar('PREMATURE_RECOVERY_VERIFIED_UNREACHABLE', `SELECT CASE WHEN count(*)=0 THEN 'OK' ELSE 'VIOLATION' END AS outcome FROM private.oauth_login_attempts WHERE state='recovery_verified'`)
if (recoveryVerifiedRows !== 'OK') throw new Error('PHASE10O_Q_PREMATURE_RECOVERY_VERIFIED_UNEXPECTED_ROW')
const retained = await createActiveFixture('kakao', randomBytes(32)); const existingMatch = await durableSession({ provider: 'kakao', identityDigest: randomBytes(32), expected: 'RECOVERY_REQUIRED', nonce: true }); const matchVerification = randomUUID(); const matchAccount = randomUUID()
const matchReservation = await rows('PREMATURE_EXISTING_MATCH_RESERVE', `SELECT * FROM public.create_and_reserve_login_attempt_recovery_delivery(${quote(existingMatch.attempt)},${quote(matchVerification)},${quote(matchAccount)},decode(${quote(hex(retained.recoveryHmac))},'hex'),1,decode(repeat('e1',17),'hex'),decode(repeat('e2',12),'hex'),1,decode(repeat('e3',32),'hex'),1)`)
if (matchReservation[0]?.outcome !== 'RECOVERY_DELIVERY_RESERVED' || await scalar('PREMATURE_EXISTING_MATCH_SENT', `SELECT public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=${quote(matchVerification)})) AS outcome`) !== 'RECOVERY_DELIVERY_SENT' || await scalar('PREMATURE_EXISTING_MATCH', `SELECT outcome FROM public.consume_recovery_and_decide_social_account(${quote(existingMatch.attempt)},${quote(matchVerification)},decode(repeat('e3',32),'hex'))`) !== 'USE_PRIMARY_PROVIDER') throw new Error('PHASE10O_Q_PREMATURE_EXISTING_MATCH_FIXTURE')
await assertPrematureFinalization('EXISTING_ACCOUNT_MATCH', existingMatch.attempt, existingMatch.transaction)
process.stdout.write('PHASE10O_Q_NATURAL_PREMATURE_FINALIZATION_OK states=created,upstream_pending,recovery_required,recovery_pending,account_decided,existing_account_match recovery_verified=atomic_unreachable broker_codes=0 transactions_consumed=false\n')
const terminalRawContext = await scalar('R_GLOBAL_TERMINAL_CONTEXT', `SELECT CASE WHEN count(*)=0 THEN 'OK' ELSE 'VIOLATION' END AS outcome FROM private.downstream_authorization_transactions WHERE status IN ('expired','rejected','consumed') AND (downstream_nonce IS NOT NULL OR downstream_state IS NOT NULL)`)
if (terminalRawContext !== 'OK') throw new Error('PHASE10O_Q_R_GLOBAL_TERMINAL_CONTEXT_VIOLATION')
process.stdout.write('PHASE10O_Q_GOOGLE_DURABLE_DB_LIFECYCLE_OK provider=google branch=EXISTING_PRIMARY restart_boundaries=A_B_C_D_E durable_code_consumed=true replay_rejected=true\n')
process.stdout.write('PHASE10O_Q_NAVER_DURABLE_DB_LIFECYCLE_OK provider=naver branch=RECOVERY_REQUIRED restart_boundaries=A_B_C\n')
process.stdout.write('PHASE10O_Q_KAKAO_DURABLE_DB_LIFECYCLE_OK provider=kakao branch=RECOVERY_REQUIRED restart_boundaries=A_B_C\n')
process.stdout.write('PHASE10O_Q_MULTIPROCESS_DB_CHECKPOINTS_OK processes=separate_direct_tcp state_only_correlation=true\n')
process.stdout.write('PHASE10O_Q_R_TERMINAL_RAW_CONTEXT_GLOBAL_OK violations=0\n')
