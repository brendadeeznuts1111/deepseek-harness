# Bun 执行器

[English](bun.md) | 中文

Bun 执行 seam 拆分为 Service Definition（[dsh-bun](../../packages/bun/bun)，`ctx.bun`）、Service Provider（[dsh-bun-local](../../packages/bun/bun-local)）与 Consumer（[dsh-tool-bun](../../packages/bun/tool-bun)，`bun` schema）。通用后台任务 id、所有权与控制见 [jobs.md](jobs.md)；此 seam 返回无任务身份的进程句柄。原始进程组机制位于 [subprocess seam](subprocess.md) 之后。该家族是可选接入，不替换 [bash](shell.md) 或 [code-runtime](code-runtime.md)。

源：[`packages/bun/bun/src/types.ts`](../../packages/bun/bun/src/types.ts)

## 请求与 spec：`resolve()` 拆分

seam 把**面向调用方的请求**（可选的 `workdir`/`timeoutMs`/`stdoutMaxBytes`）与执行器实际使用的**完全解析 spec**（这些字段必填，外加 `bunPath`）分开。工具层在两者之间调用 `ctx.bun.resolve(request)`。

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

`args` 是解析后的 `bun` 二进制之后的 argv，不是 `bash -c` 字符串。`stdin`、普通 `env` 与 `dshEnv` 是受信任的进程内插件输入；面向模型的工具不把它们作为参数公开。

## 前台运行：`BunRunResult`

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

每个流都是 [subprocess seam](subprocess.md) 拥有、并由 `dsh-bun` 再导出的 `CollectedOutput`。

## 后台进程：`BunProcess`

`start()` 返回没有 id 或所有者的句柄。`dsh-tool-bun` 把它适配进 `ctx.jobs.start()` 钩子。

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

## 服务

`BunExecutor` 拥有 `resolve`、前台 `run` 与后台进程 `start`。`dsh-bun-local` 拥有 argv 默认值、超时/中止分类、终端环境和后台读取合并。`dsh-tool-bun` 拥有面向模型的渲染，并把后台句柄适配进[通用 job 运行时](jobs.md)。

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
