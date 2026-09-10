import {readFile,writeFile,mkdir} from 'node:fs/promises'
const root='.local/game-visual-polish',labels=['after-avif','finish-before','finish-after']
const analysis=[]
for(const label of labels){
 const result=JSON.parse(await readFile(`${root}/perf-${label}/results.json`,'utf8')),runs=[]
 for(const row of result.rows.filter(x=>['cold','warm'].includes(x.kind))){
  const trace=JSON.parse(await readFile(`${root}/perf-${label}/${row.kind}-${row.index}-trace.json`,'utf8')).traceEvents
  const nav=trace.find(e=>e.name==='navigationStart'&&e.args?.data?.documentLoaderURL==='http://127.0.0.1:3118/')
  const end=nav.ts+row.lcp*1000
  const events=trace.filter(e=>e.pid===nav.pid&&e.tid===nav.tid&&e.dur&&e.ts>=nav.ts&&e.ts<end)
  const longest=events.filter(e=>['FunctionCall','EvaluateScript','UpdateLayoutTree','Layout','Paint'].includes(e.name)).sort((a,b)=>b.dur-a.dur).slice(0,5).map(e=>({name:e.name,startMs:(e.ts-nav.ts)/1000,durationMs:e.dur/1000}))
  const source=row.observations.lcp.at(-1).url
  runs.push({kind:row.kind,index:row.index,lcp:row.lcp,cls:row.cls,breakdown:row.breakdown,lcpSource:source,selectedResponse:row.responses.find(x=>x.url===source),selectedResource:row.resources.find(x=>x.name===source),imageRequests:row.responses.filter(x=>x.type==='Image').map(x=>({url:x.url,status:x.status,fromDiskCache:x.fromDiskCache})),longestSelectedMainThreadEventsBeforeLcp:longest,decodeAttribution:'Not present as explicit ImageDecode events in this trace category set; render delay is not a decode measurement'})
 }
 analysis.push({label,summary:result.summary,protocol:result.protocol,runs})
}
await mkdir(`${root}/finish`,{recursive:true});await writeFile(`${root}/finish/performance-analysis.json`,JSON.stringify(analysis,null,2))
console.log(JSON.stringify(analysis.map(x=>({label:x.label,summary:x.summary,warm:x.runs.filter(r=>r.kind==='warm').map(r=>({lcp:r.lcp,source:r.lcpSource,status:r.selectedResponse.status,fromDiskCache:r.selectedResponse.fromDiskCache,cacheControl:r.selectedResponse.cacheControl,loadDuration:r.breakdown.resourceLoadDuration,renderDelay:r.breakdown.elementRenderDelay,longest:r.longestSelectedMainThreadEventsBeforeLcp}))})),null,2))
