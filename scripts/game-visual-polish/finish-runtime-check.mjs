// Real compiled local Next response; synthetic transport only, no remote calls.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const out='.local/game-visual-polish/finish'
await mkdir(out,{recursive:true})
const home=await fetch('http://127.0.0.1:3118/');assert.equal(home.status,200)
const html=await home.text()
const urls=[...new Set(html.match(/\/_next\/static\/media\/growing-campus-v2\.[a-z0-9]+\.avif/g))]
assert.equal(urls.length,1,'One content-hashed AVIF source in compiled HTML')
const resource=await fetch(`http://127.0.0.1:3118${urls[0]}`),bytes=Buffer.from(await resource.arrayBuffer())
assert.equal(resource.status,200);assert.match(resource.headers.get('cache-control'),/immutable/)
const original=await readFile('public/images/game/growing-campus-v2.avif')
assert.equal(bytes.compare(original),0,'Static import must preserve exact accepted image bytes')
const result={path:urls[0],status:resource.status,cacheControl:resource.headers.get('cache-control'),contentType:resource.headers.get('content-type'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),identicalToAcceptedAvif:true,buildId:(await readFile('.next/BUILD_ID','utf8')).trim(),fixture:'local compiled Next, synthetic guest'}
await writeFile(`${out}/compiled-asset.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
