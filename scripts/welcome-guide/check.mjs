// Run against scripts/growth-ux/serve.mjs. Real React, synthetic owner data only.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {setup} from '../growth-ux/browser.mjs'

const out='.local/growth-ux/welcome-guide'
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try {
  const warmup=await browser.newPage();await setup(warmup)
  await warmup.goto('http://127.0.0.1:3117/account?mode=member');await warmup.waitForLoadState('networkidle');await warmup.close()
  for(const [width,height] of [[320,568],[390,844],[1280,900]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'})
    const page=await context.newPage()
    const evidence=await setup(page)
    await page.goto('http://127.0.0.1:3117/account?mode=new')
    await page.waitForLoadState('networkidle')
    const dialog=page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading')).toBeFocused()
    for(let step=0;step<4;step++) {
      await expect(dialog.getByRole('navigation').getByRole('button').nth(step)).toHaveAttribute('aria-current','step')
      const bounds=await dialog.boundingBox()
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(width)
      expect(bounds.y+bounds.height).toBeLessThanOrEqual(height)
      expect(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false)
      if(step===1) await expect(dialog.getByText('1/5단계')).toBeVisible()
      if(step===2) await expect(dialog.getByText('아직 등록한 학교가 없어요')).toBeVisible()
      if(step===3) await expect(dialog.getByText('사람 찾기와 새 연결 요청은 별도 초대와 운영자 승인 후 이용할 수 있어요.')).toBeVisible()
      await page.screenshot({path:`${out}/${width}-step-${step+1}.png`})
      if(step<3) await dialog.getByRole('button',{name:'다음',exact:true}).click()
    }
    await dialog.getByRole('button',{name:'이전',exact:true}).click()
    await expect(dialog.getByRole('heading',{name:'내 학교를 등록하고 레벨을 올려요'})).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button',{name:'이용 안내',exact:true})).toBeFocused()
    expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden')
    await page.reload();await page.waitForLoadState('networkidle')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button',{name:'이용 안내',exact:true}).click()
    await expect(dialog.getByRole('heading',{name:'스쿨러브아이에 오신 것을 환영해요'})).toBeVisible()
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true)
    }
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true)
    }
    await dialog.getByRole('button',{name:'4. 내 연결',exact:true}).click()
    await dialog.getByRole('button',{name:'내 계정 둘러보기',exact:true}).click()
    await expect(dialog).not.toBeVisible()
    await page.evaluate(()=>sessionStorage.removeItem('schoollove:welcome-guide:v1'))
    await page.goto('http://127.0.0.1:3117/account?mode=member');await page.waitForLoadState('networkidle')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button',{name:'이용 안내',exact:true}).click()
    await dialog.getByRole('button',{name:'2. 가입 단계',exact:true}).click()
    await expect(dialog.getByText('5/5단계')).toBeVisible()
    await dialog.getByRole('button',{name:'3. 학교 상태',exact:true}).click()
    await expect(dialog.getByText('1곳의 학교를 기록했어요')).toBeVisible()
    await page.keyboard.press('Escape')
    // Closed/emergency account must not auto-open even without the display flag.
    for(const state of ['closed','emergency_stopped']) {
      await page.evaluate(state=>{
        sessionStorage.removeItem('schoollove:welcome-guide:v1')
        window.__ux.state={...window.__ux.state,adultEligible:false,consentsComplete:false,profile:null,memberships:[]}
        Object.assign(window.__ux.launch,{state,registrationEnabled:false,privateProfileEnabled:false,schoolMembershipEnabled:false,emergencyStopped:state==='emergency_stopped'})
        window.dispatchEvent(new Event('ux-route'))
      },state)
      await expect(page.getByText('현재 계정 정보를 저장하거나 변경할 수 없습니다.',{exact:false})).toBeVisible()
      await expect(dialog).not.toBeVisible()
      await page.getByRole('button',{name:'이용 안내',exact:true}).click()
      await dialog.getByRole('button',{name:'2. 가입 단계',exact:true}).click()
      await expect(dialog.getByText('현재 계정 정보 저장이 제한되어 있어요.',{exact:false})).toBeVisible()
      await dialog.getByRole('button',{name:'이용 안내 닫기'}).click()
    }
    expect(evidence.calls.filter(c=>c.method!=='GET')).toEqual([])
    expect(evidence.errors).toEqual([])
    results.push({width,height,steps:4,focusTrap:true,escapeAndReturn:true,replay:true,ownerProgress:true,closedAndEmergency:true,writes:0,errors:0})
    await context.close()
  }
  const context=await browser.newContext({viewport:{width:390,height:844}})
  const page=await context.newPage();await setup(page)
  await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage disabled')}}))
  await page.goto('http://127.0.0.1:3117/account?mode=new');await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button',{name:'이용 안내',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button',{name:'나중에 보기'}).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  results.push({storageBlocked:true,manualHelp:true})
  await context.close()
} finally { await browser.close() }
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results))
