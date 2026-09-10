// Assemble requested comparisons from actual browser captures, never redraw UI.
import sharp from 'sharp'
import {readFile,writeFile,readdir,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const root='.local/game-visual-polish'
for(const [name,left,right,width] of [
 ['home-mobile',`${root}/before/home-390.png`,`${root}/after-production/home-390.png`,390],
 ['home-desktop',`${root}/before/home-1440.png`,`${root}/after-production/home-1440.png`,1000],
 ['share-mobile','.local/game-visual/after/share-390.png',`${root}/after-final/share-390.png`,390],
]) {
 const cells=await Promise.all([left,right].map(p=>sharp(p).resize({width}).png().toBuffer()))
 const meta=await Promise.all(cells.map(b=>sharp(b).metadata()))
 const header=Buffer.from(`<svg width="${2*width+16}" height="36"><rect width="100%" height="36" fill="#edf0fb"/><text x="12" y="24" font-size="18" fill="#101d4f">Before — PR112</text><text x="${width+28}" y="24" font-size="18" fill="#101d4f">After — PARTIAL / local React</text></svg>`)
 await sharp({create:{width:2*width+16,height:Math.max(...meta.map(m=>m.height))+36,channels:4,background:'#f3f2fa'}})
  .composite([{input:header,left:0,top:0},...cells.map((input,i)=>({input,left:i*(width+16),top:36}))]).png().toFile(`${root}/${name}-before-after.png`)
}
const avif=await readFile('public/images/game/growing-campus-v2.avif'),metadata=await sharp(avif).metadata(),stats=await sharp(avif).stats()
assert.equal(metadata.hasAlpha,true);assert.equal(stats.channels[3].min,0)
const backgrounds=['#ffffff','#f5eaff','#111e4b']
const cells=await Promise.all(backgrounds.map(bg=>sharp(avif).resize(480).flatten({background:bg}).png().toBuffer()))
await sharp({create:{width:1440,height:320,channels:4,background:'#ffffff'}}).composite(cells.map((input,i)=>({input,left:i*480,top:0}))).png().toFile(`${root}/avif-alpha-three-backgrounds.png`)
await writeFile(`${root}/avif-manifest.json`,JSON.stringify({path:'public/images/game/growing-campus-v2.avif',bytes:avif.length,width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,alphaMin:stats.channels[3].min,sha256:createHash('sha256').update(avif).digest('hex')},null,2))
const files=[]
async function walk(directory){for(const e of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${e.name}`;if(e.isDirectory())await walk(path);else if(e.name!=='evidence-index.json'){const data=await readFile(path);files.push({path,bytes:(await stat(path)).size,sha256:createHash('sha256').update(data).digest('hex')})}}}
await walk(root)
const measured=JSON.parse(await readFile(`${root}/perf-after-avif/runtime-manifest.json`,'utf8'))
const changed=[]
for(const entry of measured){if(entry.path.endsWith('.md'))continue;const hash=createHash('sha256').update(await readFile(entry.path)).digest('hex');if(hash!==entry.sha256)changed.push(entry.path)}
assert.deepEqual(changed,[],'Measured runtime/assets must still match; documentation excluded')
await writeFile(`${root}/evidence-index.json`,JSON.stringify({at:new Date().toISOString(),status:'PARTIAL_FOUR_FORMS_CANONICAL_MERGE_BLOCKED',runtimeMatchesMeasuredManifest:true,documentationExcludedFromRuntimeComparison:true,files},null,2))
console.log(JSON.stringify({files:files.length,runtimeMatchesMeasuredManifest:true,comparisons:3,avifAlpha:true}))
