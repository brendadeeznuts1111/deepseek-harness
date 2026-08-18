/**
 * Execution types for the Bun executor seam. Background job semantics belong
 * to `@deepseek-ai/dsh-jobs`; this seam exposes only process handles.
 * @module dsh-bun/types
 */

import type { CollectedOutput, DshEnvironment } from '@deepseek-ai/dsh-subprocess'

export { DSH_ENV_PREFIX } from '@deepseek-ai/dsh-subprocess'
export type { CollectedOutput, DshEnvironment, DshEnvironmentKey } from '@deepseek-ai/dsh-subprocess'

/**
 * A caller's Bun execution REQUEST: `args` is the argv after the resolved
 * `bun` binary. `workdir` and `timeoutMs` are optional and filled by
 * {@link BunExecutor.resolve} from the implementation's config.
 */
export interface BunExecRequest {
  /** Arguments passed to the resolved `bun` executable; must be non-empty after resolve. */
  args: readonly string[]
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the process when it fires. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries, merged after the credential scrub.
   * Managed facts belong in {@link dshEnv}.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot; merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
}

/**
 * A resolved Bun execution spec. {@link BunExecutor.resolve} fills and caps
 * the required fields; {@link BunExecutor.start} ignores `timeoutMs`.
 */
export interface BunExecSpec {
  args: readonly string[]
  bunPath: string
  workdir: string
  timeoutMs: number
  stdoutMaxBytes: number
  signal?: AbortSignal | undefined
  stdin?: string | undefined
  env?: Record<string, string> | undefined
  dshEnv?: DshEnvironment | undefined
}

/** The outcome of one completed (or killed) foreground Bun run. */
export interface BunRunResult {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal; null on normal exit. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the first cause to cut the run
   * short. Mutually exclusive with {@link aborted}.
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the first cause to kill the run.
   * Mutually exclusive with {@link timedOut}.
   */
  aborted: boolean
  /** The effective timeout applied to this run. */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
}

/** Lifecycle of a background Bun process. */
export type BunProcessStatus = 'running' | 'completed' | 'killed'

/** One incremental {@link BunProcess.readOutput} read. */
export interface BunProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  stdoutSpillPath?: string
  stderrSpillPath?: string
}

/**
 * A background process handle returned by {@link BunExecutor.start}.
 * Composition teardown (the subprocess service's disposal) kills running
 * processes and awaits {@link done}.
 */
export interface BunProcess {
  status: BunProcessStatus
  exitCode: number | null
  signal: NodeJS.Signals | null
  /** Resolves when the process closes; spawn failure settles as `killed`. */
  readonly done: Promise<void>
  readOutput(): BunProcessRead
  /** Kill the process group. Returns false when it had already finished. */
  kill(): boolean
}
