import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true }
  if (specifier.startsWith('./') && !specifier.match(/\.[cm]?[jt]sx?$/)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL)
    if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
