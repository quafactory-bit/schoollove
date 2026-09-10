import sharp from 'sharp'
const [name,source]=process.argv.slice(2)
if(!['first-reunion-v1','lively-school-v1','bright-memory-v1'].includes(name)||!source)throw Error('Explicit stage and source required')
const meta=await sharp(source).metadata(),stats=await sharp(source).stats()
if(!meta.hasAlpha||stats.channels[3].min!==0)throw Error('Real transparent alpha required')
const target=`public/images/game/${name}.webp`
const output=await sharp(source).resize({width:1000}).webp({quality:82,alphaQuality:100,effort:6}).toFile(target)
console.log(JSON.stringify({name,input:{width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha},output,target,sharp:sharp.versions.sharp}))
