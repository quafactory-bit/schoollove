import {chromium,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {setup} from './browser.mjs'
const browser=await chromium.launch({channel:'chrome',headless:true}), results=[]
try {
 for(const [width,height] of [[360,800],[390,844],[412,915],[1280,900]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const evidence=await setup(page)
  await page.goto('http://127.0.0.1:3117/account?mode=member')
  const open=page.getByRole('button',{name:'친구 불러서 학교 키우기'});await open.click()
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible()
  const bounds=await dialog.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(height)
  for(let i=0;i<10;i++)await page.keyboard.press('Tab')
  expect(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement))).toBe(true)
  await page.screenshot({path:`.local/growth-ux/after/share-${width}.png`})
  await page.keyboard.press('Escape');await expect(open).toBeFocused()
  expect(evidence.calls.filter(c=>c.method==='POST').length).toBe(0)
  await page.goto('http://127.0.0.1:3117/')
  const button=page.getByRole('button',{name:'내 학교 찾기'});await button.scrollIntoViewIfNeeded();await button.focus()
  const colors=await button.evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,height:e.getBoundingClientRect().height,focus:s.outlineStyle}})
  expect(colors.height).toBeGreaterThanOrEqual(44);expect(colors.color).toBe('rgb(255, 255, 255)')
  const ratio=await button.evaluate(e=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const lum=s=>rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const s=getComputedStyle(e),a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})
  expect(ratio).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({path:`.local/growth-ux/after/home-viewport-${width}.png`})
  results.push({viewport:`${width}x${height}`,dialogContained:true,focusTrap:true,escapeFocusReturn:true,previewIssuance:0,button:{...colors,contrast:ratio}});await page.close()
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}});await setup(page);await page.goto('http://127.0.0.1:3117/account?mode=member')
 // CSS zoom tests 200% content enlargement; not a physical device or browser-UI zoom claim.
 await page.addStyleTag({content:'body { zoom: 2; }'})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByRole('button',{name:'친구 불러서 학교 키우기'}).click();await expect(page.getByRole('button',{name:'친구 링크 준비',exact:true})).toBeVisible()
 await page.screenshot({path:'.local/growth-ux/after/share-css-200.png'});results.push({cssZoom:2,result:'PASS',physicalBrowserZoom:'NOT_TESTED'})
} finally {await browser.close()}
await writeFile('.local/growth-ux/visual.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results))
