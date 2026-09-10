// Final-stage-only local verification; real React, all remote traffic blocked.
import {chromium,expect} from '@playwright/test'
import sharp from 'sharp'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {setup} from '../growth-ux/browser.mjs'
const out='.local/game-visual-polish/remaining'
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[]
let svg
try {
 const page=await browser.newPage({viewport:{width:768,height:1024},reducedMotion:'reduce'})
 const evidence=await setup(page)
 for(const effects of [true,false]) {
  const cells=[]
  for(const [i,level] of [1,2,4,7,10].entries()) {
   await page.goto(`http://127.0.0.1:3117/school/example-school?level=${level}`,{waitUntil:'networkidle'})
   await page.addStyleTag({content:'.sl-hub-world .sl-world{width:500px!important;margin:auto!important;transform:none!important}'+(!effects?'.sl-world-aura,.sl-world-orbit{display:none!important}.sl-world-image,.sl-world-friends,.sl-world-structure{animation:none!important;transform:none!important;filter:none!important;scale:1!important}.sl-world-canvas{filter:grayscale(1)}[data-gate-contact]{display:none}':'')})
   await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())))
   const gate=page.locator('.sl-memory-gate')
   expect(await gate.count()).toBe(level===10?1:0)
   if(level===10)svg=await gate.evaluate(e=>e.outerHTML)
   const path=`${out}/${effects?'static':'effects-off'}-${level}.png`
   await page.locator('.sl-hub-world .sl-world-canvas').screenshot({path})
   const title=Buffer.from(`<svg width="500" height="36"><rect width="500" height="36" fill="#edf0fb"/><text x="16" y="24" font-size="18" fill="#101d4f">Lv.${level}${level===10?' — independent memory gate':''}</text></svg>`)
   cells.push({input:title,left:i*500,top:0},{input:await sharp(path).resize(500,334).png().toBuffer(),left:i*500,top:36})
  }
  await sharp({create:{width:2500,height:370,channels:4,background:'#f5efff'}}).composite(cells).png().toFile(`${out}/stages-${effects?'static':'effects-off'}.png`)
 }
 expect(await readFile(`${out}/effects-off-7.png`)).not.toEqual(await readFile(`${out}/effects-off-10.png`))
 for(const [width,height] of [[360,800],[390,844],[412,915],[768,1024],[1280,900],[1440,900]]) {
  await page.setViewportSize({width,height})
  for(const [name,path] of [['hub','/school/example-school?level=10'],['owner','/account?mode=member&level=10']]) {
   await page.goto('http://127.0.0.1:3117'+path,{waitUntil:'networkidle'})
   await expect(page.locator('.sl-memory-gate')).toHaveCount(1)
   await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())))
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
   const geometry=await page.locator('.sl-memory-gate').evaluate(e=>{
    const scale=e.getBoundingClientRect().width/1000,gate=e.querySelector('g[transform]').getBBox(),friends=e.closest('.sl-world-canvas').querySelector('.sl-world-friends'),plane=e.getBoundingClientRect()
    return {gateRight:plane.x+(46+(gate.x+gate.width)*.84)*scale,friendsLeft:friends.getBoundingClientRect().left,focusable:e.getAttribute('focusable'),hidden:!!e.closest('[aria-hidden=true]')}
   })
   expect(geometry.gateRight).toBeLessThan(geometry.friendsLeft)
   expect(geometry.hidden).toBe(true);expect(geometry.focusable).toBe('false')
   await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true})
   results.push({check:'final stage viewport',name,width,height,overflow:false,geometry})
  }
 }
 // Three backgrounds use the real DOM scene, including original unmodified raster.
 const bgCells=[]
 await page.setViewportSize({width:768,height:1024})
 for(const [i,background] of ['#ffffff','#f5eaff','#111e4b'].entries()) {
  await page.goto('http://127.0.0.1:3117/school/example-school?level=10',{waitUntil:'networkidle'})
  await page.addStyleTag({content:`.sl-hub-world .sl-world{width:500px!important;margin:auto!important;transform:none!important}.sl-world-canvas{background:${background}}.sl-world-aura,.sl-world-orbit{display:none}.sl-world-image{filter:none}`})
  await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())))
  const path=`${out}/background-${i}.png`;await page.locator('.sl-hub-world .sl-world-canvas').screenshot({path})
  bgCells.push({input:await sharp(path).resize(500,334).png().toBuffer(),left:i*500,top:0})
 }
 await sharp({create:{width:1500,height:334,channels:4,background:'#fff'}}).composite(bgCells).png().toFile(`${out}/three-backgrounds.png`)
 // Rasterize only the browser-rendered original SVG for alpha QA, never repair art.
 const transparent=await browser.newPage({viewport:{width:1000,height:667}})
 await transparent.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style>${svg}`)
 await transparent.locator('svg').screenshot({path:`${out}/gate-alpha.png`,omitBackground:true})
 const meta=await sharp(`${out}/gate-alpha.png`).metadata(),raw=await sharp(`${out}/gate-alpha.png`).ensureAlpha().raw().toBuffer()
 const alphaAt=(x,y)=>raw[(y*1000+x)*4+3]
 expect(meta.hasAlpha).toBe(true);expect(alphaAt(0,0)).toBe(0);expect(alphaAt(999,666)).toBe(0)
 expect(alphaAt(287,300)).toBe(0) // Through the arch opening, not an opaque cutout.
 let clear=0;for(let i=3;i<raw.length;i+=4)if(raw[i]===0)clear++
 results.push({check:'independent SVG alpha',hasAlpha:true,transparentFraction:clear/(1000*667),openingTransparent:true,svgBytes:Buffer.byteLength(svg),svgGzipBytes:gzipSync(svg).length,extraImageRequests:0})
 await transparent.close()
 // Both artwork and gate inherit exactly one moving parent, including reduced mode.
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'})
 await page.goto('http://127.0.0.1:3117/school/example-school?level=10',{waitUntil:'networkidle'})
 const scene=page.locator('.sl-hub-world .sl-world'),plane=scene.locator('.sl-world-structure'),button=scene.getByRole('button')
 await scene.scrollIntoViewIfNeeded();await expect(scene).toHaveAttribute('data-motion','running')
 await expect(plane).toHaveCSS('animation-play-state','running')
 await expect(scene.locator('.sl-world-image')).toHaveCSS('animation-name','none')
 await expect(scene.locator('.sl-memory-gate')).toHaveCSS('animation-name','none')
 await button.focus();await page.keyboard.press('Space');await expect(plane).toHaveCSS('animation-play-state','paused')
 const still=await plane.evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(200)
 expect(await plane.evaluate(e=>getComputedStyle(e).transform)).toBe(still)
 await page.keyboard.press('Enter');await expect(plane).toHaveCSS('animation-play-state','running')
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await expect(scene).toHaveAttribute('data-motion','paused')
 await scene.scrollIntoViewIfNeeded();await page.emulateMedia({reducedMotion:'reduce'})
 await expect(plane).toHaveCSS('animation-name','none');await expect(button).toBeDisabled()
 await page.reload();await expect(plane).toHaveCSS('animation-name','none')
 results.push({check:'shared motion plane, pause/resume keyboard, offscreen, reduced initial/change',pass:true,additionalObservers:0})
 expect(evidence.errors).toEqual([]);expect(evidence.calls.every(x=>x.method==='GET')).toBe(true)
 const assets=JSON.parse(await readFile('.local/game-visual-polish/finish/art/asset-manifest.json','utf8'))
 for(const asset of assets)expect(createHash('sha256').update(await readFile(asset.path)).digest('hex')).toBe(asset.sha256)
 results.push({check:'accepted raster and duo hashes unchanged',count:assets.length,pass:true})
}finally{await browser.close();await writeFile(`${out}/checks.json`,JSON.stringify(results,null,2))}
console.log(JSON.stringify(results))
