import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { BunExecutor } from '@deepseek-ai/dsh-bun'
import type { BunExecRequest, BunExecSpec, BunProcess, BunRunResult } from '@deepseek-ai/dsh-bun'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import * as ToolTasks from '@deepseek-ai/dsh-tool-jobs'
import { LocalBunExecutor } from '@deepseek-ai/dsh-bun-local'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as ToolBun from '@deepseek-ai/dsh-tool-bun'
import * as BashEnvPlugin from '@deepseek-ai/dsh-shell-env'
import { processOutcome } from '../src/background.ts'
import { parseExitStatus, renderProcessRead, renderResult } from '../src/render.ts'

const testToolSignal = new AbortController().signal
const spillDir = mkdtempSync(join(tmpdir(), 'dsh-tool-bun-spec-'))
const stub = fileURLToPath(new URL('../../bun-local/tests/fixtures/bun-stub.mjs', import.meta.url))

async function setup(options: { background?: boolean; jobs?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  if (options.jobs !== false) {
    await ctx.plugin(LocalJobRegistry)
    await ctx.plugin(ToolTasks)
  }
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  await ctx.plugin(BashEnvPlugin)
  await ctx.plugin(LocalBunExecutor, { bunPath: process.execPath, timeoutMs: 10_000, graceMs: 200 })
  await ctx.plugin(ToolBun, { enableRunInBackground: options.background ?? true })
  return ctx
}

function registerFakeAgent(ctx: Context, sessionId: string): Agent {
  const scopeFiber = ctx.plugin(() => {})
  const agent = {
    id: sessionId,
    ctx: scopeFiber.ctx,
    session: { id: sessionId, header: { version: 0, id: sessionId, createdAt: 0, cwd: tmpdir() } },
  } as unknown as Agent
  ctx.agents.register(agent)
  return agent
}

let callCounter = 0
function call(ctx: Context, args: unknown, agent?: Agent) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: 'bun',
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

class FakeBun extends BunExecutor {
  last?: BunExecSpec
  result: BunRunResult = {
    exitCode: 0,
    signal: null,
    timedOut: false,
    aborted: false,
    timeoutMs: 1_000,
    stdout: { text: 'ok\n', truncated: false },
    stderr: { text: '', truncated: false },
  }

  resolve(request: BunExecRequest): BunExecSpec {
    return {
      args: request.args,
      bunPath: '/bin/bun',
      workdir: request.workdir ?? '/tmp',
      timeoutMs: request.timeoutMs ?? 1_000,
      stdoutMaxBytes: 64_000,
      ...request.signal ? { signal: request.signal } : {},
    }
  }

  async run(spec: BunExecSpec): Promise<BunRunResult> {
    this.last = spec
    return this.result
  }

  start(spec: BunExecSpec): BunProcess {
    this.last = spec
    return {
      status: 'completed',
      exitCode: 0,
      signal: null,
      done: Promise.resolve(),
      readOutput: () => ({ delta: 'bg\n', lossy: false }),
      kill: () => false,
    }
  }
}

describe('tool-bun', () => {
  it('runs bun args through the local executor and presents a terminal card', async () => {
    const ctx = await setup({ jobs: false })
    const result = await call(ctx, { args: [stub, '--version'], description: 'Print bun version' })
    expect(result.isError).toBe(false)
    expect(text(result)).toBe('1.2.3\n')
    const schema = ctx.tools.schemas().find(tool => tool.name === 'bun')
    expect(schema?.description).toContain('Invoke the host `bun` executable')
    const view = ctx.tools.get('bun')?.presentCall?.({
      args: [stub, '--version'],
      description: 'Print bun version',
    })
    expect(view).toMatchObject({ card: 'terminal', description: 'Print bun version' })
    const done = ctx.tools.get('bun')?.presentResult?.(
      { args: [stub, '--version'], description: 'Print bun version' },
      result,
    )
    expect(done).toMatchObject({ card: 'terminal', output: '1.2.3\n' })
    await ctx.fiber.dispose()
  })

  it('rejects invalid args and a disabled background call', async () => {
    const ctx = await setup({ background: false, jobs: false })
    await expect(call(ctx, { args: [], description: 'noop' })).resolves.toMatchObject({ isError: true })
    await expect(call(ctx, { args: ['  '], description: 'noop' })).resolves.toMatchObject({ isError: true })
    await expect(call(ctx, { args: ['--version'], description: '   ' })).resolves.toMatchObject({ isError: true })
    await expect(call(ctx, { args: ['--version'], description: 'Print version', timeoutMs: 0 }))
      .resolves.toMatchObject({ isError: true })
    const background = await call(ctx, {
      args: [stub, '--version'],
      description: 'Print version',
      run_in_background: true,
    })
    expect(background.isError).toBe(true)
    expect(text(background)).toMatch(/enableRunInBackground/)
    await ctx.fiber.dispose()
  })

  it('starts a background job and resolves a relative workdir from the session', async () => {
    const ctx = await setup()
    const agent = registerFakeAgent(ctx, 'bun-agent')
    const started = await call(ctx, {
      args: [stub, '--version'],
      description: 'Print version',
      run_in_background: true,
      workdir: '.',
    }, agent)
    expect(started.isError).toBe(false)
    expect(text(started)).toMatch(/^started background job /)
    const bgView = ctx.tools.get('bun')?.presentCall?.({
      args: [stub, '--version'],
      description: 'Print version',
      run_in_background: true,
    })
    expect(bgView).toMatchObject({ card: 'generic', kind: 'execute' })
    await ctx.fiber.dispose()
  })

  it('throws when background is requested without a jobs service', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(BashEnvPlugin)
    await ctx.plugin(FakeBun)
    await ctx.plugin(ToolBun)
    const result = await call(ctx, {
      args: ['--version'],
      description: 'Print version',
      run_in_background: true,
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/background jobs unavailable/)
    await ctx.fiber.dispose()
  })

  it('maps abort to isError and presents error cards', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(BashEnvPlugin)
    await ctx.plugin(FakeBun)
    ;(ctx.bun as FakeBun).result = {
      exitCode: null,
      signal: null,
      timedOut: false,
      aborted: true,
      timeoutMs: 1_000,
      stdout: { text: '', truncated: false },
      stderr: { text: '', truncated: false },
    }
    await ctx.plugin(ToolBun)
    const result = await call(ctx, { args: ['--version'], description: 'Print version' })
    expect(result.isError).toBe(true)
    expect(ctx.tools.get('bun')?.presentResult?.(
      { args: ['--version'], description: 'Print version' },
      result,
    )?.card).toBe('generic')
    expect(ctx.tools.get('bun')?.presentResult?.(
      { args: ['--version'], description: 'Print version' },
      { content: [{ type: 'reasoning', text: 'x' }], isError: false },
    )).toBeUndefined()
    expect(ctx.tools.get('bun')?.presentResult?.(
      { args: ['--version'], description: 'Print version' },
      { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], isError: false },
    )).toBeUndefined()
    expect(ctx.tools.get('bun')?.presentCall?.({
      args: ['--version'],
      description: 'Print version',
      workdir: '/tmp',
    })).toMatchObject({ card: 'terminal', cwd: '/tmp' })
    await ctx.fiber.dispose()
  })

  it('resolves an absolute workdir, starts without an owner, and aborts a background call', async () => {
    const ctx = await setup()
    const agent = registerFakeAgent(ctx, 'bun-abs')
    const absolute = await call(ctx, {
      args: [stub, '--version'],
      description: 'Print version',
      workdir: tmpdir(),
    }, agent)
    expect(absolute.isError).toBe(false)
    const background = await call(ctx, {
      args: [stub, '--version'],
      description: 'Print version',
      run_in_background: true,
    })
    expect(background.isError).toBe(false)
    const aborted = new AbortController()
    aborted.abort()
    const blocked = await ctx.tools.execute({
      signal: aborted.signal,
      callId: CallId(`call-${++callCounter}`),
      name: 'bun',
      arguments: { args: [stub, '--version'], description: 'Print version', run_in_background: true },
    })
    expect(blocked.isError).toBe(true)
    const running = await call(ctx, {
      args: [stub, '--sleep=60'],
      description: 'Sleep in background',
      run_in_background: true,
    })
    const jobId = text(running).match(/started background job (\S+)/)?.[1]
    expect(jobId).toBeDefined()
    await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId(`call-${++callCounter}`),
      name: 'job_output',
      arguments: { job_id: jobId },
    })
    const killed = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId(`call-${++callCounter}`),
      name: 'job_kill',
      arguments: { job_id: jobId },
    })
    expect(killed.isError).toBe(false)
    await ctx.fiber.dispose()
  })

  it('retains a spill path on a truncated foreground result', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    await ctx.plugin(BashEnvPlugin)
    await ctx.plugin(LocalBunExecutor, {
      bunPath: process.execPath,
      timeoutMs: 10_000,
      graceMs: 200,
      maxOutputBytes: 8,
    })
    await ctx.plugin(ToolBun)
    const result = await call(ctx, { args: [stub, '--repeat=80'], description: 'Repeat output' })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('output truncated')
    await ctx.fiber.dispose()
  })

  it('defaults background support when apply receives no config', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(BashEnvPlugin)
    await ctx.plugin(FakeBun)
    ToolBun.apply(ctx)
    const schema = ctx.tools.schemas().find(tool => tool.name === 'bun')
    expect(JSON.stringify(schema?.parameters)).toContain('run_in_background')
    const timed = await call(ctx, { args: ['--version'], description: 'Print version', timeoutMs: 50 })
    expect(timed.isError).toBe(false)
    await ctx.fiber.dispose()
  })
})

