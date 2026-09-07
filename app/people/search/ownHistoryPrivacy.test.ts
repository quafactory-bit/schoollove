import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const read = (path: string) => readFileSync(path, 'utf8')
const page = read('app/people/search/page.tsx')
const helper = read('lib/peopleDiscoveryHistory.ts')
const client = read('app/people/search/PeopleSearchClient.tsx')
const picker = read('app/people/search/OwnHistoryPicker.tsx')
const panel = read('components/account/MySchoolsPanel.tsx')
describe('own history privacy integration boundaries', () => {
  it('does not serialize context to URLs, persistence, logs or analytics', () => {
    for (const source of [helper, client, picker, panel]) {
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|URLSearchParams|searchParams|console\.|analytics|telemetry|sendBeacon/)
    }
    expect(picker).toContain('href="/account"')
    expect(panel).toContain('href="/people/search"')
    expect(panel).not.toMatch(/\/people\/search[?#]/)
  })
  it('keeps the server helper narrow and server-only, never full account/admin data', () => {
    expect(helper).toContain("import 'server-only'")
    expect(helper).not.toMatch(/createClient|adminClient|serviceRole|getAccountState|private_profiles|display_name|instagram|email|token/i)
    expect(page.indexOf('const history =')).toBeGreaterThan(page.indexOf('hasPublicAccountAccessActive(auth.client'))
    expect(client).toContain("import type { OwnClassDiscoveryChoice }")
  })
  it('does not add public user imports or a new search transport', () => {
    for (const path of ['app/page.tsx', 'app/layout.tsx', 'components/TabBar.tsx']) {
      expect(read(path)).not.toMatch(/OwnHistoryPicker|getOwnClassDiscoveryChoices|peopleDiscoveryHistory/)
    }
    expect(client.match(/fetch\('\/api\/connections\/search'/g)).toHaveLength(1)
    expect(client).not.toMatch(/useEffect|setInterval|router\.push|receiver_user_id|membership_id|profile_id|history_id|owner_user_id|trusted_history|from_history/)
  })
  it('invalidates preview and rejects late responses for superseded criteria', () => {
    expect(client).toContain("setMatchToken(''); setPreview(false); setStatus('')")
    expect(client).toContain('revision !== criteriaRevision.current')
    expect(client).toContain('if (pending.current) return')
    expect(panel).toContain('peopleSearchEnabled && hasSavedK12Class')
  })
})
