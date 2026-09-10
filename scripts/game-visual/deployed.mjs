// Read-only fresh browser. Never authenticates or exercises mutations.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
const base = process.argv[2] || 'https://preview.schoollove.kr'
const label = process.argv[3] || 'before'
const folder = `.local/game-visual/${label}`
await mkdir(folder, {recursive:true})
const browser = await chromium.launch({channel:'chrome', headless:true})
const records=[]
try {
 for(const [width,height] of [[390,844],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'})
  await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort())
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  const response=await page.goto(base,{waitUntil:'networkidle'})
  await page.screenshot({path:`${folder}/home-${width}.png`,fullPage:true})
  records.push({url:base,viewport:[width,height],status:response.status(),errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
  await page.close()
 }
}finally{await browser.close()}
await writeFile(`${folder}/deployed.json`,JSON.stringify(records,null,2))
console.log(JSON.stringify(records))
