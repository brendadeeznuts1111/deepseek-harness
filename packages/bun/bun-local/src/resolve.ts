/**
 * Bun executable resolution. An explicit `bunPath` is trusted only after an
 * lstat probe; otherwise PATH is searched. A miss throws so the provider
 * cannot mount without a spawnable binary.
 * @module @deepseek-ai/dsh-bun-local/resolve
 */

import { lstatSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Whether a candidate can be spawned. lstat opens the entry itself instead of
 * following reparse points.
 * @param candidate - absolute or relative path to probe.
 * @returns true when the path is a file or a link-shaped reparse point.
 */
function candidateExists(candidate: string): boolean {
  try {
    const stat = lstatSync(candidate)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Search PATH for a `bun` executable.
 * @param env - the environment to probe; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns the first existing PATH entry, or undefined.
 */
export function findBunOnPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const exe = platform === 'win32' ? 'bun.exe' : 'bun'
  for (const entry of (env.PATH ?? '').split(delimiter)) {
    const trimmed = entry.trim().replace(/^"|"$/g, '')
    if (trimmed.length === 0) continue
    const candidate = join(trimmed, exe)
    if (candidateExists(candidate)) return candidate
  }
  return undefined
}

/**
 * Resolve the Bun executable this executor spawns.
 * @param configured - an explicit `bunPath` config value.
 * @param env - the environment to probe; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns a spawnable path.
 * @throws when neither the configured path nor PATH yields a spawnable file.
 */
export function resolveBunPath(
  configured?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (configured !== undefined && configured.length > 0) {
    if (!candidateExists(configured)) {
      throw new Error(`bun-local: bunPath ${configured} is not a spawnable file`)
    }
    return configured
  }
  const found = findBunOnPath(env, platform)
  if (found === undefined) {
    throw new Error('bun-local: bun executable not found on PATH; set bunPath')
  }
  return found
}
