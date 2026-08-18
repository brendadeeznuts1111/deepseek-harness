import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalBunExecutor } from '@deepseek-ai/dsh-bun-local'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { BunProcess } from '@deepseek-ai/dsh-bun'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-bun-exec-spec-'))
const stub = fileURLToPath(new URL('./fixtures/bun-stub.mjs', import.meta.url))

async function setup(config: ConstructorParameters<typeof LocalBunExecutor>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  await ctx.plugin(LocalBunExecutor, { bunPath: process.execPath, graceMs: 200, ...config })
  return { ctx, bun: ctx.bun as LocalBunExecutor }
}

async function readUntil(proc: BunProcess, expected: string, timeoutMs = 5_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let all = ''
  while (Date.now() < deadline) {
    all += proc.readOutput().delta
    if (all.includes(expected)) return all
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`process output did not include ${JSON.stringify(expected)}; accumulated ${JSON.stringify(all)}`)
}

describe('LocalBunExecutor', () => {
  it('fails the load when bunPath is missing', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await expect(ctx.plugin(LocalBunExecutor, { bunPath: '/no/such/dsh-bun-binary' }))
      .rejects.toThrow(/not a spawnable file/)
  })

  it('loads from PATH when bunPath is omitted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-bun-empty-config-'))
    const stubName = process.platform === 'win32' ? 'bun.exe' : 'bun'
    writeFileSync(join(dir, stubName), '')
    const previousPath = process.env.PATH
    process.env.PATH = previousPath === undefined || previousPath.length === 0
      ? dir
      : `${dir}${delimiter}${previousPath}`
    const ctx = new Context()
    try {
      await ctx.plugin(LocalSubprocessRuntime)
      await ctx.plugin(LocalBunExecutor)
      expect(ctx.bun.resolve({ args: ['--version'] }).bunPath).toBe(join(dir, stubName))
    } finally {
      await ctx.fiber.dispose()
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
    }
  })

  it('rejects unusable numeric config', async () => {
    await expect(setup({ timeoutMs: Number.NaN })).rejects.toThrow(/timeoutMs/)
    await expect(setup({ maxTimeoutMs: 0 })).rejects.toThrow(/maxTimeoutMs/)
    await expect(setup({ maxOutputBytes: -1 })).rejects.toThrow(/maxOutputBytes/)
    await expect(setup({ maxSpillBytes: 0 })).rejects.toThrow(/maxSpillBytes/)
    await expect(setup({ graceMs: 0 })).rejects.toThrow(/graceMs/)
    await expect(setup({ graceMs: MAX_TIMER_DELAY_MS + 1 }))
      .rejects.toThrow(`graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)
  })

  it('resolves args onto bunPath and runs the stub', async () => {
    const { bun } = await setup({ timeoutMs: 5_000 })
    expect(() => bun.resolve({ args: [] })).toThrow(/at least one argument/)
    expect(() => bun.resolve({ args: ['--version'], timeoutMs: Number.NaN })).toThrow(/request\.timeoutMs/)
    expect(() => bun.resolve({ args: ['--version'], stdoutMaxBytes: -1 })).toThrow(/request\.stdoutMaxBytes/)
    const spec = bun.resolve({ args: [stub, '--version'], timeoutMs: 999_999 })
    expect(spec.bunPath).toBe(process.execPath)
    expect(spec.timeoutMs).toBe(600_000)
    const result = await bun.run(spec)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toBe('1.2.3\n')
    expect(result.timedOut).toBe(false)
    expect(result.aborted).toBe(false)
  })

  it('uses config cwd, threads stdin/env/dshEnv, and honors abort', async () => {
    const { bun } = await setup({ cwd: tmpdir() })
    const spec = bun.resolve({
      args: [stub, '--echo-env'],
      stdin: 'piped\n',
      env: { SEAM_VAR: 'env-ok' },
      dshEnv: { DSH_SEAM_VAR: 'dsh-ok' },
    })
    expect(spec.workdir).toBe(tmpdir())
    const result = await bun.run(spec)
    expect(result.stdout.text).toContain('piped')
    expect(result.stdout.text).toContain('env-ok')
    expect(result.stdout.text).toContain('dsh-ok')

    const controller = new AbortController()
    const pending = bun.run(bun.resolve({ args: [stub, '--sleep=60'], signal: controller.signal }))
    setTimeout(() => { controller.abort() }, 50)
    const aborted = await pending
    expect(aborted.aborted).toBe(true)
    expect(aborted.timedOut).toBe(false)
  })

  it('times out a long stub and starts a background process', async () => {
    const { bun } = await setup({ timeoutMs: 60_000 })
    const timed = await bun.run(bun.resolve({ args: [stub, '--sleep=60'], timeoutMs: 100 }))
    expect(timed.timedOut).toBe(true)
    expect(timed.aborted).toBe(false)

    const proc = bun.start(bun.resolve({ args: [stub, '--version'] }))
    const delta = await readUntil(proc, '1.2.3')
    expect(delta).toContain('1.2.3')
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.kill()).toBe(false)
  })

  it('kills a background process and reports a spawn failure through readOutput', async () => {
    const { bun } = await setup()
    const proc = bun.start(bun.resolve({ args: [stub, '--sleep=60'] }))
    expect(proc.kill()).toBe(true)
    await proc.done
    expect(proc.status).toBe('killed')

    const missing = bun.start(bun.resolve({ args: [stub, '--version'], workdir: '/nonexistent-dsh-bun' }))
    await missing.done
    expect(missing.status).toBe('killed')
    expect(missing.readOutput().delta).toMatch(/spawn failed/)
  })

  it('raises foreground stdout only and defaults cwd to process.cwd()', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-bun-cwd-'))
    writeFileSync(join(dir, 'marker'), 'ok')
    const { bun } = await setup({ maxOutputBytes: 20 })
    expect(bun.resolve({ args: [stub, '--version'] }).workdir).toBe(process.cwd())
    expect(bun.resolve({ args: [stub, '--version'] }).stdoutMaxBytes).toBe(20)
    const result = await bun.run(bun.resolve({
      args: [stub, '--repeat=80'],
      stdoutMaxBytes: 80,
    }))
    expect(result.stdout.truncated).toBe(false)
    expect(result.stdout.text.length).toBe(80)
  })

  it('spills truncated streams and merges background stdout/stderr', async () => {
    const { bun } = await setup({ maxOutputBytes: 8, maxSpillBytes: 64 * 1024 })
    const truncated = await bun.run(bun.resolve({ args: [stub, '--repeat=80'] }))
    expect(truncated.stdout.truncated).toBe(true)
    expect(truncated.stdout.spillPath).toBeDefined()

    const proc = bun.start(bun.resolve({
      args: ['-e', "process.stdout.write('out'); process.stderr.write('err')"],
    }))
    await proc.done
    const read = proc.readOutput()
    expect(read.delta).toContain('out')
    expect(read.delta).toContain('[stderr]')
    expect(read.delta).toContain('err')

    const spilled = bun.start(bun.resolve({ args: [stub, '--repeat=80'] }))
    await spilled.done
    const spilledRead = spilled.readOutput()
    expect(spilledRead.lossy).toBe(true)
    expect(spilledRead.stdoutSpillPath).toBeDefined()

    const errSpill = bun.start(bun.resolve({
      args: ['-e', "process.stderr.write('e'.repeat(80))"],
    }))
    await errSpill.done
    expect(errSpill.readOutput().stderrSpillPath).toBeDefined()
  })

  it('marks a background process killed when its abort signal fires', async () => {
    const { bun } = await setup()
    const controller = new AbortController()
    const proc = bun.start(bun.resolve({ args: [stub, '--sleep=60'], signal: controller.signal }))
    controller.abort()
    await proc.done
    expect(proc.status).toBe('killed')
  })
})
