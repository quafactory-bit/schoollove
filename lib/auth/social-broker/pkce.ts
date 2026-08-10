import { createHash, randomBytes } from 'node:crypto'
import { brokerFailure } from './errors'

const PKCE_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

export function estimateVerifierEntropyBits(verifier: string): number {
  const counts = new Map<string, number>()
  for (const character of verifier) counts.set(character, (counts.get(character) ?? 0) + 1)
  let entropyPerCharacter = 0
  for (const count of counts.values()) {
    const probability = count / verifier.length
    entropyPerCharacter -= probability * Math.log2(probability)
  }
  return entropyPerCharacter * verifier.length
}
export function validatePkceVerifier(verifier: string): void {
  if (!PKCE_PATTERN.test(verifier) || estimateVerifierEntropyBits(verifier) < 128) {
    brokerFailure('PKCE_REJECTED')
  }
}

export function createPkceVerifier(): string {
  return randomBytes(32).toString('base64url')
}

export function calculateS256Challenge(verifier: string): string {
  validatePkceVerifier(verifier)
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

export function requireS256(method: string): asserts method is 'S256' {
  if (method !== 'S256') brokerFailure('PKCE_DOWNGRADE_REJECTED')
}

export function verifyPkce(verifier: string, expectedChallenge: string): boolean {
  return calculateS256Challenge(verifier) === expectedChallenge
}
