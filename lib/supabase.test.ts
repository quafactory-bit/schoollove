import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuthenticatedSupabase } from './user-auth'

type BrowserSupabaseScope = typeof globalThis & {
  __schoolloveBrowserSupabaseClient?: SupabaseClient
}

type BrowserClientGetter = (
  scope?: BrowserSupabaseScope,
  factory?: () => SupabaseClient,
) => SupabaseClient

let getOrCreateBrowserSupabaseClient: BrowserClientGetter

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture-anon-key')
  ;({ getOrCreateBrowserSupabaseClient } = await import('./supabase'))
})

describe('Supabase client lifecycle', () => {
  it('reuses one browser client and invokes its factory once', () => {
    const scope = {} as BrowserSupabaseScope
    const client = { from: vi.fn() } as unknown as SupabaseClient
    const factory = vi.fn(() => client)

    expect(getOrCreateBrowserSupabaseClient(scope, factory)).toBe(client)
    expect(getOrCreateBrowserSupabaseClient(scope, factory)).toBe(client)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('shares the context singleton across browser consumers', () => {
    const scope = {} as BrowserSupabaseScope
    const client = { rpc: vi.fn() } as unknown as SupabaseClient
    const factory = vi.fn(() => client)
    const searchConsumer = () => getOrCreateBrowserSupabaseClient(scope, factory)
    const adminConsumer = () => getOrCreateBrowserSupabaseClient(scope, factory)

    expect(searchConsumer()).toBe(adminConsumer())
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('keeps authenticated server clients request-scoped', () => {
    expect(createAuthenticatedSupabase('fixture-access-one')).not.toBe(
      createAuthenticatedSupabase('fixture-access-two'),
    )
  })

  it('keeps browser singleton and server request-auth boundaries separate', () => {
    const supabaseSource = readFileSync(join(process.cwd(), 'lib/supabase.ts'), 'utf8')
    const userAuthSource = readFileSync(join(process.cwd(), 'lib/user-auth.ts'), 'utf8')

    expect(supabaseSource).toContain("typeof window === 'undefined'")
    expect(supabaseSource).toMatch(/supabaseServer[\s\S]*:\s*supabase/)
    expect(userAuthSource).toContain('return createClient(url, anonKey, {')
    expect(userAuthSource).not.toContain('__schoolloveBrowserSupabaseClient')
  })
})
