# @deepseek-ai/dsh-tutorial-tools

[English](README.md) | 中文

[Cordis 首个插件教程](../../../docs/cordis-tutorial/index.md) 的成品工具，以可安装的能力缝（capability seam）形式呈现：一个 `ctx.weather` Service Definition、一个确定性的本地 provider、一个实时 HTTP provider，以及把该能力暴露给模型的 `greet`/`weather` 工具消费方。Web UI 将其作为 `tutorial` agent preset 内置。

## weather 能力缝

一个能力、三个角色（[能力缝](../../../docs/architecture.md#capability-seams)）：

- **`WeatherService`**（默认导出，包根路径）——Service Definition：`ctx.weather.get({ location, signal })` 解析为 `{ location, temperatureC, condition }`。实现方会 trim 地点并拒绝空地点；一次成功的查询总是解析出完整结果。
- **`weather-local`** —— 确定性 provider：按小写地点名键控的 `overrides`，外加 `defaultTemperatureC`/`defaultCondition` 回退。
- **`weather-web`** —— 实时 provider：对可配置的 `apiUrl` 发起一次 HTTP GET，尊重调用方取消与每次请求的 `timeoutMs`。

消费方：

- **`tool-weather`** —— 基于 `ctx.weather` 的模型可见 `weather` 工具：结构化规范值、可重放的 `presentationMeta`、通用待处理/完成卡片。
- **`tool-greet`** —— 有状态的 `greet` 工具：模型生成问候语、通过该缝点缀天气、并通过 `tutorial_greet` 的 `ctx.storage` domain 实现持久记忆（上次被问候的人、每个人的上次所在地）。

## 配置

| 子路径 | 字段 | 默认值 | 含义 |
|---|---|---|---|
| `weather-local` | `overrides` | `{}` | 按小写地点名键控的逐地天气覆盖；精确匹配生效 |
| `weather-local` | `defaultTemperatureC` | `18` | 无覆盖地点返回的温度（°C） |
| `weather-local` | `defaultCondition` | `'partly cloudy'` | 无覆盖地点返回的天气描述 |
| `weather-web` | `apiUrl` | — | 以 `{ temperatureC, condition }` 应答 `GET ${apiUrl}/${encodeURIComponent(location)}` 的端点 |
| `weather-web` | `timeoutMs` | `10000` | 每次请求的网络超时（毫秒） |
| `tool-greet` | `maxWords` | `20` | 模型生成的问候语不得超过的字数预算 |
| `tool-greet` | `fallbackGreeting` | `'Hello, {name}!'` | 模型调用失败或没有产出时的回退模板；`{name}` 会被替换为对方的名字 |

## 用法

在 Web UI 中选择 `tutorial` agent preset，或在组合中挂载这些行：

```yaml
- id: weather
  name: cordis:group
  group: true
  isolate:
    weather: true
  config:
    - id: weather-local
      name: '@deepseek-ai/dsh-tutorial-tools/weather-local'
      config:
        overrides:
          london:
            temperatureC: 14
            condition: drizzling

    - id: tool-weather
      name: '@deepseek-ai/dsh-tutorial-tools/tool-weather'

    - id: tool-greet
      name: '@deepseek-ai/dsh-tutorial-tools/tool-greet'
```

服务行位于 `isolate` realm 内，因为 preset 每进程只挂载一次，其消费方必须解析到同一实例。把 `weather-local` 换成 `weather-web` 即可提供实时数据；消费方无需任何改动。

## 模型体验

### greet 工具

#### 模型看到什么

`greet` 工具带有一个自由文本 `name`（默认取上次被问候的人）和可选 `location`（默认取该人上次的所在地）。成功调用返回一句模型生成的一行问候语，可选地提及该地点的当前天气。

##### 该字段的逐字文本

```markdown
Greet someone by name with a warm, model-generated message, optionally folding in the weather for a location. Remembers the last person greeted and each person's last location.
```

#### Token 影响

每次调用发起一次辅助模型请求，携带解析后的姓名、地点解析成功时的天气上下文句，以及配置的字数预算。天气查询本身从不进入模型上下文；只有渲染后的 ` It is N°C with C in L.` 句子会。

#### KV Cache 影响

提示词由本次请求解析出的姓名、地点与天气组装，因此对同一人同一地点的重复问候会复用稳定前缀；新姓名、新地点或新天气文本会开启不同的提示词。

### weather 工具

#### 模型看到什么

`weather` 工具带有一个必填的自由文本 `location` 参数，返回结构化 `{ location, temperatureC, condition }` 值，渲染为 `N°C, C in L`。

#### Token 影响

工具注册期间，`location` 字符串参数会让 schema 在每次请求的工具目录中占位。

#### KV Cache 影响

工具定义是静态、前缀稳定的；成功调用的结果文本为追加式。

## 已知限制与待办

- **实时 provider 是单端点的** —— `weather-web` 只说一种 `{ temperatureC, condition }` 契约，不做地理编码或多源回退；部署方需把 `apiUrl` 指向能说该契约的服务。
- **记忆按设计为可选** —— 没有组合 `ctx.storage` 时，`greet` 以无状态运行，无法回忆上次被问候的人。
- **教程范围** —— 该包是教学制品：`ctx.weather` 背后没有限流、缓存或 provider 舰队。
