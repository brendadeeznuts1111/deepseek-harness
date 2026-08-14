# Cordis 教程收官工具

[English](README.md) | 中文

[Cordis 首个插件教程](../../docs/cordis-tutorial/index.md) 的成品工具：一个有状态的 `greet` 工具，以及它链式调用的 `weather` 工具，通过 [overlay](headless-patch.yml) 加载进 profile。

## 四个阶段

教程分四个阶段构建 greet 工具，最终代码中全部具备：

- **静态：** 模型调用失败时的普通 `Hello, <name>!` 回退。
- **模型驱动：** 通过 `ctx.llm.stream` 使用 agent 自身的提供方与模型选择发起一次辅助 LLM 调用。
- **链式：** 通过 `ctx.tools.execute` 向 `weather` 发起工具到工具的子调度。
- **有状态：** 一个 `tutorial_greet` storage domain，记住上次被问候的人和每个人的上次所在地。

## 文件

- `src/greet.ts` —— 有状态的 greet 工具：模型生成的问候语、天气点缀与持久记忆。
- `src/weather.ts` —— 确定性的天气模拟，返回结构化 `{ location, temperatureC, condition }` 值。
- `headless-patch.yml` —— 将两个工具插入 profile 树的 overlay。

## 运行

在仓库根目录下，将 overlay 加载进 profile：

```sh
pnpm dsh --profile headless --patch examples/tutorial-tools/headless-patch.yml "Use the greet tool to greet Ada in Tokyo."
```

在 8081 端口运行 Web 应用：

```sh
pnpm dsh web --patch examples/tutorial-tools/headless-patch.yml --port 8081
```

web profile 挂载了存储服务，因此记忆部分在那里生效；headless profile 没有挂载，因此同一个工具以无状态方式运行。

## overlay

[`headless-patch.yml`](headless-patch.yml) 使用不带 id 的 `insert:` 行向根树追加新条目；针对 id 的 patch 只会覆盖已有行。`name` 指定符是指向本叶节点 `src/` 目录的绝对路径；如果你的 checkout 位于其他位置，请更改它们。
