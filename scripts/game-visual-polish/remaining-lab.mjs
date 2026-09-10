// Local-only production runtime fixture. No environment file writes or real DB.
import http from 'node:http'
import {spawn} from 'node:child_process'
const school={id:'11111111-1111-4111-8111-111111111111',school_name:'예시푸른고등학교',slug:'example-school',school_type:'high',sido:'예시시',sigungu:'예시구'}
const counts={}
const mock=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),chunks=[]
 for await(const chunk of req)chunks.push(chunk)
 const body=Buffer.concat(chunks).toString(),route=url.pathname
 counts[route]=(counts[route]||0)+1
 await new Promise(r=>setTimeout(r,100))
 res.setHeader('Content-Type','application/json')
 if(route==='/rest/v1/rpc/get_public_account_launch_state')return res.end(JSON.stringify([{state:'open',registration_enabled:true,private_profile_enabled:true,school_membership_enabled:true,emergency_stopped:false}]))
 if(route==='/rest/v1/schools'&&url.searchParams.get('slug')==='eq.example-school')return res.end(JSON.stringify(school))
 if(route==='/rest/v1/rpc/get_school_growth_game'){
  const requested=body?JSON.parse(body).requested_school_id:null
  return res.end(JSON.stringify(requested===school.id?[{schoolId:school.id,schoolName:school.school_name,slug:school.slug,level:10,progress:65,weeklyXp:0,rank:null,lastLevelUp:null}]:[]))
 }
 if(route==='/rest/v1/rpc/record_public_account_activity')return res.end('null')
 res.statusCode=403;res.end(JSON.stringify({error:'LOCAL_FIXTURE_UNSUPPORTED'}))
})
await new Promise(r=>mock.listen(3219,'127.0.0.1',r))
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3219',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-polish-dummy',SUPABASE_SERVICE_ROLE_KEY:'local-polish-dummy',SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE:'off',NEXT_TELEMETRY_DISABLED:'1'}
const child=spawn(process.execPath,['--import','./scripts/game-visual-polish/no-remote.mjs','./node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3118'],{env,stdio:'inherit',windowsHide:true})
child.on('exit',code=>{console.log('LOCAL_SYNTHETIC_REQUEST_COUNTS',JSON.stringify(counts));mock.close();process.exitCode=code??1})
process.on('SIGINT',()=>{child.kill();mock.close()})
