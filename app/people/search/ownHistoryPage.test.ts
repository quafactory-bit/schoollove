import type { ReactElement } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = { auth: vi.fn(), beta: vi.fn(), launch: vi.fn(), history: vi.fn(), redirect: vi.fn() }
// Run the actual server page with isolated dependencies; the repository Vitest config preserves JSX.
const dependencies: Record<string, unknown> = {
  'react/jsx-runtime': jsxRuntime,
  '@/lib/user-auth': { getAuthenticatedServerContext: mocks.auth },
  '@/lib/beta': { hasBetaFeatureAccess: mocks.beta },
  '@/lib/publicAccountLaunch': { hasPublicAccountAccessActive: mocks.launch },
  '@/lib/peopleDiscoveryHistory': { getOwnClassDiscoveryChoices: mocks.history },
  'next/navigation': { redirect: mocks.redirect },
  './PeopleSearchClient': { default: () => null },
}
const compiled = ts.transpileModule(readFileSync('app/people/search/page.tsx', 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const pageModule = {} as { default: () => Promise<ReactElement>; dynamic: string; metadata: { robots: unknown } }
new Function('require', 'exports', compiled)((id: string) => {
  if (!(id in dependencies)) throw new Error('Unexpected page dependency')
  return dependencies[id]
}, pageModule)
const { default: Page, dynamic, metadata } = pageModule
const auth = { client: {}, user: { id: 'owner-fixture' } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(auth); mocks.beta.mockResolvedValue(true); mocks.launch.mockResolvedValue(true)
  mocks.history.mockResolvedValue({ status: 'ok', choices: [] }); mocks.redirect.mockImplementation(path => { throw new Error(path) })
})
describe('private history page guards', () => {
  it('never reads history when unauthenticated', async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(Page()).rejects.toThrow('/login?next=/people/search')
    expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.beta).not.toHaveBeenCalled()
  })
  it.each(['beta', 'launch'] as const)('never reads history when %s denies access', async gate => {
    mocks[gate].mockResolvedValue(false)
    await expect(Page()).rejects.toThrow('/account')
    expect(mocks.history).not.toHaveBeenCalled()
  })
  it('passes only authenticated owner projection after every gate', async () => {
    const choices = [{ schoolId: 'safe-school', schoolName: '합성 학교', schoolType: 'high', region: null, graduationYear: 2016, gradeNumber: 3, classNumber: 1 }]
    mocks.history.mockResolvedValue({ status: 'ok', choices })
    const page = await Page()
    expect(mocks.beta).toHaveBeenCalledWith(auth.client, auth.user.id, 'people_search')
    expect(mocks.launch).toHaveBeenCalledWith(auth.client, auth.user.id)
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith(auth.client, auth.user.id)
    expect(page.props).toEqual({ historyChoices: choices, historyStatus: 'ok' })
    expect(mocks.launch.mock.invocationCallOrder[0]).toBeLessThan(mocks.history.mock.invocationCallOrder[0])
  })
  it('passes safe unavailable state so manual UI remains usable', async () => {
    mocks.history.mockResolvedValue({ status: 'unavailable', choices: [] })
    expect((await Page()).props).toEqual({ historyStatus: 'unavailable', historyChoices: [] })
  })
  it('keeps dynamic private metadata', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(metadata.robots).toEqual({ index: false, follow: false, nocache: true, noarchive: true })
  })
})
