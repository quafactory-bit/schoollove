import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const args = process.argv.includes('--staged') ? ['diff', '--cached', '--name-only', '-z'] : ['ls-files', '--modified', '--others', '--exclude-standard', '-z']
const files = [...new Set(execFileSync('git', args).toString().split('\0').filter(Boolean))]
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /GOCSPX-[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /AKIA[A-Z0-9]{16}/, /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/]
const failed = []
for (const file of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(file)) { failed.push(file); continue }
  const content = readFileSync(file, 'utf8')
  if (patterns.some(pattern => pattern.test(content))) failed.push(file)
}
// Never print matching values.
console.log(JSON.stringify({ scannedFiles: files.length, secretPatternFindings: failed.length, files: failed }))
if (failed.length) process.exit(1)
