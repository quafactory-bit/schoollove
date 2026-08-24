import { expect, test } from '@playwright/test'

type Rgb = [number, number, number]

function parseRgb(value: string): Rgb {
  const channels = value.match(/\d+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Expected an RGB color, received ${value}`)
  return [channels[0], channels[1], channels[2]]
}

async function expectReadableDarkAction(cta: import('@playwright/test').Locator) {
  const styles = await cta.evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return { backgroundColor: computed.backgroundColor, color: computed.color }
  })
  expect(parseRgb(styles.color)).toEqual([255, 255, 255])
  expect(parseRgb(styles.backgroundColor).every((channel) => channel < 40)).toBe(true)
}

test('Google-only login CTA preserves contrast and never reaches a real provider', async ({ page }) => {
  const providerRequestAttempts: string[] = []
  const blockedExternalRequests: string[] = []
  let fixedStartRequests = 0

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/auth/social/start/google') {
      fixedStartRequests += 1
      await route.fulfill({ status: 204 })
      return
    }
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
      await route.continue()
      return
    }
    blockedExternalRequests.push(url.toString())
    if (/(^|\.)supabase\.co$|(^|\.)google\.com$|(^|\.)googleapis\.com$|(^|\.)kakao\.com$|(^|\.)naver\.com$/.test(url.hostname)) {
      providerRequestAttempts.push(url.toString())
    }
    await route.abort()
  })

  await page.goto('/login')

  const googleCta = page.getByRole('link', { name: 'Google로 계속하기', exact: true })
  await expect(googleCta).toHaveCount(1)
  await expect(googleCta).toHaveAttribute('href', '/auth/social/start/google')
  await expect(page.locator('a[href^="/auth/social/"]')).toHaveCount(1)
  await expect(page.locator('input[type="email"], input[autocomplete="one-time-code"], select, [name="provider"], [name="redirect_to"]')).toHaveCount(0)
  await expect(page.getByText('인증번호 받기', { exact: true })).toHaveCount(0)
  await expect(page.getByText('로그인', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Kakao|Naver/, { exact: false })).toHaveCount(0)
  await expect(googleCta).toHaveClass(/schoollove-dark-action/)
  expect(await googleCta.evaluate((element) => element.tabIndex)).toBe(0)

  await expectReadableDarkAction(googleCta)
  await googleCta.hover()
  await expectReadableDarkAction(googleCta)
  await googleCta.focus()
  await expect(googleCta).toBeFocused()
  await expectReadableDarkAction(googleCta)

  await googleCta.click()
  expect(fixedStartRequests).toBe(1)
  expect(providerRequestAttempts).toEqual([])
  expect(blockedExternalRequests.every((url) => !url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost'))).toBe(true)
})
