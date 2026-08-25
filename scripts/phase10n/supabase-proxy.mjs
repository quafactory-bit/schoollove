import http from 'node:http'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'

const listenPort=Number(process.env.PHASE10N_PROXY_PORT||3221)
const restPort=Number(process.env.PHASE10N_POSTGREST_PORT||3222)
const authPort=Number(process.env.PHASE10N_GOTRUE_PORT||3223)
const controlToken=process.env.PHASE10N_PROXY_CONTROL_TOKEN
const databaseContainer=process.env.PHASE10N_DB_CONTAINER
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let forceAuthFailure=false
const googleFixtures=new Map()

function requestAuth(path,body){
  return new Promise((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:authPort,path,method:'POST',headers:{'content-type':'application/json'}},response=>{
      let value=''
      response.on('data',chunk=>{value+=chunk})
      response.on('end',()=>{
        try{resolve({status:response.statusCode||502,body:JSON.parse(value)})}
        catch{reject(new Error('PHASE10R_FIXTURE_AUTH_RESPONSE_INVALID'))}
      })
    })
    request.on('error',reject)
    request.end(JSON.stringify(body))
  })
}

function requestAuthUser(accessToken){
  return new Promise((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:authPort,path:'/user',method:'GET',headers:{authorization:`Bearer ${accessToken}`}},response=>{
      let value=''
      response.on('data',chunk=>{value+=chunk})
      response.on('end',()=>{
        try{resolve({status:response.statusCode||502,body:JSON.parse(value)})}
        catch{reject(new Error('PHASE10R_FIXTURE_USER_RESPONSE_INVALID'))}
      })
    })
    request.on('error',reject)
    request.end()
  })
}

function fixtureSql(sql){
  if(!databaseContainer)throw new Error('PHASE10R_FIXTURE_DATABASE_MISSING')
  execFileSync('docker',['exec','-i',databaseContainer,'psql','-U','postgres','-d','phase10n_auth','-v','ON_ERROR_STOP=1','-q'],{input:sql,stdio:['pipe','pipe','pipe']})
}

function accessSessionId(accessToken){
  const payload=JSON.parse(Buffer.from(accessToken.split('.')[1]||'','base64url').toString('utf8'))
  if(typeof payload.session_id!=='string'||!UUID.test(payload.session_id))throw new Error('PHASE10R_FIXTURE_SESSION_INVALID')
  return payload.session_id
}

async function createAnonymousSession(){
  const result=await requestAuth('/signup',{})
  if(result.status!==200||typeof result.body?.access_token!=='string'||typeof result.body?.refresh_token!=='string'||typeof result.body?.user?.id!=='string'||!UUID.test(result.body.user.id))throw new Error('PHASE10R_FIXTURE_SIGNUP_FAILED')
  return {accessToken:result.body.access_token,refreshToken:result.body.refresh_token,userId:result.body.user.id,sessionId:accessSessionId(result.body.access_token)}
}

async function refreshFixtureSession(refreshToken){
  const result=await requestAuth('/token?grant_type=refresh_token',{refresh_token:refreshToken})
  if(result.status!==200||typeof result.body?.access_token!=='string'||typeof result.body?.refresh_token!=='string')throw new Error('PHASE10R_FIXTURE_REFRESH_FAILED')
  const verified=await requestAuthUser(result.body.access_token)
  if(verified.status!==200||typeof verified.body?.id!=='string')throw new Error('PHASE10R_FIXTURE_USER_REJECTED')
  const identities=Array.isArray(verified.body?.identities)?verified.body.identities:[]
  if(verified.body?.is_anonymous!==false)throw new Error('PHASE10R_FIXTURE_ANONYMOUS_FLAG_REJECTED')
  if(identities.length!==1)throw new Error('PHASE10R_FIXTURE_IDENTITY_COUNT_REJECTED')
  if(identities[0]?.provider!=='custom:schoollove-google')throw new Error('PHASE10R_FIXTURE_PROVIDER_REJECTED')
  return {accessToken:result.body.access_token,refreshToken:result.body.refresh_token,userId:verified.body.id,provider:identities[0].provider,identityCount:identities.length}
}

