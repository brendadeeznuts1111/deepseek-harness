# Cordis tutorial capstone tools

English | [中文](README.zh.md)

The finished tools from the [Cordis first-plugin tutorial](../../docs/cordis-tutorial/index.md): a stateful `greet` tool and the `weather` tool it chains to, loaded into a profile through the [overlay](headless-patch.yml).

## The four stages

The tutorial builds the greet tool in four stages, all present in the final code:

- **Static:** a plain `Hello, <name>!` fallback when the model call fails.
- **Model-backed:** one auxiliary LLM call through `ctx.llm.stream` using the agent's own provider and model selection.
- **Chained:** a tool-to-tool sub-dispatch to `weather` through `ctx.tools.execute`.
- **Stateful:** a `tutorial_greet` storage domain remembering the last person greeted and each person's last location.

## Files

- `src/greet.ts` — the stateful greet tool: model-generated greeting, weather flavoring, and durable memory.
- `src/weather.ts` — a deterministic weather mock returning a structured `{ location, temperatureC, condition }` value.
- `headless-patch.yml` — the overlay that inserts both tools into a profile tree.

## Run

From the repository root, load the overlay into a profile:

```sh
pnpm dsh --profile headless --patch examples/tutorial-tools/headless-patch.yml "Use the greet tool to greet Ada in Tokyo."
```

Run the web app on port 8081:

```sh
pnpm dsh web --patch examples/tutorial-tools/headless-patch.yml --port 8081
```

The web profile mounts the storage services, so the memory half is active there; the headless profile does not, so the same tool runs stateless.

## The overlay

[`headless-patch.yml`](headless-patch.yml) uses `insert:` rows without ids, which append new entries to the root tree; an id-targeted patch would only override an existing row. The `name` specifiers are absolute paths into this leaf's `src/` directory; change them if your checkout lives elsewhere.
