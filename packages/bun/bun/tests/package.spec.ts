import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BunExecutor, { BUN_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-bun'
import type { BunExecRequest, BunExecSpec, BunProcess, BunRunResult } from '@deepseek-ai/dsh-bun'

class FakeBun extends BunExecutor {
  resolve(request: BunExecRequest): BunExecSpec {
    return {
      args: request.args,
      bunPath: '/bin/bun',
      workdir: request.workdir ?? '/tmp',
      timeoutMs: request.timeoutMs ?? 1_000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
    }
  }

  async run(spec: BunExecSpec): Promise<BunRunResult> {
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: spec.timeoutMs,
      stdout: { text: spec.args.join(' '), truncated: false },
      stderr: { text: '', truncated: false },
    }
  }

  start(_spec: BunExecSpec): BunProcess {
    return {
      status: 'completed',
      exitCode: 0,
      signal: null,
      done: Promise.resolve(),
      readOutput: () => ({ delta: '', lossy: false }),
      kill: () => false,
    }
  }
}

describe('BunExecutor', () => {
  it('registers as ctx.bun and exposes the settings namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(FakeBun)
    expect(ctx.bun).toBeInstanceOf(FakeBun)
    expect(String(BUN_SETTINGS_NAMESPACE)).toBe('bun')
    const result = await ctx.bun.run(ctx.bun.resolve({ args: ['--version'] }))
    expect(result.stdout.text).toBe('--version')
    const handle = ctx.bun.start(ctx.bun.resolve({ args: ['test'] }))
    expect(handle.kill()).toBe(false)
    await ctx.fiber.dispose()
  })
})