async function googleFixtureSession(fixtureKey){
  if(!/^[a-z0-9-]{1,48}$/.test(fixtureKey))throw new Error('PHASE10R_FIXTURE_KEY_INVALID')
  const issued=await createAnonymousSession()
  const existing=googleFixtures.get(fixtureKey)
  if(existing){
    fixtureSql(`BEGIN;
UPDATE auth.sessions SET user_id = '${existing.userId}'::uuid WHERE id = '${issued.sessionId}'::uuid AND user_id = '${issued.userId}'::uuid;
UPDATE auth.refresh_tokens SET user_id = '${existing.userId}' WHERE session_id = '${issued.sessionId}'::uuid AND user_id = '${issued.userId}';
DELETE FROM auth.identities WHERE user_id = '${issued.userId}'::uuid;
DELETE FROM auth.users WHERE id = '${issued.userId}'::uuid;
COMMIT;`)
    return refreshFixtureSession(issued.refreshToken)
  }
  const brokerSubject=`slb:v1:k01:google:${createHash('sha256').update(`phase10r:${issued.userId}`).digest('base64url').slice(0,43)}`
  fixtureSql(`BEGIN;
UPDATE auth.users
SET is_anonymous = false,
    email = NULL,
    encrypted_password = '',
    raw_app_meta_data = jsonb_build_object('provider','custom:schoollove-google','providers',jsonb_build_array('custom:schoollove-google')),
    raw_user_meta_data = '{}'::jsonb
WHERE id = '${issued.userId}'::uuid;
DELETE FROM auth.identities WHERE user_id = '${issued.userId}'::uuid;
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at)
VALUES(gen_random_uuid(),'${issued.userId}'::uuid,'${brokerSubject}','custom:schoollove-google',jsonb_build_object('sub','${brokerSubject}'),now(),now(),now());
COMMIT;`)
  googleFixtures.set(fixtureKey,{userId:issued.userId,brokerSubject})
  return refreshFixtureSession(issued.refreshToken)
}

const server=http.createServer((request,response)=>{
  const incoming=request.url||'/'
  if(incoming==='/phase10n-proxy-health'){
    response.writeHead(204,{'cache-control':'no-store'});response.end();return
  }
  if(incoming==='/phase10r-google-session'&&request.method==='POST'){
    if(!controlToken||request.headers['x-phase10n-control']!==controlToken){
      response.writeHead(403,{'content-type':'application/json'});response.end(JSON.stringify({code:'PHASE10R_TEST_CONTROL_REJECTED'}));return
    }
    let body=''
    request.on('data',chunk=>{body+=chunk})
    request.on('end',async()=>{
      try{
        const fixture=await googleFixtureSession(JSON.parse(body).fixtureKey)
        response.writeHead(200,{
          'content-type':'application/json','cache-control':'no-store',
          'set-cookie':[
            `sl_user_access=${fixture.accessToken}; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax`,
            `sl_user_refresh=${fixture.refreshToken}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`,
          ],
        })
        response.end(JSON.stringify({userId:fixture.userId,provider:fixture.provider,identityCount:fixture.identityCount}))
      }catch(error){
        const message=error instanceof Error&&/^PHASE10R_[A-Z0-9_]+$/.test(error.message)?error.message:'PHASE10R_GOOGLE_FIXTURE_FAILED'
        response.writeHead(500,{'content-type':'application/json','cache-control':'no-store'})
        response.end(JSON.stringify({code:message}))
      }
    })
    return
  }
  if(incoming==='/phase10n-auth-failure'&&request.method==='POST'){
    if(!controlToken||request.headers['x-phase10n-control']!==controlToken){
      response.writeHead(403,{'content-type':'application/json'});response.end(JSON.stringify({code:'PHASE10N_TEST_CONTROL_REJECTED'}));return
    }
    let body=''
    request.on('data',(chunk)=>{body+=chunk})
    request.on('end',()=>{
      forceAuthFailure=JSON.parse(body).enabled===true
      response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({enabled:forceAuthFailure}))
    })
    return
  }
  const route=incoming.startsWith('/rest/v1')
    ? {port:restPort,path:incoming.slice('/rest/v1'.length)||'/'}
    : incoming.startsWith('/auth/v1')
      ? {port:authPort,path:incoming.slice('/auth/v1'.length)||'/'} : null
  if(!route){response.writeHead(404,{'content-type':'application/json'});response.end(JSON.stringify({code:'PHASE10N_TEST_PROXY_ROUTE_NOT_FOUND'}));return}
  if(incoming.startsWith('/auth/v1')&&forceAuthFailure){response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({code:'PHASE10N_TEST_AUTH_PROVIDER_FAILURE'}));return}
  const upstream=http.request({hostname:'127.0.0.1',port:route.port,path:route.path,method:request.method,headers:{...request.headers,host:`127.0.0.1:${route.port}`}},(upstreamResponse)=>{
    response.writeHead(upstreamResponse.statusCode||502,upstreamResponse.headers);upstreamResponse.pipe(response)
  })
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'content-type':'application/json'});response.end(JSON.stringify({code:'PHASE10N_TEST_PROXY_UPSTREAM_UNAVAILABLE'}))})
  request.pipe(upstream)
})
server.listen(listenPort,'127.0.0.1')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
