/* eslint-disable @typescript-eslint/no-require-imports -- Disposable Node/psql harness. */
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const container = process.argv[2]
if (!/^schoollove-class-proof-[a-f0-9]{10}$/.test(container || '')) throw new Error('Disposable container required')
const actor = 'aa100001-0000-4000-8000-000000000003'
const receiver = 'aa100001-0000-4000-8000-000000000004'
const school = 'aa000001-0000-4000-8000-000000000001'
class Session {
  constructor() {
    this.serial = 0
    this.child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'class_history', '-v', 'ON_ERROR_STOP=1'])
    this.child.stdout.on('data', data => {
      if (!this.pending) return
      this.pending.output += data.toString()
      if (this.pending.output.includes(this.pending.marker)) {
        const pending = this.pending
        this.pending = null
        clearTimeout(pending.timer)
        pending.resolve(pending.output.split(pending.marker)[0].trim())
      }
    })
    this.child.stderr.on('data', () => { this.sqlError = true })
    this.child.on('error', () => this.fail('psql launch failed'))
    this.child.on('exit', code => { if (code !== 0) this.fail('Disposable SQL failed') })
  }
  fail(message) { if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error(message)); this.pending = null } }
  query(sql) {
    assert.ok(!this.pending, 'One query per session')
    return new Promise((resolve, reject) => {
      const marker = `DONE_${++this.serial}`
      this.pending = { marker, output: '', resolve, reject, timer: setTimeout(() => this.fail('Deterministic barrier deadline exceeded'), 25000) }
      this.child.stdin.write(`${sql};\n\\echo ${marker}\n`)
    })
  }
  close() { this.child.stdin.end() }
}
const searchSql = `SELECT row_to_json(r) FROM public.find_exact_private_profile_class_match('${actor}','${school}',2010,2,3,'Synthetic 4') r`
const editSql = (user, value) => `SET request.jwt.claim.sub='${user}'; SELECT public.replace_own_school_class_history('${user}','[{"grade_number":2,"class_number":${value}}]') IS NOT NULL`
const baselineSql = `SELECT jsonb_build_object('requests',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connection_requests r),'connections',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connections r),'messages',(SELECT count(*) FROM public.connection_messages),'instagram',(SELECT count(*) FROM public.connection_instagram_permissions),'notifications',(SELECT count(*) FROM public.notifications))`
async function waitBlocked(control, waiter, blocker) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const result = await control.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity b ON b.pid=ANY(pg_blocking_pids(w.pid)) WHERE w.application_name='${waiter}' AND b.application_name='${blocker}' AND w.wait_event='advisory')`)
    if (result === 't') return
  }
  throw new Error('Expected advisory lock barrier not observed')
}
async function main() {
  const control = new Session(), search = new Session(), edit = new Session()
  try {
    for (const [session, name] of [[control,'audit_control'],[search,'audit_search'],[edit,'audit_edit']]) {
      await session.query(`SET application_name='${name}'; SET statement_timeout='20s'; SET request.jwt.claim.role='service_role'; SET request.jwt.claim.sub='${actor}'`)
    }
    const baseline = await control.query(baselineSql)
    await edit.query(`BEGIN; ${editSql(actor, 9)}`)
    const blockedSearch = search.query(searchSql)
    await waitBlocked(control, 'audit_search', 'audit_edit')
    await edit.query('COMMIT')
    assert.deepEqual(JSON.parse(await blockedSearch), { match_state: 'unavailable', match_token: null })
    assert.equal(await control.query('SELECT count(*) FROM public.connection_match_tokens'), '0')
    console.log('EDIT_WINS_ACTOR_PASS: observed advisory wait; revalidation unavailable; tokens=0')
    await edit.query(editSql(actor, 3))

    await search.query('BEGIN')
    const found = JSON.parse(await search.query(searchSql))
    assert.equal(found.match_state, 'match_available')
    assert.match(found.match_token, /^[a-f0-9-]{36}$/)
    const blockedEdit = edit.query(`BEGIN; ${editSql(receiver, 8)}`)
    await waitBlocked(control, 'audit_edit', 'audit_search')
    await search.query('COMMIT')
    assert.equal(await blockedEdit, 't')
    await edit.query('COMMIT')
    assert.equal(await control.query(`SELECT count(*) FROM public.connection_match_tokens WHERE used_at IS NULL AND expires_at>now() AND (requester_user_id='${receiver}' OR receiver_user_id='${receiver}')`), '0')
    const request = JSON.parse(await control.query(`SELECT row_to_json(r) FROM public.create_connection_request('${actor}','${found.match_token}','same_class','Hello') r`))
    assert.deepEqual(request, { created: false, request_id: null, request_state: 'unavailable' })
    assert.equal(await control.query(baselineSql), baseline)
    console.log('SEARCH_WINS_RECEIVER_PASS: observed advisory wait; stale tokens=0; request unavailable; all relations preserved')
  } finally {
    for (const session of [control, search, edit]) session.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
