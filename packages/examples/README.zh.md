---
description: "教程包：用于说明能力模式的天气 seam 走查文档的来源。"
kind: "package-group"
---

# examples/ — 教程包

[English](README.md) | 中文

## 概述

examples 组承载教学包，而不是产品层：`tutorial-tools` 包完整走查能力模式——一个 Service Definition、本地与实时 Web provider、以及面向模型的 Consumer——并作为教程子系统页面的来源材料。profile 只在教程 preset 中挂载它，因此该组从不作为生产层发布，也不拥有自己的运行时契约。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`tutorial-tools`](tutorial-tools/README.zh.md) | 通过天气服务、两个 provider 与 greet/weather 模型工具演示能力 seam | `ctx.weather` |

<a id="related-documentation"></a>
## 相关文档

- [教程子系统](../../docs/subsystems/tutorial.zh.md)
- [Cordis 教程](../../docs/cordis-tutorial/index.zh.md)

<a id="dev-note"></a>
## 开发备注

保持该包小而明确：每个 provider 与工具都只用于演示一个契约，生产行为应归属对应的能力系列。
