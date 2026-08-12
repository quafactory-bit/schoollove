import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { parseDurableUpstreamCallback, prepareDurableUpstreamLoginLeg, resumeDurableUpstreamLoginLeg, upstreamStateDigest, type UpstreamPkceVerifierKey } from '../../lib/auth/social-broker/durable-upstream-leg'

const container = process.env.PHASE10O_M_DB_CONTAINER
const run = container ? it : it.skip
const key: UpstreamPkceVerifierKey = { version: 5, material: Buffer.alloc(32, 0x5a) }
const redirectUri = 'https://broker.schoollove.invalid/callback'

function psql(sql: string): string { return execFileSync('docker', ['exec', '-i', container!, 'psql', '-U', 'postgres', '-d', 'phase10om', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() }
function service(sql: string): string { return psql(`SELECT set_config('request.jwt.claim.role','service_role',false); ${sql}`).split(/\r?\n/).at(-1) ?? '' }
function subject(provider: string, digest: Buffer): string { return `slb:v1:k01:${provider}:${digest.toString('base64url')}` }

describe('PHASE 10O-M Node/DB durable upstream restart acceptance', () => {
  run('resumes Google from only claimed encrypted tuple after process-local preparation is discarded', () => {
    const attempt = service("SELECT public.create_social_login_attempt('att_10om_node_google_01','google',clock_timestamp()+interval '10 minutes')")
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId: attempt, provider: 'google', clientId: 'slb-supabase-google', redirectUri, pkceKey: key })
    expect(service(`SELECT outcome FROM public.create_upstream_login_leg('${attempt}','${prepared.database.legId}','google',decode('${Buffer.from(prepared.database.clientBindingDigest).toString('hex')}','hex'),decode('${Buffer.from(prepared.database.stateDigest).toString('hex')}','hex'),decode('${Buffer.from(prepared.database.nonceDigest!).toString('hex')}','hex'),'${prepared.database.pkce!.challenge}',decode('${Buffer.from(prepared.database.pkce!.ciphertext).toString('hex')}','hex'),decode('${Buffer.from(prepared.database.pkce!.iv).toString('hex')}','hex'),${prepared.database.pkce!.keyVersion})`)).toBe('UPSTREAM_LEG_CREATED')
    const callback = parseDurableUpstreamCallback({ provider: 'google', redirectUri, callbackUrl: `${redirectUri}?code=opaque-google-shaped%2Fcode&state=${prepared.authorization.rawState}` })
    const rows = service(`SELECT outcome||'|'||leg_id::text||'|'||provider||'|'||encode(nonce_digest,'hex')||'|'||pkce_s256_challenge||'|'||encode(pkce_verifier_ciphertext,'hex')||'|'||encode(pkce_verifier_iv,'hex')||'|'||pkce_verifier_key_version FROM public.claim_upstream_login_callback('${attempt}','${prepared.database.legId}','google',decode('${Buffer.from(prepared.database.clientBindingDigest).toString('hex')}','hex'),decode('${Buffer.from(upstreamStateDigest(callback.rawState)).toString('hex')}','hex'))`).split('|')
    expect(rows[0]).toBe('CALLBACK_CLAIMED')
    const verifier = resumeDurableUpstreamLoginLeg({ encrypted: { challenge: rows[4], ciphertext: Buffer.from(rows[5], 'hex'), iv: Buffer.from(rows[6], 'hex'), keyVersion: Number(rows[7]) }, key, attemptId: attempt, legId: rows[1], provider: 'google', clientBindingDigest: prepared.database.clientBindingDigest })
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/)
    const digest = Buffer.alloc(32, 0x61)
    expect(service(`SELECT public.record_verified_social_identity_from_upstream_leg('${attempt}','${rows[1]}','google','${subject('google', digest)}',decode('${digest.toString('hex')}','hex'),1)`)).toBe('RECOVERY_REQUIRED')
    expect(psql(`SELECT count(*) FROM private.upstream_login_legs WHERE id='${rows[1]}' AND status='verified' AND state_digest IS NULL AND nonce_digest IS NULL AND pkce_verifier_ciphertext IS NULL`)).toBe('1')
    console.log('PHASE10O_M_PROCESS_RESTART_RESUME_OK')
  }, 30_000)

  run('resumes Naver with state digest only and no OIDC/PKCE persistence', () => {
    const attempt = service("SELECT public.create_social_login_attempt('att_10om_node_naver_01','naver',clock_timestamp()+interval '10 minutes')")
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId: attempt, provider: 'naver', clientId: 'slb-supabase-naver', redirectUri })
    expect(service(`SELECT outcome FROM public.create_upstream_login_leg('${attempt}','${prepared.database.legId}','naver',decode('${Buffer.from(prepared.database.clientBindingDigest).toString('hex')}','hex'),decode('${Buffer.from(prepared.database.stateDigest).toString('hex')}','hex'),NULL,NULL,NULL,NULL,NULL)`)).toBe('UPSTREAM_LEG_CREATED')
    const callback = parseDurableUpstreamCallback({ provider: 'naver', redirectUri, callbackUrl: `${redirectUri}?code=opaque-naver-code&state=${prepared.authorization.rawState}` })
    expect(service(`SELECT outcome FROM public.claim_upstream_login_callback('${attempt}','${prepared.database.legId}','naver',decode('${Buffer.from(prepared.database.clientBindingDigest).toString('hex')}','hex'),decode('${Buffer.from(upstreamStateDigest(callback.rawState)).toString('hex')}','hex'))`)).toBe('CALLBACK_CLAIMED')
    const digest = Buffer.alloc(32, 0x62)
    expect(service(`SELECT public.record_verified_social_identity_from_upstream_leg('${attempt}','${prepared.database.legId}','naver','${subject('naver', digest)}',decode('${digest.toString('hex')}','hex'),1)`)).toBe('RECOVERY_REQUIRED')
    expect(psql(`SELECT count(*) FROM private.upstream_login_legs WHERE id='${prepared.database.legId}' AND status='verified' AND nonce_digest IS NULL AND pkce_verifier_ciphertext IS NULL`)).toBe('1')
    console.log('PHASE10O_M_NAVER_PROCESS_RESTART_RESUME_OK')
  }, 30_000)
})
