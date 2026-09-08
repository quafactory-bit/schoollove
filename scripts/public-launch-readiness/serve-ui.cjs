// Actual components + loopback-only synthetic props. No env files or auth credentials.
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated webpack harness. */
const fs=require('node:fs/promises')
const path=require('node:path')
const os=require('node:os')
const http=require('node:http')
const webpackModule=require('next/dist/compiled/webpack/webpack')
webpackModule.init()
async function main(){
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'public-launch-ui-'))
  await new Promise((resolve,reject)=>{
    const compiler=webpackModule.webpack({mode:'development',devtool:false,entry:path.join(__dirname,'ui-entry.tsx'),
      plugins:[new webpackModule.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],
      output:{path:temporary,filename:'bundle.js'},
      resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/hooks/useSchoolAutocomplete':path.join(__dirname,'../discovery-from-my-history/autocomplete-shim.ts'),'@':process.cwd(),'next/navigation':path.join(__dirname,'../discovery-from-my-history/navigation-shim.ts')}},
      module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(__dirname,'../class-history-self-service/typescript-loader.cjs')}]},
    })
    compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()))
  })
  const css=await require('postcss')([require('tailwindcss')({...require('../../tailwind.config.ts').default,
    content:['app/account/*.tsx','app/connections/*.tsx','components/account/*.tsx'],
  })]).process(await fs.readFile('app/globals.css','utf8'),{from:path.resolve('app/globals.css')})
  const bundle=await fs.readFile(path.join(temporary,'bundle.js'))
  const server=http.createServer((req,res)=>{
    res.setHeader('content-type',(req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html')+'; charset=utf-8')
    res.end(req.url==='/bundle.js'?bundle:req.url==='/style.css'?css.css:'<html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  console.log('SYNTHETIC_UI_ORIGIN http://127.0.0.1:'+server.address().port)
  async function cleanup(){
    server.close()
    const resolved=path.resolve(temporary)
    if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('public-launch-ui-'))throw new Error('UNSAFE_TEMP_PATH')
    await fs.rm(resolved,{recursive:true,force:true})
    process.exit(0)
  }
  process.once('SIGINT',cleanup);process.once('SIGTERM',cleanup)
}
main().catch(error=>{console.error(error);process.exitCode=1})
