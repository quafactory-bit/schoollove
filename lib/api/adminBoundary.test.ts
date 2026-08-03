import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// PHASE 7A ADMIN MUTATION AUTHORITY PATCH — service-role 사용 함수가 실수로 client
// component 번들에 섞여 들어가지 않는지, 공개 제출 route가 service role을 쓰지 않는지
// 정적 소스 검사로 확인한다. 이 저장소는 RTL/jsdom을 쓰지 않으므로(app/page.test.ts와
// 동일한 관례) 실제 번들 출력이 아니라 소스 텍스트 검사로 대신한다.

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      files.push(...listFilesRecursive(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

describe('lib/api/admin.ts — client component에서 값(런타임)으로 import되지 않는다', () => {
  const adminMutationExports = [
    'hideProfile',
    'unhideProfile',
    'markRequestAsDone',
    'markRequestAsPending',
    'applyProfileInstagramEdit',
    'deleteProfileCompletely',
    'getRecentRequests',
    'getAdminProfiles',
    'getDashboardStats',
    'getEditRequestDetail',
  ]

  const clientComponentFiles = [
    ...listFilesRecursive(join(process.cwd(), 'components')),
    ...listFilesRecursive(join(process.cwd(), 'app', 'admin', '_components')),
    ...listFilesRecursive(join(process.cwd(), 'app', 'admin', 'profiles', '_components')),
  ].filter((path) => readFileSync(path, 'utf-8').startsWith("'use client'"))

  it('검사 대상 client component 파일이 실제로 존재한다(전제 조건 확인)', () => {
    expect(clientComponentFiles.length).toBeGreaterThan(0)
  })

  it('어떤 client component도 lib/api/admin의 함수(값)를 런타임 import하지 않는다', () => {
    const importRegex = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@\/lib\/api\/admin['"]/g

    for (const filePath of clientComponentFiles) {
      const source = readFileSync(filePath, 'utf-8')
      let match: RegExpExecArray | null
      while ((match = importRegex.exec(source))) {
        const isTypeOnlyImport = Boolean(match[1])
        if (isTypeOnlyImport) continue // `import type { ... }`는 컴파일 시 완전히 제거되어 안전하다.

        const importedNames = match[2].split(',').map((s) => s.trim().replace(/^type\s+/, ''))
        for (const exportName of adminMutationExports) {
          expect(
            importedNames.includes(exportName),
            `${filePath}가 admin mutation 함수 '${exportName}'를 값으로 import함`
          ).toBe(false)
        }
      }
      importRegex.lastIndex = 0
    }
  })
})

describe('app/api/reports/route.ts — 공개 제출 route는 service role을 사용하지 않는다', () => {
  const source = readSource('app/api/reports/route.ts')

  it('getSupabaseAdmin을 import하지 않는다', () => {
    expect(source).not.toMatch(/getSupabaseAdmin/)
  })

  it('legacy report route는 요청 파싱이나 DB client 없이 고정 503 경계를 반환한다', () => {
    expect(source).not.toMatch(/supabaseServer|@\/lib\/supabase|\.from\(|\.rpc\(/)
    expect(source).toContain('LEGACY_REPORT_WRITE_PERMANENTLY_DISABLED')
    expect(source).toContain('status: 503')
  })
})

describe('service role key 문자열이 client component 소스에 없다', () => {
  const clientComponentFiles = [
    ...listFilesRecursive(join(process.cwd(), 'components')),
    ...listFilesRecursive(join(process.cwd(), 'app')),
  ].filter((path) => readFileSync(path, 'utf-8').startsWith("'use client'"))

  it('SUPABASE_SERVICE_ROLE_KEY 문자열을 참조하는 client component가 없다', () => {
    for (const filePath of clientComponentFiles) {
      const source = readFileSync(filePath, 'utf-8')
      expect(source, filePath).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    }
  })

  it('getSupabaseAdmin을 호출하는 client component가 없다', () => {
    for (const filePath of clientComponentFiles) {
      const source = readFileSync(filePath, 'utf-8')
      expect(source, filePath).not.toMatch(/getSupabaseAdmin/)
    }
  })
})
