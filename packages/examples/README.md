---
description: "Tutorial packages that teach the capability pattern: the weather seam walkthrough used by the documentation."
kind: "package-group"
---

# examples/ — tutorial packages

English | [中文](README.zh.md)

## Summary

The examples group carries teaching packages, not product layers: the `tutorial-tools` package walks the capability pattern end to end — a Service Definition, local and live-web providers, and model-facing consumers — and is the source material behind the tutorial subsystem page. A profile mounts it only through the tutorial preset, so the group never ships as a production layer and never owns a runtime contract of its own.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`tutorial-tools`](tutorial-tools/README.md) | Teaches the capability seam with a weather service, two providers, and greet/weather model tools | `ctx.weather` |

<a id="related-documentation"></a>
## Related documentation

- [Tutorial subsystem](../../docs/subsystems/tutorial.md)
- [Cordis tutorial](../../docs/cordis-tutorial/index.md)

<a id="dev-note"></a>
## Dev Note

Keep this package small and explicit: every provider and tool exists to demonstrate one contract, so production behavior belongs in the owning capability family instead.
