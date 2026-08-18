# Bun Executor

English | [中文](bun.zh.md)

The Bun execution seam is split across a Service Definition ([dsh-bun](../../packages/bun/bun), `ctx.bun`), Service Provider ([dsh-bun-local](../../packages/bun/bun-local)), and Consumer ([dsh-tool-bun](../../packages/bun/tool-bun), the `bun` schema). Generic background-job ids, ownership, and controls live in [jobs.md](jobs.md); this seam returns a task-free process handle. Raw process-group mechanics live behind the [subprocess seam](subprocess.md). The family is opt-in and does not replace [bash](shell.md) or [code-runtime](code-runtime.md).

Source: [`packages/bun/bun/src/types.ts`](../../packages/bun/bun/src/types.ts)

## Request vs. spec: the `resolve()` split

The seam separates the **caller-facing request** (optional `workdir`/`timeoutMs`/`stdoutMaxBytes`) from the **fully-resolved spec** the executor acts on (those fields required, plus `bunPath`). The tool layer calls `ctx.bun.resolve(request)` between them.

```ts type-equiv
/**
 * A caller's Bun execution REQUEST: `args` is the argv after the resolved
 * `bun` binary. `workdir` and `timeoutMs` are optional and filled by
 * {@link BunExecutor.resolve} from the implementation's config.
 */
interface BunExecRequest {
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
```

```ts type-equiv
/**
 * A resolved Bun execution spec. {@link BunExecutor.resolve} fills and caps
 * the required fields; {@link BunExecutor.start} ignores `timeoutMs`.
 */
interface BunExecSpec {
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
```

`args` is argv after the resolved `bun` binary, not a `bash -c` string. `stdin`, ordinary `env`, and `dshEnv` are trusted in-process plugin inputs; the model-facing tool exposes none of them as parameters.

## Foreground runs: `BunRunResult`

```ts type-equiv
/** The outcome of one completed (or killed) foreground Bun run. */
interface BunRunResult {
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
```

Each stream is a `CollectedOutput` owned by the [subprocess seam](subprocess.md) and re-exported by `dsh-bun`.

## Background processes: `BunProcess`

`start()` returns a handle with no id or owner. `dsh-tool-bun` adapts it into `ctx.jobs.start()` hooks.

```ts type-equiv
/**
 * A background process handle returned by {@link BunExecutor.start}.
 * Composition teardown (the subprocess service's disposal) kills running
 * processes and awaits {@link done}.
 */
interface BunProcess {
  status: BunProcessStatus
  exitCode: number | null
  signal: NodeJS.Signals | null
  /** Resolves when the process closes; spawn failure settles as `killed`. */
  readonly done: Promise<void>
  readOutput(): BunProcessRead
  /** Kill the process group. Returns false when it had already finished. */
  kill(): boolean
}
```

```ts type-equiv
/** One incremental {@link BunProcess.readOutput} read. */
interface BunProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  stdoutSpillPath?: string
  stderrSpillPath?: string
}
```

## The service

`BunExecutor` owns `resolve`, foreground `run`, and background-process `start`. `dsh-bun-local` owns argv defaulting, timeout/abort classification, the terminal environment, and the background read merge. `dsh-tool-bun` owns model-facing rendering and adapts background handles into the [generic job runtime](jobs.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbun--bunexecutor-abstract-seam"></a>

### `ctx.bun` — `BunExecutor` (abstract seam)

Abstract Bun execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.bun`.

Implementations must honor these semantics:

- run rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a BunRunResult.
- start returns immediately; no timeout applies to background processes. `done` settles at process close and never rejects.
- BunProcess.readOutput is incremental: consecutive reads never repeat output.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link run}/{@link start}.
 */
abstract resolve(request: BunExecRequest): BunExecSpec

/**
 * Run Bun in the foreground; resolves when it finishes.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the outcome; nonzero exits, timeout kills, and abort kills
 *   resolve with a descriptive result rather than reject.
 */
abstract run(spec: BunExecSpec): Promise<BunRunResult>

/**
 * Start a background Bun process and return its handle immediately.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the live process handle (reads, kill, quiescence promise).
 */
abstract start(spec: BunExecSpec): BunProcess
```

Source: [`packages/bun/bun/src/index.ts:50`](../../packages/bun/bun/src/index.ts)
<!-- END GENERATED cordis-surface -->
