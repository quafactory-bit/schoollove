import React from 'react'
import { readFileSync } from 'fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { claimAutoReload, clearAppCaches, isChunkLoadError, safeMatchMedia } from './clientRecovery'
import AppErrorRecovery from '@/components/AppErrorRecovery'

afterEach(() => { vi.unstubAllGlobals() })

describe('safeMatchMedia — 인앱 브라우저에서도 예외를 던지지 않는다', () => {
  it('matchMedia가 없으면 false', () => {
    vi.stubGlobal('window', {})
    expect(safeMatchMedia('(display-mode: standalone)')).toBe(false)
  })
  it('matchMedia가 예외를 던지면 false', () => {
    vi.stubGlobal('window', { matchMedia: () => { throw new Error('SecurityError') } })
    expect(safeMatchMedia('(display-mode: standalone)')).toBe(false)
  })
  it('정상 환경에서는 결과를 그대로 돌려준다', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(safeMatchMedia('(display-mode: standalone)')).toBe(true)
  })
})

describe('isChunkLoadError', () => {
  it('배포 직후 옛 청크 오류만 골라낸다', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 123 failed.' })).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /x.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('claimAutoReload — 무한 새로고침 방지', () => {
  it('1분 안에는 한 번만 허용한다', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } })
    expect(claimAutoReload(1_000_000)).toBe(true)
    expect(claimAutoReload(1_030_000)).toBe(false)
    expect(claimAutoReload(1_061_000)).toBe(true)
  })
  it('storage가 막히면 자동 새로고침하지 않는다', () => {
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('SecurityError') } })
    expect(claimAutoReload()).toBe(false)
  })
})

describe('clearAppCaches', () => {
  it('출석부 PWA 캐시와 서비스 워커만 지운다', async () => {
    const unregister = vi.fn().mockResolvedValue(true)
    const deleted: string[] = []
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) } })
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['schoollove-pwa-v2', 'other-cache']), delete: vi.fn(async (k: string) => { deleted.push(k); return true }) })
    await clearAppCaches()
    expect(unregister).toHaveBeenCalledOnce()
    expect(deleted).toEqual(['schoollove-pwa-v2'])
  })
  it('serviceWorker·caches가 예외를 던져도 끝까지 진행한다', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: () => Promise.reject(new Error('blocked')) } })
    vi.stubGlobal('caches', { keys: () => Promise.reject(new Error('blocked')) })
    await expect(clearAppCaches()).resolves.toBeUndefined()
  })
})

describe('오류 경계 — Next 기본 "Application error" 대신 복구 화면', () => {
  it('복구 버튼과 학교 찾기 링크를 보여 주고 오류 원문은 노출하지 않는다', () => {
    const html = renderToStaticMarkup(<AppErrorRecovery error={new Error('secret stack detail')} reset={() => undefined} />)
    expect(html).toContain('새로고침하고 홈으로 가기')
    expect(html).toContain('이 화면 다시 시도')
    expect(html).toContain('href="/search"')
    expect(html).not.toContain('secret stack detail')
  })
  it('라우트·전역 오류 경계 파일이 있고 전역 경계는 자체 html을 가진다', () => {
    expect(readFileSync('app/error.tsx', 'utf8')).toContain('AppErrorRecovery')
    const globalError = readFileSync('app/global-error.tsx', 'utf8')
    expect(globalError).toContain('<html lang="ko">')
    expect(globalError).toContain('AppErrorRecovery')
  })
})
