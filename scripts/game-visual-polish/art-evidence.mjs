// Actual React stage screenshots + deterministic alpha-composite verification.
import {chromium,expect} from '@playwright/test'
import sharp from 'sharp'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {setup} from '../growth-ux/browser.mjs'
const out='.local/game-visual-polish'
await mkdir(`${out}/stages`,{recursive:true})
const stages=[[1,'memory-seed'],[2,'first-reunion-v1'],[4,'growing-campus'],[7,'lively-school-v1'],[10,'lively-school-v1']]
const files=[...stages.slice(0,4).map(([level,name])=>({level,name})),{level:null,name:'school-friends-v1'}]
const manifest=[],composites=[]
for(const [row,{name,level}] of files.entries()) {
 const path=`public/images/game/${name}.webp`,data=await readFile(path)
 const meta=await sharp(data).metadata(),stats=await sharp(data).stats()
 expect(meta.hasAlpha).toBe(true);expect(stats.channels[3].min).toBe(0)
 const raw=await sharp(data).ensureAlpha().raw().toBuffer()
 let transparent=0;for(let i=3;i<raw.length;i+=4)if(raw[i]===0)transparent++
 expect(transparent/(meta.width*meta.height)).toBeGreaterThan(.1)
 manifest.push({path,level,bytes:data.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,transparentFraction:transparent/(meta.width*meta.height),sha256:createHash('sha256').update(data).digest('hex')})
 for(const [column,bg] of ['#ffffff','#f5eaff','#111e4b'].entries()) {
  const cell=await sharp(data).resize({width:480,height:320,fit:'contain',background:'#00000000'}).flatten({background:bg}).png().toBuffer()
  composites.push({input:cell,left:column*480,top:row*352+32})
 }
 const title=Buffer.from(`<svg width="1440" height="32"><rect width="1440" height="32" fill="#e9edf6"/><text x="16" y="22" font-size="16" fill="#101d4f">${name} — white / pastel / navy</text></svg>`)
 composites.push({input:title,left:0,top:row*352})
}
await sharp({create:{width:1440,height:files.length*352,channels:4,background:'#ffffff'}}).composite(composites).png().toFile(`${out}/alpha-check.png`)
await writeFile(`${out}/asset-manifest.json`,JSON.stringify(manifest,null,2))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:768,height:1024},reducedMotion:'reduce'})
 await setup(page)
 for(const effects of [true,false]) {
  const cells=[]
  for(const [i,[level,name]] of stages.entries()) {
   await page.goto('http://127.0.0.1:3117/school/example-school?level='+level)
   await page.addStyleTag({content:'.sl-hub-world .sl-world{width:500px!important;margin:auto!important;transform:none!important;}'+(!effects?'.sl-world-aura,.sl-world-orbit{display:none!important}.sl-world-image,.sl-world-friends{animation:none!important;transform:none!important;filter:grayscale(1)!important;scale:1!important;}':'')})
   const canvas=page.locator('.sl-hub-world .sl-world-canvas')
   await canvas.waitFor();await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())))
   const path=`${out}/stages/${effects?'static':'effects-off'}-${level}.png`
   await canvas.screenshot({path})
   const header=Buffer.from(`<svg width="500" height="40"><rect width="500" height="40" fill="#eef2ff"/><text x="16" y="26" font-size="18" fill="#101d4f">Lv.${level} — ${level===10?'PARTIAL: arch asset missing':name}</text></svg>`)
   cells.push({input:header,left:i*500,top:0},{input:await sharp(path).resize(500,334).png().toBuffer(),left:i*500,top:40})
  }
  await sharp({create:{width:2500,height:374,channels:4,background:'#f5efff'}}).composite(cells).png().toFile(`${out}/stages-${effects?'static':'effects-off'}.png`)
 }
} finally {await browser.close()}
console.log(JSON.stringify({assets:manifest.length,stageIds:5,distinctSchoolForms:4,finalStage:'ASSET_INPUT_REQUIRED',alphaSheet:`${out}/alpha-check.png`}))
