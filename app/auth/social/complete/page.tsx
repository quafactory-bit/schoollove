import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import SocialCompleteClient from './SocialCompleteClient'
import { loadUserLoginBrokerConfig } from '@/lib/auth/social-broker/preview-config'

export const dynamic = 'force-dynamic'

export default async function SocialLoginCompletePage() {
  try {
    const values = await headers()
    const host = values.get('x-forwarded-host') ?? values.get('host')
    const config = loadUserLoginBrokerConfig()
    if (!config || host !== new URL(config.issuer).host) notFound()
  } catch { notFound() }
  return <SocialCompleteClient />
}
