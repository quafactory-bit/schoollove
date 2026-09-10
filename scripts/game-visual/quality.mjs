import {chromium,expect} from '@playwright/test'
import {writeFile,mkdir,stat} from 'node:fs/promises'
import sharp from 'sharp'
import {setup} from '../growth-ux/browser.mjs'
const root='.local/game-visual'
await mkdir(root,{recursive:true})
const luminance=hex=>hex.match(/\w\w/g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const pairs=[['body navy / pale sky','101d4f','bfd8ff'],['body secondary / soft blue','526078','eef2ff'],['CTA white / darkest pink','ffffff','bd246a'],['CTA white / violet endpoint','ffffff','7534b9'],['stage label','583a9c','ece6ff'],['owner text / lightest navy','e2e9ff','344e91'],['tab selected / white','b32569','ffffff']]
const contrast=pairs.map(([name,a,b])=>({name,ratio:ratio(a,b)}))
for(const entry of contrast)expect(entry.ratio).toBeGreaterThanOrEqual(4.5)
const browser=await chromium.launch({channel:'chrome',headless:true})
const checks=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});await setup(page)
 await page.goto('http://127.0.0.1:3117/account?mode=member&level=4')
 await expect(page.locator('.sl-owner-dashboard')).toBeVisible()
 await page.addStyleTag({content:'body{zoom:2}'})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByRole('button',{name:'친구 불러서 학교 키우기'}).click()
 await expect(page.getByRole('button',{name:'친구 링크 준비',exact:true})).toBeVisible()
 await page.screenshot({path:`${root}/after/share-css-200.png`})
 checks.push({name:'200% CSS enlargement (not physical browser zoom)',result:'PASS'})
 const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await setup(mobile)
 await mobile.goto('http://127.0.0.1:3117/')
 await expect(mobile.getByRole('button',{name:'내 학교 찾기'})).toBeVisible()
 const button=mobile.getByRole('button',{name:'내 학교 찾기'})
 expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44)
 await button.focus();expect(await button.evaluate(e=>getComputedStyle(e).boxShadow!=='none')).toBe(true)
 const hero=await mobile.locator('.sl-hero-world').boundingBox();expect(hero.y+hero.height).toBeLessThan(844)
 await mobile.screenshot({path:`${root}/after/home-viewport-390.png`})
 checks.push({name:'390 first viewport search/world, 44px action and visible keyboard focus',result:'PASS'})
}finally{await browser.close()}
const assets=[]
for(const name of ['memory-seed','growing-campus']){
 const filename=`public/images/game/${name}.webp`;const meta=await sharp(filename).metadata()
 expect(meta.hasAlpha).toBe(true);expect(meta.width).toBeLessThanOrEqual(1536)
 assets.push({filename,width:meta.width,height:meta.height,bytes:(await stat(filename)).size,alpha:meta.hasAlpha})
}
await writeFile(`${root}/quality.json`,JSON.stringify({contrast,checks,assets},null,2))
console.log(JSON.stringify({contrast,checks,assets}))
// Explicitly requested reference/screenshot comparison; no generated UI pixels.
const ref=await sharp('C:/Users/박완 태블릿/Downloads/a_wide_clean_colorful_ui_ux_mockup_collage_on_a.png').resize(700).toBuffer()
const after=await sharp(`${root}/after/home-1440.png`).resize(700).toBuffer()
const refMeta=await sharp(ref).metadata(), afterMeta=await sharp(after).metadata()
await sharp({create:{width:1424,height:Math.max(refMeta.height,afterMeta.height)+48,channels:3,background:'#f2f3f8'}}).composite([{input:ref,left:8,top:40},{input:after,left:716,top:40}]).png().toFile(`${root}/reference-left-home-right.png`)
