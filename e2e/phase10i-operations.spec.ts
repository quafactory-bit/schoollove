import { expect,test,type BrowserContext } from '@playwright/test'
import { createHmac } from 'node:crypto'

async function installSyntheticAdminSession(context:BrowserContext){
  const expiry=Date.now()+60*60*1000
  const signature=createHmac('sha256','phase10i-local-admin-password').update(String(expiry)).digest('hex')
  await context.addCookies([{name:'sl_admin_session',value:`${expiry}.${signature}`,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict',secure:false}])
}

test('controlled beta admin routes remain private',async({page,request})=>{
  expect((await request.get('/api/admin/beta')).status()).toBe(401)
  expect((await request.get('/api/admin/beta/report?format=csv')).status()).toBe(401)
  expect((await request.get('/api/admin/beta/synthetic')).status()).toBe(401)
  await page.goto('/admin/beta/setup')
  await expect(page).toHaveURL(/\/admin\/login/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('synthetic lifecycle is admin-only, labeled and row-free',async({page,context})=>{
  await installSyntheticAdminSession(context)
  const response=await context.request.get('/api/admin/beta/synthetic')
  expect(response.status()).toBe(200)
  expect(response.headers()['x-synthetic-data']).toBe('true')
  const body=await response.json()
  expect(body.mode).toBe('synthetic')
  expect(body.lifecycle).toEqual(expect.arrayContaining(['invite','approve','search','greeting','accept','message','manual_payment_review','aggregate_report']))
  expect(body.counts).toEqual({profiles:0,payments:0,publicLaunches:0})
  await page.goto('/admin/beta/setup?synthetic=1')
  await expect(page.getByTestId('synthetic-preview')).toBeVisible()
  await expect(page.getByText('실제 이메일·Instagram·결제·Production row 없이 lifecycle을 확인합니다.')).toBeVisible()
  await expect(page.getByText('읽기 전용 미리보기입니다. 실제 조회·저장·승인·중단 작업은 이 화면에서 실행할 수 없습니다.')).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByRole('button')).toHaveCount(0)
  const robots=await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots).toContain('noindex')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('user feedback remains authenticated and private',async({page,request})=>{
  expect((await request.get('/api/beta/feedback')).status()).toBe(401)
  expect((await request.post('/api/beta/feedback',{data:{}})).status()).toBe(401)
  await page.goto('/feedback')
  await expect(page).toHaveURL(/\/login\?next=\/account/)
  const robots=await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots).toContain('noindex')
})
