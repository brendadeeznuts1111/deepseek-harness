/**
 * Service Definition for the `ctx.bun` capability seam: foreground Bun
 * invocations and background process handles. Job ids belong to
 * `@deepseek-ai/dsh-jobs`. This seam does not replace `ctx.shell` or
 * `ctx.codeRuntime`.
 * @module @deepseek-ai/dsh-bun
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { BunExecRequest, BunExecSpec, BunProcess, BunRunResult } from './types.ts'

/**
 * Settings namespace of this capability. A host composes at most one
 * provider of `ctx.bun`.
 */
export const BUN_SETTINGS_NAMESPACE = settingsNamespace('bun')

export { DSH_ENV_PREFIX } from './types.ts'
export type {
  BunExecRequest,
  BunExecSpec,
  BunProcess,
  BunProcessRead,
  BunProcessStatus,
  BunRunResult,
  CollectedOutput,
  DshEnvironment,
  DshEnvironmentKey,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    bun: BunExecutor
  }
}

/**
 * Abstract Bun execution service. Subclass, implement the abstract methods,
 * and load the subclass as a plugin — it registers as `ctx.bun`.
 *
 * Implementations must honor these semantics:
 * - {@link run} rejects only for infrastructure failures. Nonzero exits,
 *   timeout kills, and abort kills resolve with a {@link BunRunResult}.
 * - {@link start} returns immediately; no timeout applies to background
 *   processes. `done` settles at process close and never rejects.
 * - {@link BunProcess.readOutput} is incremental: consecutive reads never
 *   repeat output.
 */
export abstract class BunExecutor extends Service {
  constructor(ctx: Context) {
    super(ctx, 'bun')
  }

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
}

export default BunExecutor
