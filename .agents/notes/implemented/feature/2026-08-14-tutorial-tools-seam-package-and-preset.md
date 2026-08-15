# Agent Note: Tutorial tools as a weather capability seam package and preset

Status: implemented

English | [中文](2026-08-14-tutorial-tools-seam-package-and-preset.zh.md)

## Problem

The Cordis tutorial capstone (`greet` + `weather` tools) lived as loose plugin files in a version-controlled examples leaf loaded through an absolute-path overlay. The weather mock hardcoded its tunables, neither tool declared UI render intent, and nothing in the product shipped them — a learner's finished work had no installable, Web-UI-visible form.

## Decision

**One package owns the capability seam.** `@deepseek-ai/dsh-tutorial-tools` at `packages/examples/tutorial-tools` holds the `ctx.weather` Service Definition (default export `WeatherService`), two providers (`weather-local` deterministic mock, `weather-web` live HTTP over the global `fetch`), and two consumers (`tool-weather`, `tool-greet`). Providers subclass `WeatherService` and register as `ctx.weather`; consumers inject the service key. `weather-web` honors caller cancellation and a per-request timeout and fails loud on infrastructure failures; `tool-greet` treats weather as optional flavoring, so a failing provider never sinks the greeting. Both tools declare `presentCall`/`presentResult`/`presentationMeta` render intent and hand-check the constraints the schema DSL cannot express (non-empty location, non-empty conditions, finite numbers).

**Config is schema-validated and deployment-tunable.** `weather-local` takes `overrides` (exact match on the lowercased place name), `defaultTemperatureC`, `defaultCondition`; `weather-web` takes `apiUrl`, `timeoutMs`; `tool-greet` takes `maxWords`, `fallbackGreeting`. Every field defaults through schemastery; `assertServiceableWeatherConfig` refuses unusable values at mount.

**The tools ship as the `tutorial` agent preset.** `apps/cli/config/agent-presets/tutorial/` copies `standard` and adds the weather rows inside one `isolate: { weather: true }` realm, so each session gets its own provider instance while the consumers resolve the same realm. `@deepseek-ai/dsh-tutorial-tools` is an `apps/cli` dependency so the rows resolve from the host composition base in installed layouts; subpath `tsconfig.base.json` paths keep the tsx/vitest source-plane resolution clean.

**The examples leaf is retired.** `examples/tutorial-tools` (src files, absolute-path overlay, READMEs) is removed; the package subpaths and the preset replace it. The scratch typecheck under `tmp/` now targets the package `src`.

## Alternatives considered

**Keep the leaf and grow it in place.** Rejected because examples leaves are runnable compositions, not installable packages: absolute-path overlays break outside one checkout, and the leaf's plugins could not satisfy the package gates (coverage, invariants, README contracts) or resolve from a profile.

**Two packages for the seam (definition vs. providers/consumers, shell-trio style).** Rejected for this tutorial artifact: the roles do not evolve independently here, and one package keeps the teaching unit and its 100% per-file coverage together. The module-level separation (definition, providers, consumers, subpath exports) preserves the seam concept without the organizational split.

**Preset rows that reference the package root.** Rejected because the loader mounts the root export (the service class) as a plugin; the preset names each role's subpath instead.

## Consequences

The Web UI preset picker gains a fifth entry (`教程模式`) whose agent composes the full standard toolset plus `greet` and `weather`. The weather capability is now installable independently (`dsh plugin --profile web add ...` or a composition row), swap a provider without touching consumers, and tune via validated `Config` fields. The package carries its own invariant companion, bilingual README with Model Experience, and a 100% per-file coverage suite; `weather-web` tests mock the global `fetch` and exercise cancellation, timeout, and malformed-response branches. The config catalog gains the package's `Config` entries through its generator.
