// Assemble evidence from actual browser screenshots; no generated/reconstructed UI.
import sharp from 'sharp'
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const root='.local/game-visual-polish',out=`${root}/finish`
await mkdir(out,{recursive:true})
const comparisons=[]
for(const [name,before,after,width] of [
 ['home-mobile',`${root}/finish-before-production/home-390.png`,`${root}/finish-after-production/home-390.png`,390],
 ['home-desktop',`${root}/finish-before-production/home-1440.png`,`${root}/finish-after-production/home-1440.png`,1000],
 ['share-mobile',`${root}/after-final/share-390.png`,`${out}/responsive/share-390.png`,390],
 ['hub-mobile',`${root}/after-final/school-390.png`,`${out}/responsive/school-390.png`,390],
 ['hub-desktop',`${root}/after-final/school-1280.png`,`${out}/responsive/school-1280.png`,900]
]) {
 const cells=await Promise.all([before,after].map(p=>sharp(p).resize({width}).png().toBuffer()))
 const meta=await Promise.all(cells.map(x=>sharp(x).metadata()))
 const header=Buffer.from(`<svg width="${width*2+16}" height="36"><rect width="100%" height="36" fill="#edf0fb"/><text x="12" y="24" font-size="18" fill="#101d4f">Before: 307ba36</text><text x="${width+28}" y="24" font-size="18" fill="#101d4f">Finish: PARTIAL / local React</text></svg>`)
 const path=`${out}/${name}-comparison.png`
 await sharp({create:{width:width*2+16,height:Math.max(...meta.map(x=>x.height))+36,channels:4,background:'#f3f2fa'}}).composite([{input:header,left:0,top:0},...cells.map((input,i)=>({input,left:i*(width+16),top:36}))]).png().toFile(path)
 comparisons.push({name,before,after,path,beforeSource:'307ba36; Home recaptured, unchanged Share/Hub prior actual React capture retained',fixture:'local synthetic, not physical device or live account'})
}
await sharp(`${out}/art/stages-effects-off.png`).resize(1250).png().toFile(`${out}/art/stages-effects-off-small.png`)
const measured=JSON.parse(await readFile(`${root}/perf-finish-after/runtime-manifest.json`,'utf8'))
for(const entry of measured.filter(x=>!x.path.endsWith('.md'))){assert.equal(createHash('sha256').update(await readFile(entry.path)).digest('hex'),entry.sha256,`Measured runtime changed: ${entry.path}`)}
const files=[]
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(path);else if(entry.name!=='evidence-index.json'){const data=await readFile(path);files.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')})}}}
await walk(out)
await writeFile(`${out}/evidence-index.json`,JSON.stringify({at:new Date().toISOString(),runtimeMatchesMeasuredManifest:true,comparisons,rawPerformanceDirectories:['perf-before','perf-after','perf-after-avif','perf-finish-before','perf-finish-after'],files},null,2))
console.log(JSON.stringify({comparisons:comparisons.length,files:files.length,runtimeMatchesMeasuredManifest:true}))
