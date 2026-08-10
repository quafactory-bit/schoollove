import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { brokerFailure } from './errors'

const encodePart = (value: Uint8Array): Buffer => {
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(value.byteLength)
  return Buffer.concat([length, Buffer.from(value)])
}
export function exactUtf8(value: string): Uint8Array {
  return Buffer.from(value, 'utf8')
}

export function digestParts(domain: string, parts: readonly Uint8Array[]): Buffer {
  const framed = [encodePart(Buffer.from(domain, 'utf8')), ...parts.map(encodePart)]
  return createHash('sha256').update(Buffer.concat(framed)).digest()
}

export function randomOpaqueValue(bytes = 32): string {
  if (!Number.isSafeInteger(bytes) || bytes < 32) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  return randomBytes(bytes).toString('base64url')
}

export class OneTimeDigestBinding {
  readonly storedDigest: string
  #digest: Buffer
  #consumed = false
  #domain: string

  constructor(domain: string, rawValue: string) {
    this.#domain = domain
    this.#digest = digestParts(domain, [exactUtf8(rawValue)])
    this.storedDigest = this.#digest.toString('base64url')
  }

  get consumed(): boolean {
    return this.#consumed
  }

  verifyAndConsume(rawValue: string): boolean {
    if (this.#consumed) brokerFailure('REPLAY_REJECTED')
    this.#consumed = true
    const candidate = digestParts(this.#domain, [exactUtf8(rawValue)])
    return timingSafeEqual(candidate, this.#digest)
  }
}
