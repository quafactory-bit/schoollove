import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/account/page.tsx', 'utf8')
const client = readFileSync('app/account/AccountClient.tsx', 'utf8')
const config = readFileSync('next.config.ts', 'utf8')

describe('v2-06 roster-first account', () => {
  it('fetches each registered school roster with the existing RPC wrapper only', () => {
    expect(page).toContain('getSchoolRoster(auth.client, membership.school_id)')
    expect(page).toContain('membership.roster_visible ?')
  })
  it('shows the roster first and folds account management into settings', () => {
    expect(client).toContain('const rosterFirst=onboardingComplete&&rosters.length>0')
    expect(client).toContain('<RosterView schools={rosters} myName={myName} />')
    expect(client).toContain('id="account-settings"')
  })
  it('replaces people search with the roster and connections with the notifications tab', () => {
    expect(config).toContain("{ source: '/people/search', destination: '/account', permanent: false }")
    expect(config).toContain("{ source: '/connections', destination: '/notifications', permanent: false }")
  })
})
