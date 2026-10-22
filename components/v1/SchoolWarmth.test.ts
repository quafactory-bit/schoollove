import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// v2-07: app/retroTypographyColorSystem.test.ts에서 컴포넌트와 함께 옮겨 온 v1 검사(실행 대상에서 제외).
const SCHOOL_WARMTH = readFileSync(join(__dirname, 'SchoolWarmth.tsx'), 'utf-8')

describe('v1 SchoolWarmth text color', () => {
  it('keeps school trace suggestions black', () => {
    expect(SCHOOL_WARMTH).toContain('text-sm text-schoollove-text bg-gray-50')
    expect(SCHOOL_WARMTH).not.toContain('text-sm text-gray-700 bg-gray-50')
  })
})
