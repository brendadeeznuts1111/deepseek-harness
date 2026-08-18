# bun/ — Bun 能力家族

[English](README.md) | 中文

该能力家族涵盖 Bun 执行器 seam、其本地实现和面向模型的工具。这些全是**产品**包。该家族是**可选接入**：`dsh-base` 与 `dsh-web-app` 不会挂载它。宿主通过 `bun` agent preset 或 `--patch bun.overlay.yml` 加入这些行，二者择一，不要叠用：每条路径都会注册 `tool-bun`。

| 包 | 职责 | ctx key |
|---|---|---|
| [`bun/`](bun/README.md) | 定义 Service Provider 与 Consumer 共享的执行器约定。 | `ctx.bun` |
| [`bun-local/`](bun-local/README.md) | 通过本地 [`subprocess`](../subprocess/README.md) 服务执行 argv。 | （注册 `ctx.bun`） |
| [`tool-bun/`](tool-bun/README.md) | 向模型公开 Bun 调用和后台任务集成。 | （注册到 `ctx.tools`） |

此 seam 不替换 [`ctx.shell`](../shell/README.md) 或 [`ctx.codeRuntime`](../code-runtime/README.md)。见 [Bun 能力 seam Agent Note](../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.md)。

子系统参考见 [docs/subsystems/bun.md](../../docs/subsystems/bun.md)。
