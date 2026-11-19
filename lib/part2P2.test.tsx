import React from 'react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import TrustBadge, { TRUST_BADGE_TEXT } from '@/components/part2/TrustBadge'

const ONBOARDING = readFileSync(join(__dirname, '../app/onboarding/OnboardingClient.tsx'), 'utf8')
const HOME = readFileSync(join(__dirname, '../app/page.tsx'), 'utf8')

describe('Part 2 P2 trust badge', () => {
  it('uses the operator wording: 1인 개인사업자, no shop or business type', () => {
    expect(TRUST_BADGE_TEXT).toContain('1인 개인사업자')
    expect(TRUST_BADGE_TEXT).toContain('무광고')
    expect(TRUST_BADGE_TEXT).not.toMatch(/떡볶이|매장|가게|식당/)
    expect(renderToStaticMarkup(<TrustBadge />)).toContain(TRUST_BADGE_TEXT)
  })
  it('is placed on home (top for social visits, lower otherwise) and on the signup screen', () => {
    expect(HOME).toContain('<TopTrustBadge />')
    expect(HOME).toContain('<TrustBadge className="mt-6" />')
    expect(ONBOARDING).toContain('<TopTrustBadge />')
    expect(ONBOARDING).toContain('<TrustBadge className="mt-5" />')
  })
})

describe('Part 2 P2 signup continuation', () => {
  it('continues school and graduation year from the logged-out chalkboard without sending initials', () => {
    expect(ONBOARDING).toContain('readChalkboardDraft()')
    expect(ONBOARDING).toContain('intent?.slug ?? draft?.slug')
    expect(ONBOARDING).toContain('if (pendingYear >= min && pendingYear <= max) setGraduationYear(String(pendingYear))')
    // initials/note are only displayed, never part of a request body
    expect(ONBOARDING).not.toMatch(/JSON\.stringify\([^)]*chalkboard/)
    expect(ONBOARDING).not.toMatch(/initials[^\n]*fetch\(|fetch\([^\n]*initials/)
  })
})
