# @deepseek-ai/dsh-tool-bun

English | [中文](README.zh.md)

The model-facing `bun` tool registered over the `ctx.bun` executor seam. Foreground execution stays behind that seam; a background process handle is registered with the generic `ctx.jobs` runtime and controlled through `job_output`, `job_list`, and `job_kill` from `@deepseek-ai/dsh-tool-jobs`.

Requires a loaded executor Service Provider (e.g. `@deepseek-ai/dsh-bun-local`) and the [`@deepseek-ai/dsh-shell-env`](../../shell/shell-env/README.md) registry; the plugin stays pending until every injected service exists (`inject: ['tools', 'bun', 'systemPrompt', 'shellEnv']`).

The package root exposes only the Cordis plugin contract (`name`, `inject`, `Config`, `apply`); result rendering and background-process adaptation remain package-internal.

The plugin also contributes the `tool:bun` prompt section (order 106): check the `[exit code: N]` marker on every result and pass `args` as a list, not a shell string.

## Tools

### `bun`

| Arg | Type | Notes |
|---|---|---|
| `args` | string[] (required) | Argv after the `bun` executable. Not a shell string. Typical values: `["--version"]`, `["run", "script.ts"]`. |
| `description` | string (required) | One-line, active-voice summary (5-10 words), for UI/log display only. |
| `timeoutMs` | number | Timeout override in milliseconds. The executor applies its configured default and cap. |
| `workdir` | string | Working directory for this call. Defaults to `session.header.cwd`. |
| `run_in_background` | boolean | Return a job id immediately; no timeout applies. |

`args`, `workdir`, and `timeoutMs` are resolved against the executor's config defaults via `ctx.bun.resolve()` before execution. Every model call receives a freshly collected trusted `DSH_*` environment through `ctx.shellEnv`.

Result text contains stdout, an optional `[stderr]` section, then applicable timeout, signal, exit-code, and truncation markers. Nonzero exit remains a model-interpreted result rather than `isError`. Only infrastructure failures such as spawn errors and aborts produce `isError`.

When `run_in_background` is true, this plugin registers the calling agent as owner and adapts the returned `BunProcess` handle into generic cancel/done/incremental-output hooks. `enableRunInBackground: false` removes the parameter and rejects a forced background call at execution time.

## UI presentation

A foreground call is a terminal card carrying argv, description, cwd, output, and parsed exit status. A background start is a generic execute card because it returns only a job id. These presenters are pure and replay-safe.

## Model Experience

### System prompt

#### What the model sees

Every request in this plugin's registration scope contains the bun guidance below.

##### Bun guidance

```markdown
Check the [exit code: N] marker on every bun result; investigate failures before moving on. Use `args` as a list, not a shell string.
```

#### Token effect

Small fixed input cost per request while the plugin is active.

#### KV Cache effect

Prefix-stable while the registration scope and prompt text are unchanged.

### Tool schemas

#### What the model sees

The model sees the generated [`bun` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-bun). `run_in_background` appears only when this producer enables it.

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while visibility and background support are unchanged.

### Foreground result

#### What the model sees

The renderer emits the data-dependent stdout tail, then optional `[stderr]` and the stderr tail. With no output it emits exactly `(no output)`. Conditional lines are exactly `[output truncated; full output: <path-or-(unavailable)>]`, `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]`, and `[exit code: <exitCode>]`.

#### Token effect

Zero result tokens before a call. Output is bounded per stream.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix.

### Background job context and results

#### What the model sees

Start returns exactly `started background job <jobId>`. This producer supplies incremental process output and terminal detail to the generic job runtime. [`dsh-tool-jobs`](../../jobs/tool-jobs/README.md) owns the visible status line.

#### Token effect

The start acknowledgement is small and retained; collected output is data-dependent and bounded.

#### KV Cache effect

Append-only.

### Tool errors

#### What the model sees

Validation and policy failures are normalized as `Error: <message>`. This package's stable messages are `invalid args: expected a non-empty list of non-empty strings`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `run_in_background is disabled for this deployment (enableRunInBackground: false)`, `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`, and `tool call aborted`.

#### Token effect

Only the failing call adds these retained tokens.

#### KV Cache effect

Append-only.

## Known Limitations and Deferred Work

- **Replay exit pills parse from result text** — the same residual as `dsh-tool-bash`.
- **No sandbox escalation fields** — this cut has no sandboxing executor.
- **Background processes have no executor timeout** — callers must use `job_kill` when work no longer matters.
