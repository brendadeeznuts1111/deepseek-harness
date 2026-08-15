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

## Control

Use the same Web UI as localhost: Settings → Models, then **Choose workspace**. The public origin uses the in-app directory browser (`listDirectory`), not the native OS dialog (`pickDirectory` is loopback-only and returns HTTP 403 from a remote tab).

Tunnel name: `dsh-web`. Tunnel id: `3b081e1e-9bd7-4f6e-b953-084940fa0503`. Config: `~/.cloudflared/config-dsh.yml`. Access app id: `d3c088b6-2c8d-4333-9ba5-ba91f79dd53c`. Policy: reusable `Allow owner emails`.
