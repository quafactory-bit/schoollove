import { expect, test } from '@playwright/test'

type Rgb = [number, number, number]

function parseRgb(value: string): Rgb {
  const channels = value.match(/\d+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Expected an RGB color, received ${value}`)
  return [channels[0], channels[1], channels[2]]
}

async function expectReadableDarkAction(button: import('@playwright/test').Locator) {
  const styles = await button.evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return { backgroundColor: computed.backgroundColor, color: computed.color }
  })
  expect(parseRgb(styles.color)).toEqual([255, 255, 255])
  expect(parseRgb(styles.backgroundColor).every((channel) => channel < 40)).toBe(true)
}

test('email and OTP CTAs preserve readable dark-action contrast with mocked Auth only', async ({ page }, testInfo) => {
  let releaseRequest: (() => void) | undefined
  let releaseVerification: (() => void) | undefined
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve })
  const verificationGate = new Promise<void>((resolve) => { releaseVerification = resolve })

  await page.route('**/api/auth/launch-state', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ state: 'closed' }),
  }))
  await page.route('**/api/auth/request-otp', async (route) => {
    await requestGate
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ message: '입력한 이메일로 인증번호를 보냈습니다.' }) })
  })
  await page.route('**/api/auth/verify-otp', async (route) => {
    await verificationGate
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: '인증번호가 올바르지 않거나 만료되었습니다.' }) })
  })

  await page.goto('/login')
  const emailButton = page.getByRole('button', { name: '인증번호 받기' })
  await expect(emailButton).toBeVisible()
  await expectReadableDarkAction(emailButton)
  await emailButton.hover()
  await expectReadableDarkAction(emailButton)
  await emailButton.focus()
  await expectReadableDarkAction(emailButton)
  await page.screenshot({ path: testInfo.outputPath('email-cta.png') })

  await page.getByLabel('이메일').fill('fixture@example.invalid')
  void emailButton.click()
  await expect(page.getByRole('button', { name: '보내는 중…' })).toBeVisible()
  await expectReadableDarkAction(page.getByRole('button', { name: '보내는 중…' }))
  releaseRequest?.()
  await expect(page.getByLabel('인증번호 6자리')).toBeVisible()

  const tokenInput = page.getByLabel('인증번호 6자리')
  const loginButton = page.getByRole('button', { name: '로그인' })
  await expect(loginButton).toBeDisabled()
  await expectReadableDarkAction(loginButton)
  await loginButton.hover({ force: true })
  await expectReadableDarkAction(loginButton)
  await loginButton.focus()
  await expectReadableDarkAction(loginButton)

  await tokenInput.evaluate((element) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text', '12345678')
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
  })
  await expect(tokenInput).toHaveValue('')
  await expect(loginButton).toBeDisabled()

  await tokenInput.fill('123456')
  await expect(loginButton).toBeEnabled()
  void loginButton.click()
  await expect(page.getByRole('button', { name: '확인 중…' })).toBeVisible()
  await expectReadableDarkAction(page.getByRole('button', { name: '확인 중…' }))
  releaseVerification?.()
  await expect(page.getByText('인증번호가 올바르지 않거나 만료되었습니다.', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('otp-cta.png') })
})
