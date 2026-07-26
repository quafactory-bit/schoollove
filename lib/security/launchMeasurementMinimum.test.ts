import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function tsxFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) return tsxFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : []
  })
}

describe('launch measurement minimum privacy contracts', () => {
  const profilesRoute = source('app/api/profiles/route.ts')
  const tracesRoute = source('app/api/traces/route.ts')
  const reportsRoute = source('app/api/reports/route.ts')
  const rootLayout = source('app/layout.tsx')

  it('Upstash long-term analytics is disabled on every public write limiter', () => {
    for (const route of [profilesRoute, tracesRoute, reportsRoute]) {
      expect(route).not.toMatch(/analytics\s*:\s*true/)
    }
  })

  it('existing limiter windows, prefixes, and trace dedupe TTL remain unchanged', () => {
    expect(profilesRoute).toContain("Ratelimit.slidingWindow(20, '60 s')")
    expect(profilesRoute).toContain("prefix: 'schoollove:submit'")
    expect(tracesRoute).toContain("Ratelimit.slidingWindow(5, '60 s')")
    expect(tracesRoute).toContain("prefix: 'schoollove:trace'")
    expect(tracesRoute).toContain("{ ex: 600 }")
    expect(reportsRoute).toContain("const ACTOR_WINDOW = '60 s'")
    expect(reportsRoute).toContain("const TARGET_WINDOW = '600 s'")
    expect(reportsRoute).toContain("prefix: 'schoollove:reports:actor'")
    expect(reportsRoute).toContain("prefix: 'schoollove:reports:target'")
  })

  it('profiles route uses the server-only admin client for INSERT', () => {
    expect(profilesRoute).toContain("import { getSupabaseAdmin } from '@/lib/supabase'")
    expect(profilesRoute).toContain('admin = getSupabaseAdmin()')
    expect(profilesRoute).not.toContain("import { supabaseServer } from '@/lib/supabase'")
  })

  it('Vercel Analytics is imported and rendered exactly once in the root layout', () => {
    expect(rootLayout).toContain('import { Analytics } from "@vercel/analytics/next";')
    expect(rootLayout.match(/<Analytics\s*\/>/g)).toHaveLength(1)

    const analyticsFiles = tsxFiles(join(process.cwd(), 'app')).filter((file) =>
      readFileSync(file, 'utf8').includes('@vercel/analytics')
    )
    expect(analyticsFiles).toEqual([join(process.cwd(), 'app/layout.tsx')])
  })

  it('does not add custom analytics events or optional tracking configuration', () => {
    expect(rootLayout).not.toMatch(/\btrack\s*\(/)
    expect(rootLayout).not.toMatch(/<Analytics\s+(?:debug|mode|beforeSend)=/)
  })

  it('preserves the root metadata, body, providers, children, footer, and tab bar structure', () => {
    expect(rootLayout).toContain('export const metadata: Metadata')
    expect(rootLayout).toContain('<body className="antialiased">')
    expect(rootLayout).toContain('<Providers>')
    expect(rootLayout).toContain('{children}')
    expect(rootLayout).toContain('<Footer />')
    expect(rootLayout).toContain('<TabBar />')
  })
})
