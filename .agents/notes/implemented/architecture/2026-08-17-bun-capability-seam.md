# Agent Note: Bun is its own `ctx.bun` capability seam

Status: implemented

English | [中文](2026-08-17-bun-capability-seam.zh.md)

## Problem

The product agent already has two execution surfaces that look like a home for Bun: `ctx.shell` (bash or pwsh) and `ctx.codeRuntime` (Code Mode's Node worker). Hanging Bun on either one would change the default DeepSeek agent. `ctx.shell` admits one provider; the win32 layer already uses that seat for pwsh, so a Bun executor there would evict bash. `ctx.codeRuntime` runs model-written TypeScript in a Node worker and backs `run_code`; teaching it Bun would change Code Mode. The harness boot path (Node, pnpm, Vitest, tsx source-launch) is a third tempting place to introduce Bun and is unrelated to giving the model a `bun` tool.

## Decision

Bun is a complete opt-in capability seam under `packages/bun/`:

- **Service Definition** — `@deepseek-ai/dsh-bun` owns `ctx.bun` and the request/spec vocabulary (`args` after the resolved `bun` binary, not `bash -c`).
- **Service Provider** — `@deepseek-ai/dsh-bun-local` spawns through `ctx.subprocess`. A missing binary fails the plugin load. The workspace does not vendor Bun.
- **Consumer** — `@deepseek-ai/dsh-tool-bun` registers the model-facing `bun` tool (`card: 'terminal'`) and adapts background handles into `ctx.jobs`.

`dsh-base` and `dsh-web-app` do not mount these rows. The `bun` agent preset copies `standard` and inserts an isolate group that owns `ctx.bun`. `bun.overlay.yml` is a separate `--patch` from `local-access.overlay.yml` and does not grant privileged `/api`. Unselected, `ctx.bun` does not exist. The default agent keeps bash, filesystem, web, and the DeepSeek LLM unchanged.

## Alternatives considered

- **Mount Bun as a `ctx.shell` provider** — rejected because that seat is one provider. pwsh already replaces bash on Windows; a Bun executor would evict the default DeepSeek shell.
- **Teach `ctx.codeRuntime` / `run_code` to emit Bun** — rejected because Code Mode is a Node worker-thread runtime for model-written TypeScript, not a host-binary argv tool.
- **Add Bun rows to `dsh-base` or `dsh-web-app`** — rejected because the default product agent must keep working without a host `bun` binary and without a new model-visible tool.
- **Switch the repository `packageManager` / test runner to Bun** — rejected; that is a harness-boot change, not a product-agent capability.

## Consequences

Selecting the Bun preset or applying `bun.overlay.yml` adds one tool and requires a spawnable host `bun` (or `bunPath`). Do not stack those two selection paths: each registers `tool-bun`. Machines without Bun cannot load that composition. A later `bun-sandbox` provider can share `ctx.bun` without touching `ctx.shell` or Code Mode. The privileged-API overlay stays a separate `--patch`.
