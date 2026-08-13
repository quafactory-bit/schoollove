import crypto from 'node:crypto'
import net from 'node:net'

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
if (required.some(key => !process.env[key]) || typeof process.send !== 'function') process.exit(2)

const cstring = value => Buffer.from(`${value}\0`, 'utf8')
const message = (kind, body = Buffer.alloc(0)) => Buffer.concat([Buffer.from(kind), Buffer.from([0, 0, 0, body.length + 4]), body])
const xor = (left, right) => Buffer.from(left.map((value, index) => value ^ right[index]))
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest()
const sqlState = body => {
  let offset = 0
  while (offset < body.length && body[offset] !== 0) {
    const field = String.fromCharCode(body[offset]); offset += 1
    const end = body.indexOf(0, offset); if (end < 0) break
    if (field === 'C') return body.subarray(offset, end).toString('ascii')
    offset = end + 1
  }
  return 'UNKNOWN'
}

async function connect() {
  const socket = net.createConnection({ host: process.env.PGHOST, port: Number(process.env.PGPORT) })
  const inbox = []; let buffered = Buffer.alloc(0); let wake
  socket.on('data', chunk => { buffered = Buffer.concat([buffered, chunk]); while (buffered.length >= 5 && buffered.length >= buffered.readUInt32BE(1) + 1) { const length = buffered.readUInt32BE(1); inbox.push({ kind: String.fromCharCode(buffered[0]), body: buffered.subarray(5, length + 1) }); buffered = buffered.subarray(length + 1); wake?.() } })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  const startup = Buffer.concat([Buffer.from([0, 3, 0, 0]), cstring('user'), cstring(process.env.PGUSER), cstring('database'), cstring(process.env.PGDATABASE), cstring('client_encoding'), cstring('UTF8'), Buffer.from([0])])
  socket.write(Buffer.concat([Buffer.from([0, 0, 0, startup.length + 4]), startup]))
  const next = async () => { while (inbox.length === 0) await new Promise(resolve => { wake = resolve }); return inbox.shift() }
  let signature = null
  while (true) {
    const packet = await next()
    if (packet.kind === 'R') {
      const code = packet.body.readInt32BE(0)
      if (code === 0) continue
      if (code === 12) { if (packet.body.subarray(4).toString('utf8') !== `v=${signature}`) throw new Error('AUTH_REJECTED'); continue }
      if (code !== 10) throw new Error('AUTH_REJECTED')
      const nonce = crypto.randomBytes(18).toString('base64'); const firstBare = `n=*,r=${nonce}`; const initial = `n,,${firstBare}`
      socket.write(message('p', Buffer.concat([cstring('SCRAM-SHA-256'), Buffer.from([0, 0, 0, Buffer.byteLength(initial)]), Buffer.from(initial)])))
      const cont = await next(); if (cont.kind !== 'R' || cont.body.readInt32BE(0) !== 11) throw new Error('AUTH_REJECTED')
      const serverFirst = cont.body.subarray(4).toString('utf8'); const fields = Object.fromEntries(serverFirst.split(',').map(field => [field.slice(0, 1), field.slice(2)]))
      if (!fields.r?.startsWith(nonce) || !fields.s || !/^\d+$/.test(fields.i ?? '')) throw new Error('AUTH_REJECTED')
      const salted = crypto.pbkdf2Sync(process.env.PGPASSWORD, Buffer.from(fields.s, 'base64'), Number(fields.i), 32, 'sha256'); const clientKey = hmac(salted, 'Client Key'); const storedKey = crypto.createHash('sha256').update(clientKey).digest(); const finalWithoutProof = `c=biws,r=${fields.r}`; const auth = `${firstBare},${serverFirst},${finalWithoutProof}`; const proof = xor(clientKey, hmac(storedKey, auth)); signature = hmac(hmac(salted, 'Server Key'), auth).toString('base64'); socket.write(message('p', Buffer.from(`${finalWithoutProof},p=${proof.toString('base64')}`)))
    } else if (packet.kind === 'Z') break
  }
  async function query(sql) {
    socket.write(message('Q', cstring(sql))); const rows = []; let columns = []
    while (true) {
      const packet = await next()
      if (packet.kind === 'T') { let offset = 2; columns = []; for (let index = 0; index < packet.body.readUInt16BE(0); index += 1) { const end = packet.body.indexOf(0, offset); columns.push(packet.body.subarray(offset, end).toString('utf8')); offset = end + 19 } }
      else if (packet.kind === 'D') { let offset = 2; const row = {}; for (let index = 0; index < packet.body.readUInt16BE(0); index += 1) { const size = packet.body.readInt32BE(offset); offset += 4; row[columns[index]] = size < 0 ? null : packet.body.subarray(offset, offset + size).toString('utf8'); offset += Math.max(size, 0) } rows.push(row) }
      else if (packet.kind === 'E') { const error = new Error('SQL_REJECTED'); error.sqlState = sqlState(packet.body); throw error }
      else if (packet.kind === 'Z') return rows
    }
  }
  return { socket, query }
}

try {
  const session = await connect(); await session.query("SELECT set_config('request.jwt.claim.role','service_role',false)"); const backend = (await session.query('SELECT pg_backend_pid() AS backend_pid'))[0].backend_pid
  process.send({ type: 'READY', workerPid: process.pid, backendPid: Number(backend) })
  process.once('message', async input => {
    try {
      if (!input || input.type !== 'GO' || typeof input.sql !== 'string') throw new Error('WORKER_PROTOCOL')
      const rows = await session.query(input.sql)
      process.send({ type: 'RESULT', workerPid: process.pid, backendPid: Number(backend), rows }, () => { session.socket.destroy(); process.disconnect(); process.exit(0) })
    } catch (error) { session.socket.destroy(); const code = error instanceof Error && error.message === 'SQL_REJECTED' ? `SQLSTATE_${error.sqlState ?? 'UNKNOWN'}` : 'SQL_OR_WORKER_FAILURE'; process.send({ type: 'ERROR', workerPid: process.pid, code }, () => process.exit(1)) }
  })
} catch { process.send?.({ type: 'ERROR', workerPid: process.pid, code: 'CONNECTION_OR_AUTH_FAILURE' }); process.exit(1) }
