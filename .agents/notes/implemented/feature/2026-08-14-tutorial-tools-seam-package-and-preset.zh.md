# Agent Note：将教程工具落地为 weather 能力缝包与 preset

Status: implemented

[English](2026-08-14-tutorial-tools-seam-package-and-preset.md) | 中文

## 问题

Cordis 教程收官工具（`greet` + `weather`）以松散插件文件的形式存在于一个受版本控制的 examples 叶节点中，并通过绝对路径 overlay 加载。天气模拟把可调参数写死在代码里，两个工具都没有声明 UI 渲染意图，产品中也没有任何可安装、可在 Web UI 中看到的形态。

## 决策

**一个包拥有这条能力缝。** `@deepseek-ai/dsh-tutorial-tools`（位于 `packages/examples/tutorial-tools`）容纳 `ctx.weather` Service Definition（默认导出 `WeatherService`）、两个 provider（确定性的 `weather-local`、基于全局 `fetch` 的实时 `weather-web`）和两个消费方（`tool-weather`、`tool-greet`）。Provider 继承 `WeatherService` 并注册为 `ctx.weather`；消费方注入该服务键。`weather-web` 尊重调用方取消与每次请求的超时，并在基础设施故障时大声失败；`tool-greet` 把天气视为可选的点缀，provider 故障绝不会拖垮问候本身。两个工具都声明了 `presentCall`/`presentResult`/`presentationMeta` 渲染意图，并手写检查 schema DSL 无法表达的约束（非空地点、非空天气描述、有限数值）。

**配置经过 schema 校验且可由部署调优。** `weather-local` 接受 `overrides`（按小写地点名精确匹配）、`defaultTemperatureC`、`defaultCondition`；`weather-web` 接受 `apiUrl`、`timeoutMs`；`tool-greet` 接受 `maxWords`、`fallbackGreeting`。所有字段都经 schemastery 提供默认值；`assertServiceableWeatherConfig` 在挂载时拒绝不可用的值。

**工具以 `tutorial` agent preset 的形式内置。** `apps/cli/config/agent-presets/tutorial/` 复制 `standard`，并在一个 `isolate: { weather: true }` realm 内追加 weather 行，因此每个会话获得自己的 provider 实例，消费方解析到同一 realm。`@deepseek-ai/dsh-tutorial-tools` 是 `apps/cli` 的依赖，因此这些行在已安装布局中能从 host 组合基址解析；`tsconfig.base.json` 的子路径映射保证了 tsx/vitest 的源码平面解析。

**examples 叶节点退役。** `examples/tutorial-tools`（src 文件、绝对路径 overlay、README）被删除，由包子路径与 preset 取代。`tmp/` 下的临时 typecheck 改为指向包的 `src`。

## 考虑过的替代方案

**原地扩充叶节点。** 否决：examples 叶节点是可运行组合，不是可安装包；绝对路径 overlay 离开某个 checkout 就失效，叶节点里的插件也无法满足包级门槛（覆盖率、invariant、README 契约）或从 profile 解析。

**按 shell 三件套拆成两个包（定义 vs. provider/消费方）。** 对本教程制品否决：这些角色在此不会独立演化，单包能把教学单元与其 100% 逐文件覆盖率放在一起。模块级拆分（定义、provider、消费方、子路径导出）已保留能力缝概念，无需组织结构拆分。

**preset 行引用包根路径。** 否决：loader 会把根导出（服务类）当作插件挂载；preset 应指名每个角色的子路径。

## 后果

Web UI 的 preset 选择器新增第五项（`教程模式`），其 agent 组合了完整标准工具集外加 `greet` 与 `weather`。weather 能力现在可独立安装（`dsh plugin --profile web add ...` 或组合行）、无需改动消费方即可更换 provider、并通过经过校验的 `Config` 字段调优。该包自带 invariant companion、双语 README（含模型体验）与 100% 逐文件覆盖率套件；`weather-web` 测试 mock 全局 `fetch`，覆盖取消、超时与畸形响应分支。配置目录经其生成器收录该包的 `Config` 条目。
