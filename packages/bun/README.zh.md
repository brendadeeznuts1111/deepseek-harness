---
description: "Bun 能力系列：ctx.bun 执行器 seam、其本地 provider 与面向模型的 bun 工具；可选接入，由 bun preset 或 overlay 挂载。"
kind: "package-group"
---

# bun/ — Bun 能力家族

[English](README.md) | 中文

## 概述

Bun 能力系列涵盖 `ctx.bun` 执行器 seam、其本地 provider 与面向模型的 `bun` 工具。该系列为可选接入：`dsh-base` 与 `dsh-web-app` 都不挂载它；宿主通过 `bun` agent preset 或 `bun.overlay.yml` 添加相应行。它不替换 `ctx.shell` 或 `ctx.codeRuntime`。

## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`bun/`](bun/README.zh.md) | 定义 Service Provider 与 Consumer 共享的执行器契约。 | `ctx.bun` |
| [`bun-local/`](bun-local/README.zh.md) | 通过本地 [`subprocess`](../subprocess/README.zh.md) 服务执行 argv。 | （注册 `ctx.bun`） |
| [`tool-bun/`](tool-bun/README.zh.md) | 向模型暴露 Bun 调用与后台任务集成。 | （注册到 `ctx.tools`） |

子系统参考见 [docs/subsystems/bun.zh.md](../../docs/subsystems/bun.zh.md)，设计记录见 [Bun 能力缝 Agent Note](../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.zh.md)。

### 开发备注

Bun 系列刻意与 `shell` 平级而非替换关系：独立的 seam 让宿主无需改动生产 shell 路径即可选择性接入。
