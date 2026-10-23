import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const memberships = readFileSync('app/api/account/memberships/route.ts', 'utf8')
const requests = readFileSync('app/api/connections/requests/route.ts', 'utf8')
const respond = readFileSync('app/api/connections/requests/[id]/route.ts', 'utf8')
const send = readFileSync('lib/push/send.ts', 'utf8')

describe('v2-09a push triggers (only two kinds, after the response)', () => {
  it('new member: only for a roster-visible registration, after success', () => {
    expect(memberships).toContain('if (parsed.data.show_in_school_roster) {')
    expect(memberships).toContain('after(async () => { await notifyNewRosterMember(')
    expect(memberships.indexOf('notifyNewRosterMember({')).toBeGreaterThan(memberships.indexOf("rpc('add_own_school_membership_with_roster'"))
  })
  it('request created → receiver; accepted → requester; both after the main result', () => {
    expect(requests).toContain('after(async () => { await notifyConnectionRequest(createdRequestId) })')
    expect(respond).toContain("if (body.data.action === 'accept') { const requestId = id.data; after(async () => { await notifyRequestAccepted(requestId) }) }")
    expect(respond.indexOf('notifyRequestAccepted(requestId)')).toBeGreaterThan(respond.indexOf("if (!result?.handled)"))
  })
  it('never logs tokens or endpoints and stays best-effort', () => {
    expect(send).not.toMatch(/console\./)
    expect(send.match(/catch \{/g)?.length).toBeGreaterThanOrEqual(3)
    expect(send).toContain("import 'server-only'")
  })
})
