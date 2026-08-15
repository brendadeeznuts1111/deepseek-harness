# @deepseek-ai/dsh-tutorial-tools

English | [中文](README.zh.md)

The finished tools from the [Cordis first-plugin tutorial](../../../docs/cordis-tutorial/index.md) as an installable capability seam: a `ctx.weather` Service Definition, a deterministic local provider and a live HTTP provider, and the `greet`/`weather` tool consumers that expose the capability to the model. The Web UI ships it as the `tutorial` agent preset.

## The weather capability seam

One capability, three roles ([capability seams](../../../docs/architecture.md#capability-seams)):

- **`WeatherService`** (default export, subpath root) — the Service Definition: `ctx.weather.get({ location, signal })` resolving `{ location, temperatureC, condition }`. Implementations trim the location and reject an empty one; a successful lookup always resolves a complete result.
- **`weather-local`** — the deterministic provider: per-place `overrides` keyed by the lowercased place name, plus `defaultTemperatureC`/`defaultCondition` fallbacks.
- **`weather-web`** — the live provider: one HTTP GET against a configurable `apiUrl`, honoring caller cancellation and a per-request `timeoutMs`.

Consumers:

- **`tool-weather`** — the model-facing `weather` tool over `ctx.weather`: structured canonical value, replayable `presentationMeta`, and generic pending/completed cards.
- **`tool-greet`** — the stateful `greet` tool: model-generated greeting, optional weather flavoring through the seam, and durable memory via a `tutorial_greet` `ctx.storage` domain (last greeter, per-person location).

## Config

| Subpath | Field | Default | Meaning |
|---|---|---|---|
| `weather-local` | `overrides` | `{}` | Per-place forecasts keyed by the lowercased place name; an exact match wins |
| `weather-local` | `defaultTemperatureC` | `18` | Temperature in °C for a place with no override |
| `weather-local` | `defaultCondition` | `'partly cloudy'` | Condition text for a place with no override |
| `weather-web` | `apiUrl` | — | Endpoint answering `GET ${apiUrl}/${encodeURIComponent(location)}` with `{ temperatureC, condition }` |
| `weather-web` | `timeoutMs` | `10000` | Per-request network timeout in milliseconds |
| `tool-greet` | `maxWords` | `20` | Word budget the model-generated greeting must stay under |
| `tool-greet` | `fallbackGreeting` | `'Hello, {name}!'` | Fallback template when the model call fails or yields nothing; `{name}` is replaced with the person's name |

## Usage

Select the `tutorial` agent preset in the Web UI, or mount the rows in a composition:

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

The service row sits inside an `isolate` realm because a preset mounts once per process and its consumers must resolve the same instance. Swap `weather-local` for `weather-web` to serve live data; the consumers change nothing.

## Model Experience

### greet tool

#### What the model sees

The `greet` tool with a free-text `name` (defaulting to the last remembered greeter) and optional `location` (defaulting to the remembered location for that person). A successful call returns a model-generated one-sentence greeting, optionally mentioning the current weather for the location.

##### Verbatim text for this field

```markdown
Greet someone by name with a warm, model-generated message, optionally folding in the weather for a location. Remembers the last person greeted and each person's last location.
```

#### Token effect

One auxiliary model request per call, carrying the resolved name, the weather context sentence when a location resolves, and the configured word budget. The weather lookup itself never reaches the model; only its rendered ` It is N°C with C in L.` sentence does.

#### KV Cache effect

The prompt is assembled from the request's resolved name, location, and weather, so repeated greets of the same person at the same place reuse a stable prefix; a new name, location, or weather text starts a different prompt.

### weather tool

#### What the model sees

The `weather` tool with one required free-text `location` argument, returning the structured `{ location, temperatureC, condition }` value rendered as `N°C, C in L`.

#### Token effect

The schema adds the `location` string parameter to the tool catalog on every request while the tool is registered.

#### KV Cache effect

The tool definition is static and prefix-stable; a successful call's result text is append-only.

## Known Limitations and Deferred Work

- **The live provider is single-endpoint** — `weather-web` speaks one `{ temperatureC, condition }` contract and does no geocoding or multi-source fallback; deployments point `apiUrl` at a service that speaks it.
- **Memory is optional by design** — without a composed `ctx.storage`, `greet` runs stateless and cannot recall the last greeter.
- **Tutorial scope** — the package is a teaching artifact: no rate limiting, caching, or provider fleet behind `ctx.weather`.
