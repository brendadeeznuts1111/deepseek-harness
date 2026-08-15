# 教程工具

[English](tutorial.md) | 中文

[`@deepseek-ai/dsh-tutorial-tools`](../../packages/examples/tutorial-tools/README.md) 是 Cordis 教程收官作品的可安装形式：一条 `ctx.weather` 能力缝，带一个确定性本地 provider、一个实时 HTTP provider，以及 `greet`/`weather` 工具消费方。Web UI 将其作为 `tutorial` agent preset 内置。

该缝的契约：`ctx.weather.get({ location, signal })` 解析为 `{ location, temperatureC, condition }`；实现方会 trim 地点并拒绝空地点，一次成功的查询总是解析出完整结果。Provider 通过继承 `WeatherService` 注册为 `ctx.weather`；消费方注入该服务键。`tool-greet` 把天气视为可选点缀，provider 故障绝不会拖垮问候。

来源：[`packages/examples/tutorial-tools/src/weather.ts`](../../packages/examples/tutorial-tools/src/weather.ts)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweather--weatherservice-abstract-seam"></a>

### `ctx.weather` — `WeatherService` (abstract seam)

Abstract current-weather service. Subclass, implement get, and load the subclass as a plugin — it registers as `ctx.weather` (one implementation per context; a second registration throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- get trims the location and rejects an empty one.
- get rejects only for infrastructure or validation failures; a successful lookup always resolves a complete WeatherResult.

```ts cordis-catalog
/**
 * Look up the current weather for one location.
 * @param request - the location to look up and optional caller cancellation.
 * @returns the structured current-weather answer.
 */
abstract get(request: WeatherRequest): Promise<WeatherResult>
```

Source: [`packages/examples/tutorial-tools/src/weather.ts:45`](../../packages/examples/tutorial-tools/src/weather.ts)
<!-- END GENERATED cordis-surface -->
