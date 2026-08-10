import { OneTimeDigestBinding, randomOpaqueValue } from './crypto'

const NONCE_DIGEST_DOMAIN = 'schoollove:social-nonce:v1'

export type NonceLeg = Readonly<{
  rawNonce: string
  binding: NonceBinding
}>

export class NonceBinding {
  #binding: OneTimeDigestBinding

  constructor(rawNonce: string) {
    this.#binding = new OneTimeDigestBinding(NONCE_DIGEST_DOMAIN, rawNonce)
  }

  get storedDigest(): string {
    return this.#binding.storedDigest
  }

  get consumed(): boolean {
    return this.#binding.consumed
  }

  verifyAndConsume(rawNonce: string): boolean {
    return this.#binding.verifyAndConsume(rawNonce)
  }
}
export function createNonceLeg(): NonceLeg {
  const rawNonce = randomOpaqueValue(32)
  return { rawNonce, binding: new NonceBinding(rawNonce) }
}
