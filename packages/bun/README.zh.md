---
description: "面向部署方与维护者的 Bun 能力家族说明，用于选择并组合 Bun 执行器 seam、其本地 Service Provider 与面向模型的 bun 工具。"
kind: "package-group"
---

# bun/ — Bun 能力家族

[English](README.md) | 中文

该能力家族涵盖 Bun 执行器 seam、其本地实现和面向模型的工具。这些全是**产品**包。该家族是**可选接入**：`dsh-base` 与 `dsh-web-app` 不会挂载它。宿主通过 `bun` agent preset 或 `--patch bun.overlay.yml` 加入这些行。

| 包 | 职责 | ctx key |
|---|---|---|
| [`bun/`](bun/README.zh.md) | 定义 Service Provider 与 Consumer 共享的执行器约定。 | `ctx.bun` |
| [`bun-local/`](bun-local/README.zh.md) | 通过本地 [`subprocess`](../subprocess/README.zh.md) 服务执行 argv。 | （注册 `ctx.bun`） |
| [`tool-bun/`](tool-bun/README.zh.md) | 向模型公开 Bun 调用和后台任务集成。 | （注册到 `ctx.tools`） |

此 seam 不替换 [`ctx.shell`](../shell/README.zh.md) 或 [`ctx.codeRuntime`](../code-runtime/README.zh.md)。见 [Bun 能力 seam Agent Note](../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.zh.md)。

子系统参考见 [docs/subsystems/bun.md](../../docs/subsystems/bun.zh.md)。
