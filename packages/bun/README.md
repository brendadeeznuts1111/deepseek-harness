---
description: "The Bun capability family: the ctx.bun executor seam, its local provider, and the model-facing bun tool; opt-in, mounted by the bun preset or overlay."
kind: "package-group"
---

# bun/ — Bun capability family

English | [中文](README.zh.md)

## Summary

The Bun capability family spans the `ctx.bun` executor seam, its local provider, and the model-facing `bun` tool. The family is opt-in: `dsh-base` and `dsh-web-app` do not mount it; a host adds the rows through the `bun` agent preset or `bun.overlay.yml`. It does not replace `ctx.shell` or `ctx.codeRuntime`.

## Packages

| Package | Role | ctx key |
|---|---|---|
| [`bun/`](bun/README.md) | Defines the executor contract shared by Service Providers and Consumers. | `ctx.bun` |
| [`bun-local/`](bun-local/README.md) | Executes argv through the local [`subprocess`](../subprocess/README.md) service. | (registers `ctx.bun`) |
| [`tool-bun/`](tool-bun/README.md) | Exposes Bun invocation and background-job integration to the model. | (registers on `ctx.tools`) |

The subsystem reference is [docs/subsystems/bun.md](../../docs/subsystems/bun.md), and the design record is [the Bun capability-seam Agent Note](../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.md).

### Dev Note

The Bun family is deliberately a peer of `shell`, not a replacement: keeping the seam separate lets a host opt in without changing the production shell path.
