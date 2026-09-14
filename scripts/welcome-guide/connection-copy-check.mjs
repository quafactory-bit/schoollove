// Real connection component; synthetic data, all external requests blocked.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {setup} from '../growth-ux/browser.mjs'
const out='.local/growth-ux/address-copy'
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try {
  for(const width of [320,390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}})
    const evidence=await setup(page)
    for(const state of ['off','private','shared']) {
      const calls=[]
      await page.route('**/api/connections/fixture**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname
        calls.push({path,method:req.method()})
        const body=path.endsWith('/instagram')
          ?{instagramHandle:state==='shared'?'synthetic_friend':null,myInstagramConfigured:true,myInstagramVisible:false}
          :{connection:{id:'fixture',status:'active',displayName:'예시 친구'},capabilities:{messaging:false,instagramPermission:state!=='off'}}
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
      })
      await page.goto('http://127.0.0.1:3117/connections/fixture')
      await expect(page.getByRole('heading',{name:'예시 친구'})).toBeVisible()
      await page.waitForLoadState('networkidle')
      const dm=page.getByText('인스타그램주소를 확인하고 DM으로 연락해 보세요.')
      if(state==='shared') {
        await expect(dm).toBeVisible()
        await expect(page.getByText('인스타그램주소 · https://www.instagram.com/synthetic_friend/')).toBeVisible()
      } else {
        await expect(dm).toHaveCount(0)
        await expect(page.getByText(/synthetic_friend/)).toHaveCount(0)
      }
      await expect(page.getByRole('button',{name:'이 친구에게 내 인스타그램주소 공개',exact:true})).toHaveCount(state==='off'?0:1)
      await expect(page.getByRole('textbox')).toHaveCount(0)
      expect(await page.locator('body').innerText()).not.toMatch(/베타|성장판|메시지 기능은/)
      expect(calls.some(c=>c.path.endsWith('/messages')||c.method!=='GET')).toBe(false)
      expect(calls.filter(c=>c.path.endsWith('/instagram'))).toHaveLength(state==='off'?0:1)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
      await page.screenshot({path:`${out}/connection-${state}-${width}.png`,fullPage:true})
      results.push({width,state,messagingRequests:0,writes:0,overflow:false})
      await page.unroute('**/api/connections/fixture**')
    }
    expect(evidence.errors).toEqual([])
    await page.close()
  }
} finally {await browser.close()}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results))
