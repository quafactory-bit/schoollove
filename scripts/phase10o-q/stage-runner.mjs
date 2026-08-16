import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
if (required.some(key => !process.env[key])) throw new Error('PHASE10O_Q_DIRECT_TCP_CONFIG_MISSING')
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'phase10o-o', 'pg-worker.mjs')

/** One SQL operation is one disposable direct-TCP process. Protocol inputs arrive only over IPC. */
export async function runStage(name, sql) {
  const child = fork(workerPath, [], { env: { ...process.env }, silent: true })
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`PHASE10O_Q_${name}_TIMEOUT`)) }, 15_000)
    child.on('message', message => {
      if (message?.type === 'READY') child.send({ type: 'GO', sql })
      if (message?.type === 'RESULT') { clearTimeout(timer); resolve(message) }
      if (message?.type === 'ERROR') { clearTimeout(timer); reject(new Error(`PHASE10O_Q_${name}_${message.code}`)) }
    })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { if (code !== 0) { clearTimeout(timer); reject(new Error(`PHASE10O_Q_${name}_EXIT_${code}`)) } })
  })
}
