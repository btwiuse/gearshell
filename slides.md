# GEAR SHELL
基于浏览器的 Agent 沙盒

--

## 核心痛点 — WHY

**1. 主流 Agent 配置流程复杂，无法开箱即用**
- 约有 73% 的新用户在首次安装 OpenClaw（俗称"养龙虾"）时会遇到阻塞性报错

**2. Agent 在本地运行存在诸多安全问题**
- 高危漏洞与远程代码执行 (RCE)
- 插件生态与供应链投毒
- 提示词注入与 Agent 误判

--

## 目标用户 — WHO

**1. Agent 开发者/厂商**
- 降低 Agent 上手门槛
- 线上轻量 Demo 环境
- 提升用户留存率

**2. Agent 终端用户**
- 快速体验 Agent 功能
- 提升默认安全性

--

## 技术原理 — HOW

**1. WebAssembly 沙盒**
- 在浏览器支持运行多种语言的代码：C++/Rust/Go …
- 轻量无服务器：核心组件只依赖预先发布至 CDN 的静态资源（js, wasm）

**2. 虚拟文件系统**
- Filesystem Access API
- 挂载本地目录供 Agent 访问

--

## 演示 — DEMO

*首次加载需要消耗 ~50M 数据*

- [https://gear.sh/picoclaw](https://gear.sh/picoclaw) — 国产皮皮虾
- [https://gear.sh/crush](https://gear.sh/crush) — Crush 编程助手
- [https://ide.gear.sh](https://ide.gear.sh) — 在线 IDE + go4js 编译器

--

## 商业模式 — Dual Licensing

- 开源项目免费使用
- 企业商用需购买许可

--

<img src="./group.png" style="max-height:70vh" />
