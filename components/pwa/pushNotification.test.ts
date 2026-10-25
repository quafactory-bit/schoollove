import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// pwa-phase2에서 가져온 동의 UI 테스트를 v2-09a(한 번만 묻기) 기준으로 맞췄다.
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const browser = read('lib/push/browser.ts')
const prompt = read('components/pwa/PushOptInCard.tsx')
const settings = read('components/pwa/PushNotificationSettings.tsx')
const admin = read('app/admin/_components/push-test-button.tsx')
const roster = read('components/roster/RosterView.tsx')
const account = read('app/account/AccountClient.tsx')

describe('push notification consent UI', () => {
  it('권한 요청은 사용자 버튼이 호출하는 함수 안에만 있다', () => {
    expect(browser).toContain('await Notification.requestPermission()')
    expect(prompt).toContain('onClick={() => void enable()}')
    expect(prompt).not.toContain('Notification.requestPermission')
    expect(settings).toContain('onClick={() => void toggle()}')
    expect(settings).not.toContain('Notification.requestPermission')
  })

  it('출석부에서 딱 한 번 묻고, 켜든 나중에든 다시 묻지 않으며 localStorage를 방어한다', () => {
    expect(roster).toContain('<PushOptInCard />')
    expect(prompt).toContain("PUSH_PROMPTED_KEY = 'sl_push_prompted_v2'")
    expect(prompt.match(/markPrompted\(\)/g)?.length).toBeGreaterThanOrEqual(2)
    expect(prompt).toContain("status === 'disabled'")
    expect(prompt).toContain('try {')
    expect(prompt).not.toMatch(/7 \* 24/)
  })

  it('iOS 설치 전 안내, 계정 설정 켜기·끄기, 관리자 테스트를 제공한다', () => {
    expect(browser).toContain('function isIosDevice()')
    expect(browser).toContain("return 'ios-install-required'")
    expect(account).toContain('<PushNotificationSettings />')
    expect(settings).toContain('role="switch"')
    expect(settings).toContain("status === 'enabled' ? '끄기' : '켜기'")
    expect(settings).toContain('알림에는 이름·인스타 주소·연락처를 넣지 않아요')
    expect(admin).toContain('내 기기로 테스트 알림 보내기')
    expect(admin).toContain("fetch('/api/admin/push/test'")
  })

  it('VAPID 키가 바뀌면 예전 키로 만든 구독을 버리고 새로 만든다', () => {
    expect(browser).toContain('existing.options.applicationServerKey')
    expect(browser).toContain('await existing.unsubscribe()')
  })

  it('관리자 테스트는 만료된 구독(404/410)이면 새로 구독해 한 번만 다시 보낸다', () => {
    expect(admin).toContain('body.expired')
    expect(admin).toContain('await result.subscription.unsubscribe()')
    expect(read('app/api/admin/push/test/route.ts')).toContain('expired: status === 404 || status === 410')
  })
})
