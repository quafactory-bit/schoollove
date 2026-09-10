// Fixed-protocol production-server lab. No routes/interception: browser cache works.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
const label=process.argv[2]
if(!['before','after','after-avif'].includes(label))throw Error('Explicit before/after/after-avif required')
const folder=`.local/game-visual-polish/perf-${label}`
if(existsSync(`${folder}/results.json`))throw Error('Preserve existing raw run set; choose a new evidence directory explicitly')
await mkdir(folder,{recursive:true})
const runtime=[]
for(const path of execFileSync('git',['ls-files','--cached','--others','--exclude-standard','app','components','lib','public','next.config.ts','package.json','package-lock.json']).toString().trim().split(/\r?\n/).sort()) {
 runtime.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})
}
await writeFile(`${folder}/runtime-manifest.json`,JSON.stringify(runtime,null,2))
const browser=await chromium.launch({channel:'chrome',headless:true})
const protocol={viewport:{width:390,height:844},deviceScaleFactor:3,cpuSlowdown:4,downloadBytesPerSecond:1600000/8,uploadBytesPerSecond:750000/8,latencyMs:150,measurementWindowMs:10000,browser:browser.version(),source:execFileSync('git',['rev-parse','HEAD']).toString().trim(),fixture:'local3219:open+empty-growth;100ms/rpc',imageOptimizerCache:'primed before runs',browserCache:'5 fresh contexts; one primed context then3 warm reloads',remoteRequests:'HTTPS blocked; no browser routing that disables cache'}
const rows=[], initialized=new WeakSet()
protocol.runtimeFingerprint=createHash('sha256').update(JSON.stringify(runtime)).digest('hex')
protocol.measurementWindowRule='minimum 10000ms; through load/visible hero if longer, same as Before'
async function run(page,kind,index){
 const cdp=await page.context().newCDPSession(page),responses=[]
 await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['https://*']})
 if(kind==='cold')await cdp.send('Network.clearBrowserCache')
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750,connectionType:'cellular3g'})
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})
 cdp.on('Network.responseReceived',({response:r,type})=>responses.push({url:r.url,status:r.status,type,fromDiskCache:r.fromDiskCache,fromServiceWorker:r.fromServiceWorker,mimeType:r.mimeType,cacheControl:r.headers['Cache-Control']||r.headers['cache-control'],timing:r.timing}))
 const trace=[];cdp.on('Tracing.dataCollected',e=>trace.push(...e.value))
 await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,loading',transferMode:'ReportEvents'})
 if(!initialized.has(page)){await page.addInitScript(()=>{
  window.__polish={lcp:[],cls:0,shifts:[]}
  new PerformanceObserver(l=>{for(const e of l.getEntries()){const x=e.element;window.__polish.lcp.push({startTime:e.startTime,renderTime:e.renderTime,loadTime:e.loadTime,size:e.size,url:e.url,element:x?{tag:x.tagName,id:x.id,className:x.className,text:x.tagName==='IMG'?'':x.textContent?.slice(0,100)}:null})}}).observe({type:'largest-contentful-paint',buffered:true})
  new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput){window.__polish.cls+=e.value;window.__polish.shifts.push({time:e.startTime,value:e.value})}}).observe({type:'layout-shift',buffered:true})
 });initialized.add(page)}
 const begun=Date.now();const response=await page.goto('http://127.0.0.1:3118',{waitUntil:'load',timeout:60000})
 expect(response.status()).toBe(200);await expect(page.locator('.sl-hero-world .sl-world-image')).toBeVisible()
 await page.waitForTimeout(Math.max(0,10000-(Date.now()-begun)))
 const raw=await page.evaluate(()=>({observations:window.__polish,navigation:performance.getEntriesByType('navigation')[0].toJSON(),resources:performance.getEntriesByType('resource').map(x=>x.toJSON()),images:[...document.images].map(i=>({src:i.currentSrc,sizes:i.sizes,rendered:{width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height},natural:{width:i.naturalWidth,height:i.naturalHeight},loading:i.loading,priority:i.fetchPriority,complete:i.complete})),dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth}))
 const lcp=raw.observations.lcp.at(-1),resource=raw.resources.find(r=>r.name===lcp?.url),ttfb=raw.navigation.responseStart
 const breakdown=resource?{ttfb,resourceLoadDelay:Math.max(0,resource.startTime-ttfb),resourceLoadDuration:resource.responseEnd-Math.max(resource.startTime,ttfb),elementRenderDelay:lcp.startTime-resource.responseEnd}:{ttfb,resourceLoadDelay:0,resourceLoadDuration:0,elementRenderDelay:(lcp?.startTime||0)-ttfb}
 const row={kind,index,at:new Date().toISOString(),lcp:lcp?.startTime??null,cls:raw.observations.cls,breakdown,...raw,responses};rows.push(row)
 await page.screenshot({path:`${folder}/${kind}-${index}.png`})
 const ended=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await ended
 await writeFile(`${folder}/${kind}-${index}-trace.json`,JSON.stringify({traceEvents:trace}))
 await writeFile(`${folder}/${kind}-${index}.json`,JSON.stringify(row,null,2));await cdp.detach()
 console.log(JSON.stringify({label,kind,index,lcp:row.lcp,cls:row.cls,breakdown,element:lcp?.element}))
}
try{
 // Prime optimizer with actual page-selected image; excluded, explicitly recorded.
 const primeContext=await browser.newContext({viewport:protocol.viewport,deviceScaleFactor:3});const prime=await primeContext.newPage();await run(prime,'optimizer-prime',0);await primeContext.close()
 for(let i=1;i<=5;i++){const context=await browser.newContext({viewport:protocol.viewport,deviceScaleFactor:3});await run(await context.newPage(),'cold',i);await context.close()}
 const warm=await browser.newContext({viewport:protocol.viewport,deviceScaleFactor:3}),page=await warm.newPage();await run(page,'browser-prime',0)
 for(let i=1;i<=3;i++)await run(page,'warm',i)
 await warm.close()
}finally{
 const stats=kind=>{const v=rows.filter(r=>r.kind===kind).map(r=>r.lcp).sort((a,b)=>a-b);return{runs:v.length,median:v.length?v[Math.floor(v.length/2)]:null,min:v[0],max:v.at(-1)}}
 await writeFile(`${folder}/results.json`,JSON.stringify({protocol,rows,summary:{cold:stats('cold'),warm:stats('warm')}},null,2));await browser.close()
}
