// Local schema-only fixture. No connection strings, environment or remote databases.
import { spawn, execFileSync } from 'node:child_process'
const bin = 'C:/pgsql/bin/psql.exe'
const args = ['-h', '127.0.0.1', '-p', '55436', '-U', 'postgres', '-d', 'privacy_retention_clean', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
const sql = input => execFileSync(bin, args, { input, encoding: 'utf8', timeout: 15000 }).trim()
const attempt = 'e4000000-0000-4000-8000-000000000001'
const tx = 'e4000000-0000-4000-8000-000000000002'
sql(`BEGIN;
INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,created_at,expires_at)
VALUES('${attempt}','att_44444444444444444444','google','created',now()-interval '11 minutes',now()-interval '1 minute');
INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,status,created_at,expires_at,terminal_at)
VALUES('${tx}','${attempt}','test','https://example.invalid/callback','code','openid',repeat('A',43),'S256','expired',now()-interval '11 minutes',now()-interval '1 minute',now());
COMMIT;`)
const holder = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Lock barrier timed out')), 5000)
    holder.stdout.on('data', chunk => {
      if (String(chunk).includes('LOCK_HELD')) { clearTimeout(timeout); resolve() }
    })
    holder.on('error', reject)
    holder.stdin.write(`BEGIN; SELECT id FROM private.downstream_authorization_transactions WHERE id='${tx}' FOR UPDATE;\n\\echo LOCK_HELD\n`)
  })
  const blocked = JSON.parse(sql('SELECT public.run_privacy_retention_cleanup();'))
  if (blocked.deferred !== 1 || sql(`SELECT count(*) FROM private.oauth_login_attempts WHERE id='${attempt}';`) !== '1') throw new Error('Locked work was not deferred safely')
  await new Promise(resolve => { holder.on('exit', resolve); holder.stdin.end('ROLLBACK;\n\\q\n') })
  sql('SELECT public.run_privacy_retention_cleanup();')
  if (sql(`SELECT count(*) FROM private.oauth_login_attempts WHERE id='${attempt}';`) !== '0') throw new Error('Retry did not remove unlocked expired work')
  console.log('PRIVACY_RETENTION_LOCK_RETRY_PASS')
} finally {
  if (holder.exitCode === null) holder.kill()
  sql(`DELETE FROM private.downstream_authorization_transactions WHERE id='${tx}'; DELETE FROM private.oauth_login_attempts WHERE id='${attempt}';`)
}
