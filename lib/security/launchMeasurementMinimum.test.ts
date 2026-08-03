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

  it('keeps registration fail-closed before parsing or writing a request', () => {
    expect(profilesRoute).toContain('PROFILE_REGISTRATION_TEMPORARILY_DISABLED')
    expect(profilesRoute).toContain('status: 503')
    const guard = profilesRoute.indexOf('if (!isPublicProfileRegistrationEnabled')
    expect(guard).toBeGreaterThan(-1)
    for (const laterStep of [
      "request.headers.get('x-forwarded-for')",
      'await checkRateLimit(ip)',
      'await request.json()',
      'Schema.safeParse(body)',
      'await verifyCaptchaToken',
      'getSupabaseAdmin()',
      ".from('profiles')",
      '.insert({',
      'revalidateRegistrationContext({',
    ]) {
      expect(profilesRoute.indexOf(laterStep), laterStep).toBeGreaterThan(guard)
    }
  })

  it('preserves the secure registration implementation behind the hard lock', () => {
    expect(profilesRoute).toContain("Ratelimit.slidingWindow(20, '60 s')")
    expect(profilesRoute).toContain("prefix: 'schoollove:submit'")
    expect(profilesRoute).toContain("import { getSupabaseAdmin } from '@/lib/supabase'")
    expect(profilesRoute).toContain('const Schema = z.object({')
    expect(profilesRoute).toContain('captchaToken: z.string().trim().min(1).max(2048)')
    expect(profilesRoute).not.toContain("import { supabaseServer } from '@/lib/supabase'")
  })

  it('Upstash long-term analytics remains disabled on active public write limiters', () => {
    for (const route of [tracesRoute, reportsRoute]) {
      expect(route).not.toMatch(/analytics\s*:\s*true/)
    }
  })

  it('permanently closes trace/report writes before parsing, limiting, or database access', () => {
    expect(tracesRoute).toContain('LEGACY_TRACE_WRITE_PERMANENTLY_DISABLED')
    expect(reportsRoute).toContain('LEGACY_REPORT_WRITE_PERMANENTLY_DISABLED')
    for (const route of [tracesRoute, reportsRoute]) {
      expect(route).toContain('status: 503')
      expect(route).toContain("'Cache-Control': 'no-store'")
      expect(route).not.toMatch(/request\.json|Ratelimit|Redis|getSupabaseAdmin|supabaseServer|\.from\(|\.rpc\(/)
    }
  })

  it('renders Vercel Analytics exactly once without custom events', () => {
    expect(rootLayout).toContain("import { Analytics } from '@vercel/analytics/next'")
    expect(rootLayout.match(/<Analytics\s*\/>/g)).toHaveLength(1)
    expect(rootLayout).not.toMatch(/\btrack\s*\(/)
    expect(rootLayout).not.toMatch(/<Analytics\s+(?:debug|mode|beforeSend)=/)

    const analyticsFiles = tsxFiles(join(process.cwd(), 'app')).filter((file) =>
      readFileSync(file, 'utf8').includes('@vercel/analytics'),
    )
    expect(analyticsFiles).toEqual([join(process.cwd(), 'app/layout.tsx')])
  })

  it('preserves the root layout structure', () => {
    expect(rootLayout).toContain('export const metadata: Metadata')
    expect(rootLayout).toContain('<body className="antialiased">')
    expect(rootLayout).toContain('<Providers>')
    expect(rootLayout).toContain('{children}')
    expect(rootLayout).toContain('<Footer />')
    expect(rootLayout).toContain('<TabBar />')
  })
})
