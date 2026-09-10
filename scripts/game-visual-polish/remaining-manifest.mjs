// Commit/evidence provenance only. No credentials, remote reads or mutations.
import {execFileSync} from 'node:child_process'
import {readFile,writeFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const out='.local/game-visual-polish/remaining',files=[]
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(path);else if(entry.name!=='manifest.json'){const data=await readFile(path);files.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')})}}}
await walk(out)
const sources=[]
for(const path of ['components/game/SchoolWorld.tsx','components/game/SchoolMemoryGate.tsx','app/game.css','public/images/game/growing-campus-v2.avif'])sources.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})
const result={at:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD']).toString().trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}']).toString().trim(),gitStatus:execFileSync('git',['status','--short','--branch']).toString().trim(),sources,files,livePostflight:'NOT_RUN: normal network permission restoration unconfirmed',performance:'No new LCP batch; historical warm552 vs460ms remains user decision'}
await writeFile(`${out}/manifest.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({head:result.head,tree:result.tree,files:files.length,gitStatus:result.gitStatus}))
