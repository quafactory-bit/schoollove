import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { decryptBrokerDownstreamNonce, prepareBrokerAuthorizationCode } from '../../lib/auth/social-broker/durable-code'
import { calculateS256Challenge, createPkceVerifier } from '../../lib/auth/social-broker/pkce'

const container = process.env.PHASE10O_J_DB_CONTAINER
const run = container ? it : it.skip
const key = { version: 3, material: Buffer.alloc(32, 0x73) }
const clientId = 'node-db-client'
const redirectUri = 'https://auth.schoollove.invalid/node-db'

function psql(sql: string): string {
  return execFileSync('docker', ['exec', '-i', container!, 'psql', '-U', 'postgres', '-d', 'phase10of', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
function service(sql: string): string { return psql(`SELECT set_config('request.jwt.claim.role','service_role',false); ${sql}`).split(/\r?\n/).at(-1) ?? '' }

describe('PHASE 10O-J durable downstream nonce Node/DB/Node round trip', () => {
  run('returns only encrypted DB material and decrypts the exact nonce after a successful consume', () => {
    const digest = Buffer.alloc(32, 0x41)
    const subject = `slb:v1:k01:google:${digest.toString('base64url')}`
    const attempt = service("SELECT public.create_social_login_attempt('att_10oj_node_crypto_01','google',clock_timestamp()+interval '10 minutes')")
    expect(service(`SELECT public.record_verified_social_identity('${attempt}','google','${subject}',decode('${digest.toString('hex')}','hex'),1)`)).toBe('RECOVERY_REQUIRED')
    const verification = 'd1000000-0000-4000-8000-000000000001'
    const account = 'd2000000-0000-4000-8000-000000000001'
    expect(service(`SELECT outcome FROM public.create_and_reserve_login_attempt_recovery_delivery('${attempt}','${verification}','${account}',decode('${digest.toString('hex')}','hex'),1,decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1,decode(repeat('a3',32),'hex'),1)`)).toBe('RECOVERY_DELIVERY_RESERVED')
    const delivery = psql(`SELECT id::text FROM private.recovery_delivery_attempts WHERE verification_id='${verification}'`)
    expect(service(`SELECT public.mark_login_attempt_recovery_delivery_sent('${delivery}')`)).toBe('RECOVERY_DELIVERY_SENT')
    expect(service(`SELECT outcome FROM public.consume_recovery_and_decide_social_account('${attempt}','${verification}',decode(repeat('a3',32),'hex'))`)).toBe('ACCOUNT_DECIDED')
    const auth = 'd3000000-0000-4000-8000-000000000001'
    psql(`INSERT INTO auth.users(id,email) VALUES('${auth}',NULL)`)
    expect(service(`SELECT public.bind_social_auth_principal('${account}','${auth}')`)).toBe('t')

    const prepared = prepareBrokerAuthorizationCode({
      clientId,
      redirectUri,
      pkceS256Challenge: calculateS256Challenge(createPkceVerifier()),
      authenticationTime: Math.floor(Date.now() / 1000) - 1,
      downstreamNonce: 'Node→DB→Node exact downstream nonce',
      downstreamNonceKey: key,
    })
    const nonce = prepared.database.downstreamNonce!
    expect(service(`SELECT outcome FROM public.create_broker_authorization_code('${attempt}','${prepared.database.codeId}',decode('${Buffer.from(prepared.database.codeDigest).toString('hex')}','hex'),'${clientId}','${redirectUri}','${prepared.database.pkceS256Challenge}',${prepared.database.authenticationTime},decode('${Buffer.from(nonce.digest).toString('hex')}','hex'),decode('${Buffer.from(nonce.ciphertext).toString('hex')}','hex'),decode('${Buffer.from(nonce.iv).toString('hex')}','hex'),${nonce.keyVersion})`)).toBe('AUTHORIZATION_CODE_CREATED')
    const row = service(`SELECT outcome||'|'||code_id::text||'|'||client_id||'|'||encode(downstream_nonce_digest,'hex')||'|'||encode(downstream_nonce_ciphertext,'hex')||'|'||encode(downstream_nonce_iv,'hex')||'|'||downstream_nonce_key_version FROM public.consume_broker_authorization_code(decode('${Buffer.from(prepared.database.codeDigest).toString('hex')}','hex'),'${clientId}','${redirectUri}','${prepared.database.pkceS256Challenge}')`).split('|')
    expect(row[0]).toBe('AUTHORIZATION_CODE_CONSUMED')
    expect(decryptBrokerDownstreamNonce({ encrypted: { digest: Buffer.from(row[3], 'hex'), ciphertext: Buffer.from(row[4], 'hex'), iv: Buffer.from(row[5], 'hex'), keyVersion: Number(row[6]) }, key, codeId: row[1], clientId: row[2], redirectUri })).toBe('Node→DB→Node exact downstream nonce')
    expect(() => decryptBrokerDownstreamNonce({ encrypted: { digest: Buffer.from(row[3], 'hex'), ciphertext: Buffer.from(row[4], 'hex'), iv: Buffer.from(row[5], 'hex'), keyVersion: Number(row[6]) }, key, codeId: row[1], clientId, redirectUri: `${redirectUri}/tampered` })).toThrow('BROKER_CODE_NONCE_DECRYPTION_REJECTED')
    expect(psql("SELECT count(*) FROM information_schema.columns WHERE table_schema='private' AND table_name='broker_authorization_codes' AND column_name ~ '(raw|plaintext|verifier|email|token)'" )).toBe('0')
    console.log('PHASE10O_J_DOWNSTREAM_NONCE_CRYPTO_ROUNDTRIP_OK')
  })
})
