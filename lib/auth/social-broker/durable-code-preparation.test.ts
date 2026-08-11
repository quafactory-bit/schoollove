import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'lib/auth/social-broker/durable-code.ts'), 'utf8')

describe('durable broker code server-only boundary', () => {
  it('keeps server-only as the first runtime import', () => {
    const runtimeImports = source.split(/\r?\n/).filter(line => line.startsWith('import '))
    expect(source).toContain("import 'server-only'")
    expect(runtimeImports[0]).toBe("import 'server-only'")
  })
})
