import { createHmac } from 'node:crypto'
import { brokerFailure } from './errors'
import { isSocialProvider, type SocialProvider } from './types'

export const BROKER_SUBJECT_DOMAIN = 'schoollove:broker-subject:v1'
export const CURRENT_BROKER_SUBJECT_KEY_VERSION = 'k01'

type BrokerSubjectInput = Readonly<{
  provider: SocialProvider
  upstreamSubject: Uint8Array
  keyVersion: string
  key: Uint8Array
}>

const framed = (value: Uint8Array): Buffer => {
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(value.byteLength)
  return Buffer.concat([length, Buffer.from(value)])
}
export function deriveBrokerSubject(input: BrokerSubjectInput): string {
  if (!isSocialProvider(input.provider)) brokerFailure('INVALID_PROVIDER')
  if (!/^k[0-9]{2}$/.test(input.keyVersion)) brokerFailure('INVALID_KEY_VERSION')
  if (!(input.upstreamSubject instanceof Uint8Array) || input.upstreamSubject.byteLength === 0) {
    brokerFailure('INVALID_SUBJECT')
  }
  if (!(input.key instanceof Uint8Array) || input.key.byteLength < 32) brokerFailure('INVALID_KEY')

  const payload = Buffer.concat([
    framed(Buffer.from(BROKER_SUBJECT_DOMAIN, 'utf8')),
    framed(Buffer.from(input.provider, 'utf8')),
    framed(input.upstreamSubject),
  ])
  const digest = createHmac('sha256', Buffer.from(input.key)).update(payload).digest('base64url')
  return `slb:v1:${input.keyVersion}:${input.provider}:${digest}`
}
