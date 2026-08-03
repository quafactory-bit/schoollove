import http from 'node:http'

const listenPort = Number(process.env.PHASE10L_PROXY_PORT || 3211)
const targetPort = Number(process.env.PHASE10L_POSTGREST_PORT || 3212)

const server = http.createServer((request, response) => {
  const incomingUrl = request.url || '/'
  if (!incomingUrl.startsWith('/rest/v1')) {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ code: 'PHASE10L_TEST_PROXY_ROUTE_NOT_FOUND' }))
    return
  }

  const targetPath = incomingUrl.slice('/rest/v1'.length) || '/'
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      path: targetPath,
      method: request.method,
      headers: { ...request.headers, host: `127.0.0.1:${targetPort}` },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    },
  )

  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json' })
    }
    response.end(JSON.stringify({ code: 'PHASE10L_TEST_PROXY_UPSTREAM_UNAVAILABLE' }))
  })
  request.pipe(upstream)
})

server.listen(listenPort, '127.0.0.1')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
