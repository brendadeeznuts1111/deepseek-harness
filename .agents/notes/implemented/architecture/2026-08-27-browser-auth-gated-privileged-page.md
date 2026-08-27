# Agent Note: The served page inherits the connection's browser-auth privilege

Status: implemented

English | [中文](2026-08-27-browser-auth-gated-privileged-page.zh.md)

## Problem

The 0.1.2-alpha.1 privileged redesign split the privilege decision in half. Server side, `requestRejection` accepts a request when the Host/Origin fence passes and a valid browser-auth cookie is present, so a deployed trusted origin (a Cloudflare Tunnel fronting `dsh web`) can call every `/api` Remote method with a signed 30-day cookie.

Client side, `ctx.connection.isLoopback` still decides which surfaces render at all: the settings describe mirror constructs with `memory` persistence on non-loopback pages, `ui-settings-general` skips its document controller, and `ui-deliverables` follows the same flag. `isLoopback` reads only the page location's hostname (plus the worker-shell `ownsHost` global), so a cookie-authenticated page on `https://dsh.example.com` receives the terminal "settings are unavailable in this browser" although the Host itself answers every privileged call from that exact session.

The result was a deployment where the server trusts the session and the client refuses to use it. No configuration surface reaches the served bundle — the client is static JavaScript, and no upstream mechanism carries the Host's trust decision into the page.

## Decision

The served index carries the Host's verdict to the page. `frontend-static` injects `globalThis.__DSH_PRIVILEGED_PAGE__ = true` alongside the existing `<base href>` row, and the connection client folds that global into `isLoopback`:

```ts
isLoopback: transport?.ownsHost === true || pageLocation === undefined
  || isLoopbackHostname(pageLocation.hostname) || privilegedPage
```

The injection is unconditional but not unprotected: `authorizeIndex` runs before index bytes are served, so the global only ever reaches a browser holding a valid browser-auth cookie (or a loopback page, which was already privileged). The privilege the page gains is therefore exactly the privilege its session already holds at the `/api` fence — the client stops second-guessing a decision the Host already made about that session.

Pages served without a valid session never receive the global and keep the loopback-only surface. Worker shells that set `ownsHost` are unchanged, as are local `127.0.0.1` pages.

## Consequences

- Settings, credentials, and deliverables render on deployed trusted origins; the settings describe RPC was already permitted server side.
- A deployment serving the Web UI publicly without `--trusted-host` now gets client surfaces that attempt privileged calls the fence rejects — the same configuration error previously hidden behind "unavailable in this browser", now reported by the failing RPC itself.
- If upstream later adds a supported trust signal for served pages, this global and its two read/write sites are the removal surface.
