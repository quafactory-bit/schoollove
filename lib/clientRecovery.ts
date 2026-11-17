// 클라이언트 예외 복구 도우미.
// 인스타그램·쓰레드 인앱 브라우저나 시크릿 모드에서는 matchMedia·storage·serviceWorker·caches가
// 없거나 접근 시 예외를 던질 수 있다. 이 파일의 함수는 어떤 환경에서도 예외를 밖으로 던지지 않는다.

const RELOAD_GUARD_KEY = 'sl_recovery_reload_at'
const RELOAD_GUARD_MS = 60_000
const PWA_CACHE_PREFIX = 'schoollove-pwa-'

/** matchMedia가 없거나 예외를 던지는 WebView에서도 false로 안전하게 답한다. */
export function safeMatchMedia(query: string): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  } catch {
    return false
  }
}

/** 배포 직후 옛 HTML이 사라진 JS 청크를 부를 때 나는 오류인지 판별한다. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  const text = `${typeof name === 'string' ? name : ''} ${typeof message === 'string' ? message : ''}`
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)
}

/**
 * 같은 탭에서 1분에 한 번만 자동 새로고침을 허용한다(무한 새로고침 방지).
 * storage를 못 쓰면 자동 새로고침하지 않고 버튼 복구로 넘긴다.
 */
export function claimAutoReload(now = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/** 서비스 워커 등록과 출석부 PWA 캐시만 지운다. 로그인 쿠키·다른 저장값은 건드리지 않는다. */
export async function clearAppCaches(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)))
    }
  } catch { /* 지원하지 않거나 막힌 환경 */ }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key.startsWith(PWA_CACHE_PREFIX)).map((key) => caches.delete(key)))
    }
  } catch { /* 지원하지 않거나 막힌 환경 */ }
}

/** 캐시를 정리한 뒤 홈으로 새로 들어간다(유입 ref 등 쿼리는 버린다). */
export async function recoverToHome(): Promise<void> {
  await clearAppCaches()
  try { window.location.replace('/') } catch { /* 이동 불가 환경 */ }
}
