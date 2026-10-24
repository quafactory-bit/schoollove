// v2-08: 설치 안내 화면을 보여 줄지와 어떤 안내를 할지 정한다(브라우저 정보만 사용, 서버 저장 없음).
export const INSTALL_SCREEN_SHOWN_KEY = 'sl_install_screen_shown_v2'

export type InstallPlatform = 'standalone' | 'ios' | 'android' | 'other'

export function detectInstallPlatform(input: { userAgent: string; platform?: string; maxTouchPoints?: number; standalone: boolean }): InstallPlatform {
  if (input.standalone) return 'standalone'
  const ios = /iPad|iPhone|iPod/.test(input.userAgent) || (input.platform === 'MacIntel' && (input.maxTouchPoints ?? 0) > 1)
  if (ios) return 'ios'
  if (/Android/.test(input.userAgent)) return 'android'
  return 'other'
}

// 이미 설치돼 있으면 건너뛰고, 가입 직후 1회만 보여 준다. 설정에서 다시 열면(again) 다시 보여 준다.
export function shouldShowInstallScreen(platform: InstallPlatform, alreadyShown: boolean, again: boolean): boolean {
  if (platform === 'standalone') return false
  return again || !alreadyShown
}