describe('tool-bun render helpers', () => {
  it('renders markers, exit pills, and lossy background reads', () => {
    expect(renderResult({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: 1,
      stdout: { text: '', truncated: false },
      stderr: { text: '', truncated: false },
    })).toBe('(no output)')
    expect(renderResult({
      exitCode: 2,
      signal: null,
      timedOut: true,
      aborted: false,
      timeoutMs: 50,
      stdout: { text: 'out', truncated: true, spillPath: '/tmp/out' },
      stderr: { text: 'err', truncated: true },
    })).toContain('[timed out after 50ms]')
    expect(parseExitStatus('body\n[exit code: 3]')).toEqual({ body: 'body', exitCode: 3 })
    expect(parseExitStatus('body\n[killed by signal: SIGTERM]')).toEqual({ body: 'body', signal: 'SIGTERM' })
    expect(parseExitStatus('clean')).toEqual({ body: 'clean' })
    expect(renderProcessRead({ delta: '', lossy: true })).toContain('output truncated')
    expect(renderProcessRead({ delta: 'x', lossy: true, stdoutSpillPath: '/s', stderrSpillPath: '/e' }))
      .toContain('/s')
    expect(renderProcessRead({ delta: 'x\n', lossy: true })).toContain('output truncated')
    expect(renderProcessRead({ delta: 'ok', lossy: false })).toBe('ok')
    expect(processOutcome({
      status: 'killed',
      exitCode: null,
      signal: 'SIGTERM',
      done: Promise.resolve(),
      readOutput: () => ({ delta: '', lossy: false }),
      kill: () => false,
    }).detail).toBe('signal: SIGTERM')
    expect(processOutcome({
      status: 'killed',
      exitCode: null,
      signal: null,
      done: Promise.resolve(),
      readOutput: () => ({ delta: '', lossy: false }),
      kill: () => false,
    }).detail).toBe('killed before exit')
    expect(processOutcome({
      status: 'completed',
      exitCode: 0,
      signal: null,
      done: Promise.resolve(),
      readOutput: () => ({ delta: '', lossy: false }),
      kill: () => false,
    }).detail).toBe('exit code: 0')
    expect(processOutcome({
      status: 'completed',
      exitCode: null,
      signal: null,
      done: Promise.resolve(),
      readOutput: () => ({ delta: '', lossy: false }),
      kill: () => false,
    }).detail).toBe('exit code: 0')
    expect(renderResult({
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: false,
      aborted: false,
      timeoutMs: 1,
      stdout: { text: 'out', truncated: false },
      stderr: { text: 'err', truncated: false },
    })).toContain('[killed by signal: SIGTERM]')
    expect(renderResult({
      exitCode: 2,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: 1,
      stdout: { text: 'out\n', truncated: false },
      stderr: { text: 'err', truncated: false },
    })).toBe('out\n[stderr]\nerr\n[exit code: 2]')
    expect(renderResult({
      exitCode: 2,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: 1,
      stdout: { text: 'out\n', truncated: false },
      stderr: { text: '', truncated: false },
    })).toBe('out\n[exit code: 2]')
  })
})
