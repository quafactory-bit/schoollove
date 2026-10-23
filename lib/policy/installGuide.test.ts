import { describe, expect, it } from 'vitest'
import { detectInstallPlatform, shouldShowInstallScreen } from './installGuide'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

describe('v2-08 install guide', () => {
  it('detects iPhone (Safari guide), Android (native sheet) and already-installed', () => {
    expect(detectInstallPlatform({ userAgent: iphone, standalone: false })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5, standalone: false })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: android, standalone: false })).toBe('android')
    expect(detectInstallPlatform({ userAgent: android, standalone: true })).toBe('standalone')
  })

  it('shows once after signup, skips when installed, and again only from settings', () => {
    expect(shouldShowInstallScreen('android', false, false)).toBe(true)
    expect(shouldShowInstallScreen('android', true, false)).toBe(false)
    expect(shouldShowInstallScreen('ios', true, true)).toBe(true)
    expect(shouldShowInstallScreen('standalone', false, true)).toBe(false)
  })
})
