# @deepseek-ai/dsh-tool-bun

[English](README.md) | 中文

基于 `ctx.bun` 执行器 seam 注册的、面向模型的 `bun` 工具。前台执行留在该 seam 之后；后台进程句柄注册到通用 `ctx.jobs` 运行时，并通过 `@deepseek-ai/dsh-tool-jobs` 的 `job_output`、`job_list` 与 `job_kill` 控制。

需要已加载的执行器 Service Provider（例如 `@deepseek-ai/dsh-bun-local`）以及 [`@deepseek-ai/dsh-shell-env`](../../shell/shell-env/README.md) 注册表；在每个注入服务都存在之前插件保持挂起（`inject: ['tools', 'bun', 'systemPrompt', 'shellEnv']`）。

包根只暴露 Cordis 插件约定（`name`、`inject`、`Config`、`apply`）；结果渲染与后台进程适配留在包内部。

插件还贡献 `tool:bun` 提示词段落（顺序 106）：检查每条结果上的 `[exit code: N]` 标记，并把 `args` 作为列表而不是 shell 字符串传入。

## 工具

### `bun`

| 参数 | 类型 | 说明 |
|---|---|---|
| `args` | string[]（必填） | `bun` 可执行文件之后的 argv。不是 shell 字符串。典型值：`["--version"]`、`["run", "script.ts"]`。 |
| `description` | string（必填） | 一行主动语态摘要（5–10 个词），仅用于 UI/日志显示。 |
| `timeoutMs` | number | 以毫秒计的超时覆盖。执行器应用其配置的默认值与上限。 |
| `workdir` | string | 本次调用的工作目录。默认是 `session.header.cwd`。 |
| `run_in_background` | boolean | 立即返回 job id；不应用超时。 |

`args`、`workdir` 与 `timeoutMs` 在执行前通过 `ctx.bun.resolve()` 对照执行器配置默认值解析。每次模型调用都通过 `ctx.shellEnv` 收到一份新收集的受信任 `DSH_*` 环境。

结果文本包含 stdout、可选的 `[stderr]` 段，以及适用的超时、信号、退出码与截断标记。非零退出仍是模型解读的结果，而不是 `isError`。只有 spawn 错误与中止这类基础设施失败才产生 `isError`。

当 `run_in_background` 为 true 时，本插件把调用方 agent 登记为所有者，并把返回的 `BunProcess` 句柄适配为通用的取消/完成/增量输出钩子。`enableRunInBackground: false` 会移除该参数，并在执行时拒绝强制后台调用。

## UI 呈现

前台调用是携带 argv、描述、cwd、输出与解析后退出状态的终端卡片。后台启动是通用执行卡片，因为它只返回 job id。这些呈现器是纯函数且可重放。

## 模型体验

### 系统提示词

#### 模型看到什么

本插件注册范围内的每个请求都包含下面的 bun 指引。

##### Bun 指引

```markdown
Check the [exit code: N] marker on every bun result; investigate failures before moving on. Use `args` as a list, not a shell string.
```

#### Token 影响

插件处于活动状态时，每个请求有一小段固定输入成本。

#### KV Cache 影响

在注册范围与提示词文本不变时前缀稳定。

### 工具 schema

#### 模型看到什么

模型看到生成的 [`bun` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-bun)。仅当此生产者启用时才出现 `run_in_background`。

#### Token 影响

工具可见的每个请求都有固定 schema 成本。

#### KV Cache 影响

在可见性与后台支持不变时前缀稳定。

### 前台结果

#### 模型看到什么

渲染器先发出依赖数据的 stdout 尾部，然后是可选的 `[stderr]` 与 stderr 尾部。没有输出时恰好发出 `(no output)`。条件行恰好是 `[output truncated; full output: <path-or-(unavailable)>]`、`[timed out after <timeoutMs>ms]`、`[killed by signal: <signal>]` 与 `[exit code: <exitCode>]`。

#### Token 影响

调用前没有结果 token。输出按流有界。

#### KV Cache 影响

只追加；新可见内容跟在可复用请求前缀之后。

### 后台任务上下文与结果

#### 模型看到什么

启动恰好返回 `started background job <jobId>`。此生产者向通用 job 运行时提供增量进程输出与终态细节。[`dsh-tool-jobs`](../../jobs/tool-jobs/README.md) 拥有可见状态行。

#### Token 影响

启动确认短且被保留；收集的输出依赖数据且有界。

#### KV Cache 影响

只追加。

### 工具错误

#### 模型看到什么

校验与策略失败被规范为 `Error: <message>`。本包的稳定消息是 `invalid args: expected a non-empty list of non-empty strings`、`invalid description: expected a non-empty string`、`invalid timeoutMs: expected a positive number, got <value>`、`run_in_background is disabled for this deployment (enableRunInBackground: false)`、`background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs` 与 `tool call aborted`。

#### Token 影响

只有失败的那次调用会添加这些被保留的 token。

#### KV Cache 影响

只追加。

## 已知限制与延后工作

- **重放退出胶囊从结果文本解析** — 与 `dsh-tool-bash` 相同的残留。
- **没有沙箱升权字段** — 本轮没有沙箱执行器。
- **后台进程没有执行器超时** — 工作不再需要时调用方必须使用 `job_kill`。
