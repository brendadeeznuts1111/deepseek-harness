# Agent Note: 服务的页面继承连接的浏览器鉴权特权

Status: implemented

[English](2026-08-27-browser-auth-gated-privileged-page.md) | 中文

## Problem

0.1.2-alpha.1 的特权化重构把特权判定拆成了两半。服务器一侧，`requestRejection` 在 Host/Origin 围栏通过且浏览器鉴权 cookie 有效时接受请求，因此已部署的可信源（Cloudflare Tunnel 前置的 `dsh web`）可以用签发 30 天的 cookie 调用全部 `/api` Remote 方法。

客户端一侧，`ctx.connection.isLoopback` 仍然决定哪些界面会渲染：设置 describe 镜像在非回环页面用 `memory` 持久化构造，`ui-settings-general` 跳过它的文档控制器，`ui-deliverables` 遵循同一个标志。`isLoopback` 只读页面地址的主机名（外加 worker shell 的 `ownsHost` 全局），于是一个持有有效 cookie 的 `https://dsh.example.com` 页面会得到终态的"settings are unavailable in this browser"，尽管 Host 本身正对同一个会话应答每个特权调用。

结果是部署中服务器信任该会话而客户端拒绝使用它。没有任何配置面能到达所服务的 bundle——客户端是静态 JavaScript，上游也没有把 Host 的信任决定带进页面的机制。

## Decision

服务的 index 把 Host 的判定带给页面。`frontend-static` 在既有 `<base href>` 之外注入 `globalThis.__DSH_PRIVILEGED_PAGE__ = true`，连接客户端把这个全局并入 `isLoopback`：

```ts
isLoopback: transport?.ownsHost === true || pageLocation === undefined
  || isLoopbackHostname(pageLocation.hostname) || privilegedPage
```

注入是无条件的，但并非不设防：`authorizeIndex` 在 index 字节被服务之前运行，所以这个全局只会到达持有有效浏览器鉴权 cookie 的浏览器（或回环页面——它本来就特权）。页面获得的特权因此恰好等于它的会话在 `/api` 围栏已持有的特权——客户端不再对 Host 已就该会话做出的决定进行二次猜测。

没有有效会话而服务的页面永远收不到这个全局，保持仅回环的界面。设置 `ownsHost` 的 worker shell 不变，本机 `127.0.0.1` 页面也不变。

## Consequences

- 设置、凭据与交付物在已部署的可信源上渲染；settings describe RPC 在服务器一侧本就被允许。
- 一个公开服务 Web UI 却未配置 `--trusted-host` 的部署，现在会得到尝试特权调用的客户端界面，围栏会拒绝它们——同样的配置错误此前被"unavailable in this browser"遮掩，现在由失败的 RPC 本身报告。
- 若上游日后为服务的页面加入受支持的信任信号，这个全局及其两处读写点即是移除面。
