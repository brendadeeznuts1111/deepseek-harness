# @deepseek-ai/dsh-bun

[English](README.md) | 中文

**`BunExecutor`**（`ctx.bun`）定义 Bun 后端做什么，即运行前台调用与启动后台进程，但不规定如何实现。job id、所有权、收集、取消与通知属于通用 `ctx.jobs` 运行时。

本包承担 Bun 能力的 Service Definition 角色：

| 包 | 职责 |
|---|---|
| `@deepseek-ai/dsh-bun`（本包） | Service Definition：抽象服务 + 词汇类型 |
| `@deepseek-ai/dsh-bun-local` | Service Provider：本地子进程 |
| `@deepseek-ai/dsh-tool-bun` | 基于 `ctx.bun`、面向模型的工具 schema |

该拆分是一个标准的能力 seam（[capability-seams Agent Note](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)）。后续的 `bun-sandbox` 提供方可共用此 Service Definition，方式与 `dsh-bash-sandbox` 共用 `dsh-shell` 相同。此 seam 不是 `ctx.shell`，也不是 `ctx.codeRuntime`（[原因](../../../.agents/notes/implemented/architecture/2026-08-17-bun-capability-seam.md)）。

## 服务 API（`ctx.bun`）

| 成员 | 语义 |
|---|---|
| `resolve(request)` | 用实现的配置填充并限制省略字段。 |
| `run(spec)` | 前台执行。进程结束后才 resolve。**仅基础设施失败会 reject**；非零退出、超时杀死与中止杀死以 `BunRunResult` resolve。 |
| `start(spec)` | 后台执行。立即返回无任务身份的 `BunProcess` 句柄；**不应用超时**。 |
| `BunProcess.readOutput()` | 增量读取输出——连续读取不会重复交付。 |
| `BunProcess.kill()` | 杀死进程组。若已结束则返回 `false`。 |

实现需继承 `BunExecutor` 并实现抽象方法。处置时必须杀死每个仍在运行的进程并等待其退出。

`BUN_SETTINGS_NAMESPACE`（`bun`）命名的是能力，而不是某个实现。一个宿主最多组合一个 `ctx.bun` 提供方。

## 词汇

`BunExecRequest`（`args`、workdir?、timeoutMs?、stdoutMaxBytes?、signal?、stdin?、env?、dshEnv?）在执行前解析为 `BunExecSpec`（上述字段加上必填的 `bunPath` / `workdir` / `timeoutMs` / `stdoutMaxBytes`）。`args` 是解析后的 `bun` 二进制之后的 argv，不是 shell 字符串。见 `src/types.ts` 与 [subsystems/bun.md](../../../docs/subsystems/bun.md)。

`dshEnv` 是 [subprocess seam](../../subprocess/README.md) 拥有的托管 `DSH_*` 覆盖层。面向模型的工具在已挂载 `ctx.shellEnv` 时通过它收集该快照。

## 模型体验

间接通过 `dsh-tool-bun`，它把执行器输出变成指引和保留的工具结果 token。

#### KV Cache 影响

无直接失效；由具名 Consumer 负责任何请求前缀变化。

## 已知限制与延后工作

- **本轮没有沙箱提供方** — 后续可用 `ctx.sandbox` 包装，方式与 `bash-sandbox` 相同。
- **没有交互输入词汇** — `stdin` 在 spawn 时写入一次后关闭。
- **前台超时由执行器拥有** — 调用方自有截止期限模式与 bash seam 一并延后。
