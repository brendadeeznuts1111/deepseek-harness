# Agent Note: Bun 使用独立的 `ctx.bun` 能力 seam

Status: implemented

[English](2026-08-17-bun-capability-seam.md) | 中文

## 问题

产品 agent 已有两个看起来能挂 Bun 的执行面：`ctx.shell`（bash 或 pwsh）与 `ctx.codeRuntime`（Code Mode 的 Node worker）。把 Bun 挂到其中任一都会改变默认的 DeepSeek agent。`ctx.shell` 只接纳一个提供方；win32 层已经用该席位承载 pwsh，因此在那里放 Bun 执行器会挤掉 bash。`ctx.codeRuntime` 在 Node worker 中运行模型编写的 TypeScript 并支撑 `run_code`；教它使用 Bun 会改变 Code Mode。harness 启动路径（Node、pnpm、Vitest、tsx 源码启动）是第三个诱人的接入点，但与向模型提供 `bun` 工具无关。

## 决策

Bun 是 `packages/bun/` 下完整的可选能力 seam：

- **Service Definition** — `@deepseek-ai/dsh-bun` 拥有 `ctx.bun` 以及请求/spec 词汇（解析后的 `bun` 二进制之后的 `args`，不是 `bash -c`）。
- **Service Provider** — `@deepseek-ai/dsh-bun-local` 通过 `ctx.subprocess` spawn。缺少二进制会使插件加载失败。工作区不把 Bun 厂商化。
- **Consumer** — `@deepseek-ai/dsh-tool-bun` 注册面向模型的 `bun` 工具（`card: 'terminal'`），并把后台句柄适配进 `ctx.jobs`。

`dsh-base` 与 `dsh-web-app` 不挂载这些行。`bun` agent preset 复制 `standard`，并插入一个拥有 `ctx.bun` 的 isolate 组。`bun.overlay.yml` 是与 `local-access.overlay.yml` 分开的 `--patch`，不授予特权 `/api`。未选中时不存在 `ctx.bun`。默认 agent 保持 bash、文件系统、web 与 DeepSeek LLM 不变。

## 考虑过的替代方案

- **把 Bun 挂成 `ctx.shell` 提供方** — 否决，因为该席位只有一个提供方。pwsh 已在 Windows 上替换 bash；Bun 执行器会挤掉默认的 DeepSeek shell。
- **教 `ctx.codeRuntime` / `run_code` 发出 Bun** — 否决，因为 Code Mode 是给模型编写的 TypeScript 用的 Node worker 线程运行时，不是宿主二进制 argv 工具。
- **把 Bun 行加入 `dsh-base` 或 `dsh-web-app`** — 否决，因为默认产品 agent 必须在没有宿主 `bun` 二进制、也没有新的模型可见工具时继续工作。
- **把仓库的 `packageManager` / 测试运行器改成 Bun** — 否决；那是 harness 启动变更，不是产品 agent 能力。

## 后果

选择 Bun preset 或应用 `bun.overlay.yml` 会增加一个工具，并要求宿主上有可 spawn 的 `bun`（或 `bunPath`）。不要叠用这两条选择路径：每条都会注册 `tool-bun`。没有 Bun 的机器无法加载该组合。后续的 `bun-sandbox` 提供方可共用 `ctx.bun`，而无需改动 `ctx.shell` 或 Code Mode。特权 API overlay 仍是单独的 `--patch`。
