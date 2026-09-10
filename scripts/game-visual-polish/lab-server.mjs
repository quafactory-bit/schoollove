// Synthetic transport for actual Next production pages. No real Supabase/identity.
import http from 'node:http'
import {spawn} from 'node:child_process'
const mode=process.argv[2]||'start'
const counts={}
const mock=http.createServer(async(req,res)=>{
 const route=new URL(req.url,'http://127.0.0.1').pathname
 counts[route]=(counts[route]||0)+1
 req.resume()
 // Fixed100ms fixture service latency, identical for both versions.
 await new Promise(r=>setTimeout(r,100))
 res.setHeader('Content-Type','application/json')
 res.setHeader('Access-Control-Allow-Origin','*')
 if(route.endsWith('/get_public_account_launch_state'))return res.end(JSON.stringify([{state:'open',registration_enabled:true,private_profile_enabled:true,school_membership_enabled:true,emergency_stopped:false}]))
 if(route.endsWith('/get_school_growth_game'))return res.end('[]')
 if(route.endsWith('/record_public_account_activity'))return res.end('null')
 res.statusCode=403;res.end(JSON.stringify({error:'LOCAL_FIXTURE_UNSUPPORTED'}))
})
await new Promise(r=>mock.listen(3219,'127.0.0.1',r))
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3219',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-polish-dummy',SUPABASE_SERVICE_ROLE_KEY:'local-polish-dummy',SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE:'off',NEXT_TELEMETRY_DISABLED:'1'}
const child=spawn(process.execPath,['--import','./scripts/game-visual-polish/no-remote.mjs','./node_modules/next/dist/bin/next',mode,...(mode==='start'?['-H','127.0.0.1','-p','3118']:[])],{env,stdio:'inherit',windowsHide:true})
child.on('exit',code=>{console.log('LOCAL_SYNTHETIC_REQUEST_COUNTS',JSON.stringify(counts));mock.close();process.exitCode=code??1})
process.on('SIGINT',()=>{child.kill();mock.close()})
