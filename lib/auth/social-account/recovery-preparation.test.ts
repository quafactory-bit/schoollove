import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'lib/auth/social-account/recovery-preparation.ts'), 'utf8')

describe('recovery preparation server-only boundary', () => {
  it('keeps server-only as its first runtime import', () => {
    const runtimeImports = source
      .split(/\r?\n/)
      .filter(line => line.startsWith('import '))
    expect(source).toContain("import 'server-only'")
    expect(runtimeImports[0]).toBe("import 'server-only'")
  })
})
