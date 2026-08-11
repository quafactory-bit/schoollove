import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  decryptRecoveryEmailForAccount,
  verifyRecoveryOtpMac,
  type VersionedKey,
} from '../../lib/auth/social-account/recovery'

vi.mock('server-only', () => ({}))
import { prepareAttemptRecoveryChallenge } from '../../lib/auth/social-account/recovery-preparation'

const container = process.env.PHASE10O_H_DB_CONTAINER
const run = container ? it : it.skip
const hmacKey: VersionedKey = { version: 1, material: Buffer.alloc(32, 0x61) }
const encryptionKey: VersionedKey = { version: 1, material: Buffer.alloc(32, 0x62) }
const otpKey: VersionedKey = { version: 1, material: Buffer.alloc(32, 0x63) }

function psql(sql: string): string {
  return execFileSync('docker', ['exec', '-i', container!, 'psql', '-U', 'postgres', '-d', 'phase10of', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    input: '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}
function hex(bytes: Uint8Array): string { return Buffer.from(bytes).toString('hex') }
function subject(provider: string, byte: number): { digest: Buffer; value: string } {
  const digest = Buffer.alloc(32, byte)
  return { digest, value: `slb:v1:k01:${provider}:${digest.toString('base64url')}` }
}
function service(sql: string): string { return psql(`SELECT set_config('request.jwt.claim.role','service_role',false); ${sql}`).split(/\r?\n/).at(-1) ?? '' }

describe('PHASE 10O-H real Node and isolated-DB crypto round trip', () => {
  run('binds the preallocated UUIDs across Node crypto, DB decision, and stored ciphertext', () => {
    const prepared = prepareAttemptRecoveryChallenge({
      recoveryEmail: '  Case.Name+tag@BÜCHER.example\t',
      recoveryHmacKey: hmacKey,
      recoveryEncryptionKey: encryptionKey,
      otpMacKey: otpKey,
    })
    const identity = subject('google', 0xa1)
    const attemptId = service(`SELECT public.create_social_login_attempt('att_10ohcryptoround01','google',clock_timestamp()+interval '5 minutes')`)
    expect(service(`SELECT public.record_verified_social_identity('${attemptId}','google','${identity.value}',decode('${identity.digest.toString('hex')}','hex'),1)`)).toBe('RECOVERY_REQUIRED')
    expect(service(`SELECT public.create_login_attempt_recovery_verification('${attemptId}','${prepared.database.challengeId}','${prepared.database.reservedAccountId}',decode('${hex(prepared.database.recoveryEmailHmac)}','hex'),${prepared.database.recoveryEmailHmacKeyVersion},decode('${hex(prepared.database.destinationCiphertext)}','hex'),decode('${hex(prepared.database.destinationNonce)}','hex'),${prepared.database.encryptionKeyVersion},decode('${hex(prepared.database.otpMac)}','hex'),${prepared.database.otpKeyVersion})`)).toBe(prepared.database.challengeId)
    const exact = psql(`SELECT id::text||'|'||reserved_account_id::text FROM private.recovery_email_verifications WHERE id='${prepared.database.challengeId}'`)
    expect(exact).toBe(`${prepared.database.challengeId}|${prepared.database.reservedAccountId}`)
    expect(service(`SELECT outcome FROM public.consume_recovery_and_decide_social_account('${attemptId}','${prepared.database.challengeId}',decode('${hex(prepared.database.otpMac)}','hex'))`)).toBe('ACCOUNT_DECIDED')
    const row = psql(`SELECT id::text||'|'||encode(recovery_email_ciphertext,'hex')||'|'||encode(recovery_email_nonce,'hex')||'|'||recovery_email_encryption_key_version FROM private.private_accounts WHERE id='${prepared.database.reservedAccountId}'`).split('|')
    expect(row[0]).toBe(prepared.database.reservedAccountId)
    expect(decryptRecoveryEmailForAccount({ encrypted: { ciphertext: Buffer.from(row[1], 'hex'), nonce: Buffer.from(row[2], 'hex'), keyVersion: Number(row[3]) }, key: encryptionKey, accountId: row[0] })).toBe(prepared.delivery.canonicalEmail)
    expect(() => decryptRecoveryEmailForAccount({ encrypted: { ciphertext: Buffer.from(row[1], 'hex'), nonce: Buffer.from(row[2], 'hex'), keyVersion: Number(row[3]) }, key: encryptionKey, accountId: 'f0000000-0000-4000-8000-000000000001' })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    expect(verifyRecoveryOtpMac({ challengeId: 'f0000000-0000-4000-8000-000000000002', otp: prepared.delivery.otp, expectedMac: prepared.database.otpMac, key: otpKey })).toBe(false)
    expect(() => decryptRecoveryEmailForAccount({ encrypted: { ciphertext: Buffer.concat([Buffer.from(row[1], 'hex').subarray(0, -1), Buffer.from([0])]), nonce: Buffer.from(row[2], 'hex'), keyVersion: Number(row[3]) }, key: encryptionKey, accountId: row[0] })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    console.log('PHASE10O_H_RECOVERY_CRYPTO_ROUNDTRIP_OK')
  })
})
