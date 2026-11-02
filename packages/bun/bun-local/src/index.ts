/**
 * Local Service Provider for the Bun capability seam over `ctx.subprocess`.
 * Public invocations run as `<bunPath> …args` in a managed process group.
 * @module @deepseek-ai/dsh-bun-local
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUN_SETTINGS_NAMESPACE, BunExecutor } from '@deepseek-ai/dsh-bun'
import type { BunExecRequest, BunExecSpec, BunProcess, BunProcessRead, BunRunResult, CollectedOutput } from '@deepseek-ai/dsh-bun'
import type { SubprocessCollect, SubprocessHandle, SubprocessOutputReader, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import { clampTimeout, deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { resolveBunPath } from './resolve.ts'

export { findBunOnPath, resolveBunPath } from './resolve.ts'

/** Model-friendly environment overrides; a caller env entry still wins. */
export const ENV_OVERRIDES = {
  NO_COLOR: '1',
  TERM: 'dumb',
  PAGER: 'cat',
  GIT_PAGER: 'cat',
} as const

const DEFAULT_GRACE_MS = 3_000
const DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024

/** Plugin config (all optional — `static Config` supplies the defaults). */
export interface Config {
  /** Explicit Bun executable; otherwise PATH is searched and a miss fails the load. */
  bunPath?: string
  /** Default working directory for invocations (default: process.cwd()). */
  cwd?: string
  /** Default foreground timeout in milliseconds. */
  timeoutMs?: number
  /** Upper bound for per-call timeout overrides. */
  maxTimeoutMs?: number
  /** Per-stream in-memory output cap; overflow spills to a temp file. */
  maxOutputBytes?: number
  /** Per-stream spill-file cap. */
  maxSpillBytes?: number
  /** Grace period for kill escalation; at most `MAX_TIMER_DELAY_MS`. */
  graceMs?: number
}

type ResolvedConfig = Required<Omit<Config, 'cwd' | 'bunPath'>> & Pick<Config, 'cwd' | 'bunPath'>

function finalOutput(reader: SubprocessOutputReader): CollectedOutput {
  const read = reader.readFrom(0)
  return {
    text: read.text,
    truncated: read.lossy,
    ...read.spillPath !== undefined ? { spillPath: read.spillPath } : {},
  }
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`bun-local: ${name} must be a positive finite number`)
  }
}

/**
 * Reject a resolved section this executor could not run with.
 * @param config - the resolved section, schema-valid by construction.
 * @throws Error naming the field that cannot be used.
 */
