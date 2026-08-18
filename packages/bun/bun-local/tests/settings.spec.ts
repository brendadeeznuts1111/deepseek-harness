import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { BUN_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-bun'
import { LocalBunExecutor } from '@deepseek-ai/dsh-bun-local'

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

describe('bun settings section', () => {
  it('layers a user timeout over the composition entry and refuses an unusable write', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(LocalBunExecutor, { bunPath: process.execPath, timeoutMs: 60_000 })
    const bun = ctx.bun as LocalBunExecutor
    expect(bun.config.timeoutMs).toBe(60_000)
    await ctx.settings.update(BUN_SETTINGS_NAMESPACE, { timeoutMs: 5_000, bunPath: process.execPath })
    expect(bun.config.timeoutMs).toBe(5_000)
    await expect(ctx.settings.update(BUN_SETTINGS_NAMESPACE, { timeoutMs: 0 }))
      .rejects.toThrow(/positive finite/)
    expect(bun.config.timeoutMs).toBe(5_000)

    const other = join(mkdtempSync(join(tmpdir(), 'dsh-bun-settings-')), 'bun-other')
    writeFileSync(other, '')
    await ctx.settings.update(BUN_SETTINGS_NAMESPACE, { bunPath: other, timeoutMs: 5_000 })
    expect(bun.resolve({ args: ['--version'] }).bunPath).toBe(other)
    await expect(ctx.settings.update(BUN_SETTINGS_NAMESPACE, { bunPath: '/no/such/dsh-bun-binary' }))
      .rejects.toThrow(/not a spawnable file/)
    expect(bun.resolve({ args: ['--version'] }).bunPath).toBe(other)
    await ctx.fiber.dispose()
  })
})
