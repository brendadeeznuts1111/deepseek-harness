# Access this checkout’s Web UI

Personal preview note for this fork. Do not merge into official `master`.

## URLs

- Public HTTPS: https://dsh.misson-control.com/
- Local: http://127.0.0.1:3080/

The public hostname is a Cloudflare Tunnel to `dsh web` on this machine (`127.0.0.1:3080`). LaunchAgents `com.nolarose.dsh-web` and `com.nolarose.dsh-tunnel` keep both processes up across login and the agent 10-hour cap. The public origin is behind Cloudflare Access; sign in with Google or a one-time PIN as an owner email. Local `http://127.0.0.1:3080/` is not behind Access. Supporting browsers can install the origin as a PWA (manifest + network-only service worker; no offline cache).

## Start

```sh
pnpm dsh web --trusted-host dsh.misson-control.com
cloudflared --config ~/.cloudflared/config-dsh.yml tunnel run dsh-web
```

`--trusted-host dsh.misson-control.com` is required so the `/api` browser-trust fence accepts the public origin.

## Privileged client surface on the public origin (fork extension)

Upstream keeps the privileged client surface (Settings, credentials, deliverables) loopback-only: `ctx.connection.isLoopback` gates the settings mirror, so a remote authority renders "settings are unavailable in this browser" even though the `/api` fence already accepts the session (Host/Origin fence + browser-auth cookie).

Fork fix on this branch: the served `index.html` injects `globalThis.__DSH_PRIVILEGED_PAGE__ = true` and the connection client folds it into `isLoopback`. This is safe unconditionally because index serving runs behind `authorizeIndex` — only browser-auth-gated pages (or loopback) ever receive the global, so the privilege equals a valid session, matching the `/api` fence's own model.

The browser-auth cookie is signed for the redeeming authority, so each origin (local and public) needs its own redemption of the printed `/?token=…` launch URL. The dsh-ops layer (`bun run token` in `~/code/dsh-ops`, `bun.cron.dsh-heal`) tracks token rotation across restarts and auto-opens the public redemption URL.

## Control

Use the same Web UI as localhost: Settings → Models, then **Choose workspace**. The public origin uses the in-app directory browser (`listDirectory`), not the native OS dialog (`pickDirectory` is loopback-only and returns HTTP 403 from a remote tab).

Tunnel name: `dsh-web`. Tunnel id: `3b081e1e-9bd7-4f6e-b953-084940fa0503`. Config: `~/.cloudflared/config-dsh.yml`. Access app id: `d3c088b6-2c8d-4333-9ba5-ba91f79dd53c`. Policy: reusable `Allow owner emails`.
