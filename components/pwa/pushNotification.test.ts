import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const browser = read('lib/push/browser.ts')
const prompt = read('components/pwa/SchoolmatePushPrompt.tsx')
const settings = read('components/pwa/PushNotificationSettings.tsx')
const admin = read('app/admin/_components/push-test-button.tsx')

describe('push notification consent UI', () => {
  it('권한 요청은 사용자 버튼이 호출하는 함수 안에만 있다', () => {
    expect(browser).toContain('await Notification.requestPermission()')
    expect(prompt).toContain('onClick={() => void enable()}')
    expect(settings).toContain('onClick={() => void toggle()}')
    expect(settings).not.toContain('Notification.requestPermission')
  })

  it('나중에와 거절은 7일 억제하고 localStorage를 방어한다', () => {
    expect(prompt).toContain('7 * 24 * 60 * 60 * 1000')
    expect(prompt).toContain('schoollove:push-prompt-dismissed-at')
    expect(prompt).toContain('try {')
    expect(prompt).toContain('window.localStorage.getItem')
    expect(prompt).toContain('window.localStorage.setItem')
  })

  it('iOS 설치 전 안내와 계정 켜기·끄기, 관리자 테스트를 제공한다', () => {
    expect(browser).toContain('function isIosDevice()')
    expect(browser).toContain('/iPad|iPhone|iPod/')
    expect(browser).toContain("return 'ios-install-required'")
    expect(prompt).toContain("공유 버튼 → '홈 화면에 추가'")
    expect(settings).toContain('role="switch"')
    expect(settings).toContain("status === 'enabled' ? '끄기' : '켜기'")
    expect(admin).toContain('내 기기로 테스트 알림 보내기')
    expect(admin).toContain("fetch('/api/admin/push/test'")
  })
})
