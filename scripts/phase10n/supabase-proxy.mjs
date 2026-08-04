import http from 'node:http'

const listenPort=Number(process.env.PHASE10N_PROXY_PORT||3221)
const restPort=Number(process.env.PHASE10N_POSTGREST_PORT||3222)
const authPort=Number(process.env.PHASE10N_GOTRUE_PORT||3223)
const controlToken=process.env.PHASE10N_PROXY_CONTROL_TOKEN
let forceAuthFailure=false

const server=http.createServer((request,response)=>{
  const incoming=request.url||'/'
  if(incoming==='/phase10n-otp-template'){
    response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'})
    response.end('<h2>SchoolLove TEST verification code</h2><p>{{ .Token }}</p>')
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
