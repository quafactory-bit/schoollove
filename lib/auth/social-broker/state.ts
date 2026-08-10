import { OneTimeDigestBinding, randomOpaqueValue } from './crypto'

const STATE_DIGEST_DOMAIN = 'schoollove:social-state:v1'

export type StateLeg = Readonly<{
  rawState: string
  binding: StateBinding
}>

export class StateBinding {
  #binding: OneTimeDigestBinding

  constructor(rawState: string) {
    this.#binding = new OneTimeDigestBinding(STATE_DIGEST_DOMAIN, rawState)
  }

  get storedDigest(): string {
    return this.#binding.storedDigest
  }

  get consumed(): boolean {
    return this.#binding.consumed
  }

  verifyAndConsume(rawState: string): boolean {
    return this.#binding.verifyAndConsume(rawState)
  }
}
export function createStateLeg(): StateLeg {
  const rawState = randomOpaqueValue(32)
  return { rawState, binding: new StateBinding(rawState) }
}
