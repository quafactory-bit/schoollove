// Inspect/copy rejected inputs and composite QA sheets; never manufacture alpha.
import sharp from 'sharp'
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const sources=process.argv.slice(2)
if(sources.length!==2)throw Error('Provide the exact initial edit and background-correction files')
const out='.local/game-visual-polish/finish/rejected-art'
await mkdir(out,{recursive:true})
const rows=[]
for(const [index,source] of sources.entries()){
 const data=await readFile(source),meta=await sharp(data).metadata(),stats=await sharp(data).stats()
 const target=`${out}/attempt-${index+1}.png`;await copyFile(source,target)
 const cells=await Promise.all(['#ffffff','#f5eaff','#111e4b'].map(background=>sharp(data).resize(480).flatten({background}).png().toBuffer()))
 await sharp({create:{width:1440,height:320,channels:4,background:'#ffffff'}}).composite(cells.map((input,i)=>({input,left:i*480,top:0}))).png().toFile(`${out}/attempt-${index+1}-three-backgrounds.png`)
 rows.push({source,target,width:meta.width,height:meta.height,bytes:data.length,hasAlpha:meta.hasAlpha,channels:meta.channels,alphaMin:meta.hasAlpha?stats.channels[3].min:null,sha256:createHash('sha256').update(data).digest('hex'),status:meta.hasAlpha?'VISUAL_REVIEW_REQUIRED':'REJECTED_NO_ALPHA',inRuntime:false})
}
await writeFile(`${out}/manifest.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows))
