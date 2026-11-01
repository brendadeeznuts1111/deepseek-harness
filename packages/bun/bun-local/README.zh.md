# @deepseek-ai/dsh-bun-local

[English](README.md) | 中文

`@deepseek-ai/dsh-bun` 执行器 seam 的本地 Service Provider，建立在 [`@deepseek-ai/dsh-subprocess`](../../subprocess/subprocess/README.md) 服务之上：`LocalBunExecutor` 通过 `ctx.subprocess` 把每次调用 spawn 为受管进程组 `<bunPath> …args`。组机制（有界 spill 输出、凭据擦除、杀死升级、处置）属于 subprocess 服务。

包根导出默认与具名的 `LocalBunExecutor` 插件及其 `Config`。缺少 Bun 二进制会**使插件加载失败**。

## 配置

```yaml
- id: bun-local
  name: '@deepseek-ai/dsh-bun-local'
  config:
    bunPath: /usr/local/bin/bun  # optional; otherwise PATH is searched
    cwd: /path/to/workspace      # default: process.cwd()
    timeoutMs: 120000            # default foreground timeout
    maxTimeoutMs: 600000         # cap for per-call overrides
    maxOutputBytes: 64000        # per-stream in-memory cap; overflow spills to disk
    maxSpillBytes: 67108864      # per-stream full-output spill cap
    graceMs: 3000                # kill escalation and post-exit pipe-drain grace
```

## 行为

- **每次调用单独 spawn，无 Bun 状态** — 每次都是新进程；cwd 与环境不跨调用保留。
- **二进制解析失败即响** — 显式 `bunPath` 必须是文件或符号链接；否则搜索 PATH。未找到时在加载时（或下次更改 `bunPath` 的设置写入时）抛出 `bun-local: bun executable not found on PATH; set bunPath`。
- **组合条目是一层** — 当组合了设置提供方时，此执行器用上面的条目作为基线注册能力的 [`bun` 命名空间](../bun/README.md)。
- **受管组上的已配置预算** — `resolve()` 从配置填充 `workdir`/`timeoutMs`/`stdoutMaxBytes`。空 `args` 在 `resolve()` 失败。
- **超时与取消分类** — `run()` 把配置钳制的超时与调用方 signal 融合；只有执行器自己的超时报告 `timedOut`（`BUN_TIMEOUT`）。
- **对模型友好的终端环境** — `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` 作为普通 env 合并，并遵守服务的凭据擦除与 `DSH_*` 通道规则。
- **后台进程** — `start()` 立即返回存活的 `BunProcess` 句柄且无超时。job id 属于 [`ctx.jobs`](../../jobs/jobs/README.md)。

本包不把 Bun 厂商化进工作区。

## 模型体验

间接通过 `dsh-tool-bun`，它渲染此执行器的有界 stdout/stderr 尾部、后台进程增量、spill 文件路径和基础设施失败。

#### KV Cache 影响

无直接失效；由具名 Consumer 负责任何请求前缀变化。

## 已知限制与延后工作

- **自身不受限** — 调用以 harness 进程的权限运行。`bun-sandbox` 提供方延后。
- **需要宿主 Bun** — 没有可 spawn 的 `bun`（或显式 `bunPath`）时插件不会加载。
- **后台 spawn 失败备注只交付一次** — 与 `dsh-bash-local` 相同的残留。
