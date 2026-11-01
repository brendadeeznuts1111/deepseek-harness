import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { LocalBunExecutor } from '@deepseek-ai/dsh-bun-local'

/**
 * Under the profile-entry settings model a form edit rewrites the plugin's
 * profile entry and reloads it, so the contract this package must keep is:
 * a valid entry yields its config, and an unusable entry is refused before the
 * provider is used. The former live-update hook no longer exists.
 */
describe('bun settings section', () => {
  it('exposes the entry config and refuses an unusable composition entry', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalBunExecutor, { bunPath: process.execPath, timeoutMs: 60_000 })
    const bun = ctx.bun as LocalBunExecutor
    expect(bun.config.timeoutMs).toBe(60_000)
    await ctx.fiber.dispose()
    const bad = new Context()
    await bad.plugin(LocalSubprocessRuntime)
    await expect(bad.plugin(LocalBunExecutor, { bunPath: process.execPath, timeoutMs: 0 }))
      .rejects.toThrow(/positive finite/)
    await bad.fiber.dispose()
  })
})