export function assertServiceableBunConfig(config: Config): void {
  const resolved = config as ResolvedConfig
  assertPositiveFinite('timeoutMs', resolved.timeoutMs)
  assertPositiveFinite('maxTimeoutMs', resolved.maxTimeoutMs)
  assertPositiveFinite('maxOutputBytes', resolved.maxOutputBytes)
  assertPositiveFinite('maxSpillBytes', resolved.maxSpillBytes)
  assertPositiveFinite('graceMs', resolved.graceMs)
  if (resolved.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`bun-local: graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

/**
 * Local Bun executor over `ctx.subprocess`. Missing `bun` fails the plugin
 * load. Bounded output and process-group kills are the subprocess service's.
 */
export class LocalBunExecutor extends BunExecutor {
  static inject = ['subprocess']

  static Config: z<Config> = z.object({
    bunPath: z.string(),
    cwd: z.string(),
    timeoutMs: z.number().default(120_000),
    maxTimeoutMs: z.number().default(600_000),
    maxOutputBytes: z.number().default(64_000),
    maxSpillBytes: z.number().default(DEFAULT_MAX_SPILL_BYTES),
    graceMs: z.number().default(DEFAULT_GRACE_MS),
  })

  private source: () => ResolvedConfig
  private resolvedBunPath: string

  /** Validated config (schemastery applied the defaults before construction). */
  get config(): ResolvedConfig {
    return this.source()
  }

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const entry = config as ResolvedConfig
    assertServiceableBunConfig(entry)
    this.resolvedBunPath = resolveBunPath(entry.bunPath)
    this.source = () => entry
    installSettingsSection(ctx, BUN_SETTINGS_NAMESPACE, LocalBunExecutor.Config, entry, {
      validate: assertServiceableBunConfig,
      setSource: (current) => {
        this.source = current as () => ResolvedConfig
        this.resolvedBunPath = resolveBunPath(this.config.bunPath)
      },
      onChange: () => {},
    })
  }

  /**
   * Resolve a request into a fully-specified spec.
   * @param request - caller request; empty `args` fails here.
   * @returns the spec for {@link run}/{@link start}.
   */
  resolve(request: BunExecRequest): BunExecSpec {
    if (request.args.length === 0) {
      throw new Error('bun-local: request.args must contain at least one argument')
    }
    const timeoutMs = clampTimeout(
      request.timeoutMs,
      this.config.timeoutMs,
      this.config.maxTimeoutMs,
      'bun-local: request.timeoutMs',
    )
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes
    assertPositiveFinite('request.stdoutMaxBytes', stdoutMaxBytes)
    return {
      args: request.args,
      bunPath: this.resolvedBunPath,
      workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
      timeoutMs,
      stdoutMaxBytes,
      ...request.signal ? { signal: request.signal } : {},
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      ...request.env !== undefined ? { env: request.env } : {},
      ...request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {},
    }
  }

  private spawnSpec(
    spec: BunExecSpec,
    stdoutMaxBytes: number,
    signal: AbortSignal | undefined,
  ): SubprocessSpawnSpec {
    const collect = (maxBytes: number): SubprocessCollect =>
      ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes } })
    return {
      argv: [spec.bunPath, ...spec.args],
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== undefined ? { data: spec.stdin } : 'ignore',
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes),
      },
      graceMs: this.config.graceMs,
      signal,
      env: { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv },
    }
  }

  private static collected(handle: SubprocessHandle): { stdout: SubprocessOutputReader; stderr: SubprocessOutputReader } {
    const { stdout, stderr } = handle.collected
    /* v8 ignore start -- collect dispositions expose both readers by the seam contract; defensive. */
    if (stdout === undefined || stderr === undefined) {
      throw new Error('bun-local: subprocess implementation dropped a requested collect stream')
    }
    /* v8 ignore stop */
    return { stdout, stderr }
  }

  async run(spec: BunExecSpec): Promise<BunRunResult> {
    using d = deadline(spec.signal, spec.timeoutMs, 'BUN_TIMEOUT')
    const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, spec.stdoutMaxBytes, d.signal))
    const outcome = await handle.done
    const collected = LocalBunExecutor.collected(handle)
    const timedOut = timeoutOf(d.signal, 'BUN_TIMEOUT') !== undefined
    const aborted = d.signal.aborted && !timedOut
    return {
      ...outcome,
      timedOut,
      aborted,
      timeoutMs: spec.timeoutMs,
      stdout: finalOutput(collected.stdout),
      stderr: finalOutput(collected.stderr),
    }
  }

  start(spec: BunExecSpec): BunProcess {
    const running = this.ctx.subprocess.spawn(this.spawnSpec(spec, this.config.maxOutputBytes, spec.signal))
    const collected = LocalBunExecutor.collected(running)
    let spawnFailureNote: string | undefined
    const consumeSpawnFailure = (): string => {
      const note = spawnFailureNote ?? ''
      spawnFailureNote = undefined
      return note
    }
    let stdoutOffset = 0
    let stderrOffset = 0
    const proc: BunProcess = {
      status: 'running',
      exitCode: null,
      signal: null,
      done: running.done.then((outcome) => {
        if (proc.status === 'running') {
          proc.status = spec.signal?.aborted === true || outcome.signal !== null ? 'killed' : 'completed'
        }
        proc.exitCode = outcome.exitCode
        proc.signal = outcome.signal
      }, (error: unknown) => {
        proc.status = 'killed'
        spawnFailureNote = `spawn failed: ${String(error)}`
      }),
      readOutput: (): BunProcessRead => {
        const out = collected.stdout.readFrom(stdoutOffset)
        const err = collected.stderr.readFrom(stderrOffset)
        stdoutOffset = out.nextOffset
        stderrOffset = err.nextOffset
        const errText = err.text.length > 0 ? err.text : consumeSpawnFailure()
        const separator = out.text.length > 0 && !out.text.endsWith('\n') ? '\n' : ''
        const delta = out.text
          + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : '')
        return {
          delta,
          lossy: out.lossy || err.lossy,
          ...out.spillPath !== undefined ? { stdoutSpillPath: out.spillPath } : {},
          ...err.spillPath !== undefined ? { stderrSpillPath: err.spillPath } : {},
        }
      },
      kill: (): boolean => {
        if (proc.status !== 'running') return false
        proc.status = 'killed'
        running.terminate()
        return true
      },
    }
    return proc
  }
}

export default LocalBunExecutor
