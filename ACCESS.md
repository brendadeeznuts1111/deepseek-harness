# Access this checkout’s Web UI

Personal preview note for this fork. Do not merge into official `master`.

## URLs

- Public HTTPS: https://dsh.misson-control.com/
- Local: http://127.0.0.1:3080/

The public hostname is a Cloudflare Tunnel to `dsh web` on this machine (`127.0.0.1:3080`). Both processes must be running.

## Start

```sh
pnpm dsh web --trusted-host dsh.misson-control.com
cloudflared --config ~/.cloudflared/config-dsh.yml tunnel run dsh-web
```

`--trusted-host dsh.misson-control.com` is required so the `/api` browser-trust fence accepts the public origin.

## Control

Use the same Web UI as localhost: Settings → Models, Choose workspace, then send a task.

Tunnel name: `dsh-web`. Tunnel id: `3b081e1e-9bd7-4f6e-b953-084940fa0503`. Config: `~/.cloudflared/config-dsh.yml`.
