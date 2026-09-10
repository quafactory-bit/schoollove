// Deny remote fetches in local production-build/runtime QA. No credentials logged.
const originalFetch=globalThis.fetch
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('POLISH_LAB_REMOTE_FETCH_BLOCKED')
 return originalFetch(input,init)
}
