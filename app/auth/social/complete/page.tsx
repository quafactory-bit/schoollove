import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import SocialCompleteClient from './SocialCompleteClient'
import { loadBrokerPreviewConfig, PREVIEW_BROKER_ISSUER } from '@/lib/auth/social-broker/preview-config'

export const dynamic = 'force-dynamic'

export default async function SocialLoginCompletePage() {
  try {
    const values = await headers()
    const host = values.get('x-forwarded-host') ?? values.get('host')
    if (host !== new URL(PREVIEW_BROKER_ISSUER).host || loadBrokerPreviewConfig().exposure !== 'preview') notFound()
  } catch { notFound() }
  return <SocialCompleteClient />
}
