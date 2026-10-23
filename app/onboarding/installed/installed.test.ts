import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync('app/layout.tsx', 'utf8')
const screen = readFileSync('app/onboarding/installed/InstallScreen.tsx', 'utf8')
const signup = readFileSync('app/onboarding/OnboardingClient.tsx', 'utf8')
const account = readFileSync('app/account/AccountClient.tsx', 'utf8')

describe('v2-08 add-to-home screen', () => {
  it('appears right after signup, and again only from the account settings link', () => {
    expect(signup).toContain("window.location.replace('/onboarding/installed')")
    expect(account).toContain('href="/onboarding/installed?again=1"')
  })
  it('is not shown anywhere else: the global install banner is no longer mounted', () => {
    expect(layout).not.toContain('<InstallPrompt />')
    expect(layout).toContain("window.__slInstallPrompt=e")
  })
  it('uses the native sheet on Android and a Safari share guide on iPhone, and skips when installed', () => {
    expect(screen).toContain('await prompt.prompt()')
    expect(screen).toContain("platform === 'ios'")
    expect(screen).toContain('사파리 아래 공유 버튼')
    expect(screen).toContain("(display-mode: standalone)")
    expect(screen).toContain('홈 화면에 추가하면 같은 기수가 들어올 때 알려드려요')
    expect(screen).toContain('그 외 알림이나 광고는 보내지 않아요')
  })
})
