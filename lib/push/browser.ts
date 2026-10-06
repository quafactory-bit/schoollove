export type BrowserPushStatus =
  | 'enabled'
  | 'disabled'
  | 'denied'
  | 'unsupported'
  | 'ios-install-required'
  | 'not-configured'

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ''

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true
}

function isIosDevice(): boolean {
  const userAgent = navigator.userAgent
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

export function serializePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function getBrowserPushStatus(): Promise<BrowserPushStatus> {
  if (!publicVapidKey) return 'not-configured'
  if (isIosDevice() && !isStandalone()) return 'ios-install-required'
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return await currentSubscription() ? 'enabled' : 'disabled'
}

export async function ensureBrowserPushSubscription(): Promise<{
  status: BrowserPushStatus
  subscription?: PushSubscription
  created?: boolean
}> {
  if (!publicVapidKey) return { status: 'not-configured' }
  if (isIosDevice() && !isStandalone()) return { status: 'ios-install-required' }
  if (!isPushSupported()) return { status: 'unsupported' }
  if (Notification.permission === 'denied') return { status: 'denied' }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return { status: 'denied' }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
  })
  return { status: 'enabled', subscription, created: existing === null }
}

async function postSubscription(path: string, subscription: PushSubscription): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(path.endsWith('/unsubscribe')
      ? { endpoint: subscription.endpoint }
      : serializePushSubscription(subscription)),
  })
  if (!response.ok) throw new Error('PUSH_SUBSCRIPTION_REQUEST_FAILED')
}

export async function enableCurrentDevicePush(): Promise<BrowserPushStatus> {
  const result = await ensureBrowserPushSubscription()
  if (!result.subscription) return result.status
  try {
    await postSubscription('/api/push/subscribe', result.subscription)
    return 'enabled'
  } catch (error) {
    if (result.created && Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.ready
      const current = await registration.pushManager.getSubscription()
      if (current?.endpoint === result.subscription.endpoint) await current.unsubscribe().catch(() => false)
    }
    throw error
  }
}

export async function disableCurrentDevicePush(): Promise<BrowserPushStatus> {
  if (!isPushSupported()) return 'unsupported'
  const subscription = await currentSubscription()
  if (!subscription) return 'disabled'
  await postSubscription('/api/push/unsubscribe', subscription)
  await subscription.unsubscribe()
  return 'disabled'
}

export async function syncCurrentDevicePush(): Promise<BrowserPushStatus> {
  const status = await getBrowserPushStatus()
  if (status !== 'enabled') return status
  const subscription = await currentSubscription()
  if (!subscription) return 'disabled'
  await postSubscription('/api/push/subscribe', subscription)
  return 'enabled'
}
