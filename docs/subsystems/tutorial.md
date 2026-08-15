# Tutorial Tools

English | [中文](tutorial.zh.md)

[ `@deepseek-ai/dsh-tutorial-tools`](../../packages/examples/tutorial-tools/README.md) is the Cordis tutorial capstone as an installable package: one `ctx.weather` capability seam with a deterministic local provider, a live HTTP provider, and the `greet`/`weather` tool consumers. The Web UI ships it as the `tutorial` agent preset.

The seam's contract: `ctx.weather.get({ location, signal })` resolves `{ location, temperatureC, condition }`; implementations trim the location and reject an empty one, and a successful lookup always resolves a complete result. Providers register as `ctx.weather` by subclassing `WeatherService`; consumers inject the service key. `tool-greet` treats weather as optional flavoring, so a failing provider never sinks the greeting.

Source: [`packages/examples/tutorial-tools/src/weather.ts`](../../packages/examples/tutorial-tools/src/weather.ts)

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
