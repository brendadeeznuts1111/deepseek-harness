# @deepseek-ai/dsh-bun

English | [中文](README.zh.md)

The **`BunExecutor`** (`ctx.bun`) defines WHAT a Bun backend does — run foreground invocations and start background processes — without saying HOW. Job ids, ownership, collection, cancellation, and notices belong to the generic `ctx.jobs` runtime.

This package owns the Service Definition role of the Bun capability:

| Package | Role |
|---|---|
| `@deepseek-ai/dsh-bun` (this) | Service Definition: abstract service + vocabulary types |
| `@deepseek-ai/dsh-bun-local` | Service Provider: local subprocesses |
| `@deepseek-ai/dsh-tool-bun` | the model-facing tool schema over `ctx.bun` |

The split is a standard capability seam ([capability-seams Agent Note](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)). A later `bun-sandbox` provider can share this Service Definition the way `dsh-bash-sandbox` shares `dsh-shell`. This seam is not `ctx.shell` and not `ctx.codeRuntime` ([why](../../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.md)).

## Service API (`ctx.bun`)

| Member | Semantics |
|---|---|
| `resolve(request)` | Fill and cap omitted fields from the implementation's config. |
| `run(spec)` | Foreground execution. Resolves when the process finishes. **Rejects only for infrastructure failures**; nonzero exits, timeout kills, and abort kills resolve with a `BunRunResult`. |
| `start(spec)` | Background execution. Returns a task-free `BunProcess` handle immediately; **no timeout applies**. |
| `BunProcess.readOutput()` | Incremental output read — consecutive reads never re-deliver. |
| `BunProcess.kill()` | Kill the process group. Returns `false` when it already finished. |

Implementations subclass `BunExecutor` and implement the abstract methods. Disposal must kill every running process and await its exit.

`BUN_SETTINGS_NAMESPACE` (`bun`) names the capability, not an implementation. A host composes at most one provider of `ctx.bun`.

## Vocabulary

`BunExecRequest` (`args`, workdir?, timeoutMs?, stdoutMaxBytes?, signal?, stdin?, env?, dshEnv?) resolves to `BunExecSpec` (those fields plus required `bunPath` / `workdir` / `timeoutMs` / `stdoutMaxBytes`) before execution. `args` is the argv after the resolved `bun` binary, not a shell string. See `src/types.ts` and [subsystems/bun.md](../../../docs/subsystems/bun.md).

`dshEnv` is the managed `DSH_*` overlay owned by the [subprocess seam](../../subprocess/README.md). The model-facing tool collects it through `ctx.shellEnv` when that service is mounted.

## Model Experience

Indirectly, through `dsh-tool-bun`, which turns executor output into guidance and retained tool-result tokens.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No sandbox provider in this cut** — confinement can wrap later using `ctx.sandbox` the way `bash-sandbox` does.
- **No interactive-input vocabulary** — `stdin` is written once at spawn and closed.
- **Foreground timeouts are executor-owned** — a caller-owned-deadline mode is deferred with the bash seam.
