# bun/ — Bun capability family

English | [中文](README.zh.md)

The capability family spans the Bun executor seam, its local implementation, and the model-facing tool. All are **product** packages. The family is **opt-in**: `dsh-base` and `dsh-web-app` do not mount it. A host adds the rows through the `bun` agent preset or `--patch bun.overlay.yml`, not both: each path registers `tool-bun`.

| Package | Role | ctx key |
|---|---|---|
| [`bun/`](bun/README.md) | Defines the executor contract shared by Service Providers and Consumers. | `ctx.bun` |
| [`bun-local/`](bun-local/README.md) | Executes argv through the local [`subprocess`](../subprocess/README.md) service. | (registers `ctx.bun`) |
| [`tool-bun/`](tool-bun/README.md) | Exposes Bun invocation and background-job integration to the model. | (registers on `ctx.tools`) |

This seam does not replace [`ctx.shell`](../shell/README.md) or [`ctx.codeRuntime`](../code-runtime/README.md). See [the Bun capability-seam Agent Note](../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.md).

The subsystem reference is [docs/subsystems/bun.md](../../docs/subsystems/bun.md).
