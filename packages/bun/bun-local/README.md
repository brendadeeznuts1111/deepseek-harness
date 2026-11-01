# @deepseek-ai/dsh-bun-local

English | [中文](README.zh.md)

Local Service Provider for the `@deepseek-ai/dsh-bun` executor seam over the [`@deepseek-ai/dsh-subprocess`](../../subprocess/subprocess/README.md) service: `LocalBunExecutor` spawns `<bunPath> …args` per call as a managed process group through `ctx.subprocess`. Group mechanics (bounded spill-backed output, credential scrub, kill escalation, disposal) are the subprocess service's.

The package root exports the default and named `LocalBunExecutor` plugin plus its `Config`. A missing Bun binary **fails the plugin load**.

## Config

```yaml
- id: bun-local
  name: '@deepseek-ai/dsh-bun-local'
  config:
    bunPath: /usr/local/bin/bun  # optional; otherwise PATH is searched
    cwd: /path/to/workspace      # default: process.cwd()
    timeoutMs: 120000            # default foreground timeout
    maxTimeoutMs: 600000         # cap for per-call overrides
    maxOutputBytes: 64000        # per-stream in-memory cap; overflow spills to disk
    maxSpillBytes: 67108864      # per-stream full-output spill cap
    graceMs: 3000                # kill escalation and post-exit pipe-drain grace
```

## Behavior

- **Spawn per call, no Bun state** — every call is a fresh process; cwd and environment do not persist.
- **Fail-loud binary resolution** — an explicit `bunPath` must exist as a file or symlink; otherwise PATH is searched. A miss throws `bun-local: bun executable not found on PATH; set bunPath` at load (or at the next settings write that changes `bunPath`).
- **The composition entry is a layer** — when a settings provider is composed, this executor registers the capability's [`bun` namespace](../bun/README.md) with the entry above as its base.
- **Configured budgets over managed groups** — `resolve()` fills `workdir`/`timeoutMs`/`stdoutMaxBytes` from config. Empty `args` fails at `resolve()`.
- **Timeout and cancel classification** — `run()` fuses its config-clamped timeout with the caller's signal; only the executor's own timeout reports `timedOut` (`BUN_TIMEOUT`).
- **Model-friendly terminal env** — `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` merge as ordinary env under the service's credential scrub and `DSH_*` channel rules.
- **Background processes** — `start()` returns a live `BunProcess` handle immediately with no timeout. Job ids belong to [`ctx.jobs`](../../jobs/jobs/README.md).

This package does not vendor Bun into the workspace.

## Model Experience

Indirectly, through `dsh-tool-bun`, which renders this executor's bounded stdout/stderr tails, background-process deltas, spill-file paths, and infrastructure failures.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Unconfined by itself** — invocations run with the harness process's authority. A `bun-sandbox` provider is deferred.
- **Host Bun required** — the plugin will not load without a spawnable `bun` (or an explicit `bunPath`).
- **A background spawn-failure note is single-delivery** — the same residual as `dsh-bash-local`.
