# TODO / 工作交接（Agentic Workspace）

> 会话压缩前的完整上下文快照。下次继续先读本文件 + `memory/agentic-workspace.md`（已同步 wiki）。

## 一、总体状态：Plan A 已走通 ✅

**愿景**：沙盒内 agent（Crush/bash）通过 `gear` CLI 操控 GearShell 面板（建任务、读写配置、开面板、读输出）。

**通道（Route A）**：wanix 内核 jsfs `/js` 投影（`globalThis` 即文件系统）+ gear bash 脚本走 fd>2 协议：
- agent → `/bin/gear <method> '<json-args>'` → `exec 3<>/js/GearShell/<method>:json` → 写 JSON 行 → 内核 `reflectApply` 调 `window.GearShell.<method>` → 读回 JSON。
- **jsfs 关键协议**：后缀是 **`:json`（冒号）**；`:json` 模式把 JSON 数组**展开成位置参数**（`fn(...args)`），所以 `gear tasks.create '[{...}]'` 到 JS 侧是**单个对象**；jsfs 不 await Promise → API **必须同步**。
- 要求：hush ≥ v0.5.9（fd>2 重定向 + 脚本参数）、wanix ≥ v0.4.16（shebang + `:json` OpenFile + bytesArg）。

**真机验证过的能力**（CDP 驱动真实 Chrome @ localhost:8000）：
- `gear ping` → `"pong"`
- `gear panels.list` → 真实组件名（`params.panelType`，非 dockview component 引用）
- `gear tasks.create '[{"name":"x","cmd":"bash"}]'` → 终端面板出 `➜ / $` 提示符、可输入
- headless（`term:false`）→ 面板显示 `$ cmd` / `workdir` / `env (N)` 折叠
- **`gear tasks.output <id>`** → `{ok, taskId, path, output}` 读回 headless 输出
- `./gm` shebang 脚本可执行；`config.getShell` 正常
- `wd` 生效（`task/<alias>/dir` + 提示符 `➜ ~ $`）

**里程碑（2026-08-29，wanix v0.4.20 + 浏览器实测）**：
- **实时输出流闭环**：`{ cmd; } > tmp/<id>.log 2>&1` 的日志**逐行实时落盘**（t=2 见 out-1/err-1，旧版 t=1..6 空、t=7 全量）；页面 800ms 轮询器（startTaskOutputCapture）**零改动**即可实时读 `tasks.output`。
- **exec-redirect 谜题闭环**：根因 = fskit `nodeFile` 缓冲（见踩坑 5），`exec > f` 字节正常落盘。
- **内核死锁修复（wanix v0.4.23, commit 6686897）**：autoDriver 持 `fsys.mu` 期间调 `driver.Start`（gojs 的 GetOrCompile 等 WebAssembly.compile promise 需 JS 事件循环）与 term connect 的 `_updateTerminals`（等同一把锁）互锁 → 首次任务 + 终端并发连接必死锁（“all goroutines are asleep”）。修复：**driver 查找锁内、Start 锁外**。
- 测试任务已清（备份到 `gear-shell-workspace-backup:hush-shell`，累计 71 个）。

## 二、本轮已提交（勿重复）

> 历史已重写：TODO.md 从未进入 git（`738ca8c` 等 4 个 TODO commit 已全部 drop，reflog 可查）；工作副本以未跟踪文件保留在仓库根。

| commit | 内容 |
|---|---|
| `d79b18f` | agentic workspace 主体：workspace-api.js + app-workspace-task-sessions.js（app-sessions 拆分，500 行规则）、gctl、修复双 `_awake` 崩溃 + 空 env 杀 bash |
| `b8d0de0` | headless 面板显示 workdir |
| `4a5c545` | headless 输出捕获 `tasks.output`（块重定向 wrapper） |
| `7ba497b` | memory wiki round-7/8 发布（子模块指针） |
| `17e1e98` | WANIX_RUNTIME pin → v0.4.20 + 22 文件版本级联（app.js → v20260828.20） |
| `d9f5c8c`/`936fa40`/`c48918a`/`f0b8ba4` | **终端版 agent 闭环 demo**：scripts/demo-agent-term-loop.sh + 时序硬化 + 读回修复（hush 镜像 `/bin` 只有 bash/gctl/w9y → `$(< file)` 只在裸 `< file` 形态生效，裸 bash 行为相同；agent 建 term:true 任务 → agents.prompt 注入 → OPFS 读回 result=42 → CLOSED LOOP OK (term)，非 CDP 浏览器实测通过） |
| `8d34453` | **代码健康度（500/50 行规则回归）**：拆分 home.js(895→4 文件)、panels.js(571→2)、app.js(540→2)、app-normalize.js(539→2)、settings-terminal-editor.js(540→3)、crush-panel.js(453→2)、crush-panel-config.js(457→2)、launcher.js(393)；新增 10 模块；版本级联 28 文件 + index.html + verify-static；deno fmt + ESM check + verify-static + 浏览器实测（ping/tasks.create/Crush Runner 渲染 OK）；sh/hush/wanix 零改动 |
| `40a2397` | **P1：agent 任务临时化 + 事件读通道**：`tasks.create` 默认 ephemeral（不写 ws.tasks、不 rememberOpenPanel），`persist:true` 才持久化并登记 agent-task registry（`gear-shell-agent-tasks`，刻意不进 workspace schema——normalizeTask 会剥外来字段）+ 启动 GC 清终态定义；`events.drain/pending` 环形缓冲（task.status / panel.added-removed-activated / config.changed → agent 轮询，800ms 节奏同 tasks.output） |
| `6e02434` | **P2：`agents.read` + `agents.prompt` 双门控**：read 读 xterm scrollback 纯文本（`translateToString`，转义已被解析器消费，serialize 是终端→终端回放用的，不适用）；prompt 空闲门控（onWriteParsed 后 1200ms 拒绝，`retryAfterMs`）+ 真人门控（onKey 只对真实键盘触发，5s 宽限，`force:true` 覆盖）+ 串行投递（60ms 间隔）；**修了 wanix-term 面板重挂重建 xterm 导致门控监听器随旧实例死掉的 bug**（按 xterm 实例身份重挂）。浏览器实测：busy 拒绝/真人拒绝/force 放行/宽限恢复全过 |

上游发布：**sh v3.14.4**（fd>2 重定向）、**hush v0.5.9**（脚本参数）、**wanix v0.4.18**（task 元素 `stdout/stderr` 属性绑 fd + allocate 内 `_ensureFile`）、**v0.4.19**（逐级 mkdir）、**v0.4.20**（commit `e0e14b2`：fskit nodeFile write-through 修复实时流 + `_awake()` 幂等）。均 push tag + w9y.io 构建验证（`\0asm` magic + jsdelivr min.js 字节一致）。memory 已同步 wiki（`1d34c61` round-8）。

## 三、关键踩坑（继续工作前必读，全部有源码依据）

1. **`Task already allocated` 崩溃**：wanix task 元素**自激活**（`base.js` connectedCallback → `_connect` → `_activate` → `_awake()` 自动 allocate+start）。应用再调 `_awake()` 必炸。REPL 会话用 `autoActivates: "_connectStarted" in task` 闸；workspace 会话已补同样标志（app-workspace-task-sessions.js），`wakeWorkspaceTaskSession` 对自激活会话早退。
2. **空 env 杀 bash**：gojs worker 读空 env 文件 → `env: ['']` → bash 立即 exit 1。workspace 任务 env 缺省回落 `buildEnv()`（BASH_ENV + 配置 env，app-constants.js:64）。
3. **gojs term 任务 stdout——实际没坏(2026-08-29 实测推翻"fd 解析断链"假说)**：`Task.FD`(task.go:243)fd<3 解析顺序 ①已注册 `fds[fd]` → ②`VFSOpen`(`NS().Open("#task/<rid>/fd/N")`)→ ③nullFile 兜底。轮次 10 一度判断 term 任务 stdout 被 nullFile 吞(两套 fd 视图假说),**错**：bind 表按全路径 key 存,`NS.OpenContext` 先查 direct bind,`elements/task.js` 的 `bind #term/1/program #task/2/fd/1` 真实命中(Go 测试 + 浏览器 `task/<rid>/binds` 双证)。**term 输出路径本来就通**(v0.4.23 实测:直接写 fd/1 → 字符串出现在 xterm;`agents.prompt` + `agents.read` 交互闭环完整成立)。真正的问题只是 **gojs 冷编译 30-60s**(缓存热后 ~5s),编译窗口期读屏必空,加上内核被积压任务压卡 → 双重误判。详见 memory round-11。wanix `task_termfd_test.go` 作为回归测试保留(v0.4.24 SetFD 修复计划取消)。
4. **OPFS 写缓冲**：`web/fsa` 用 `createWritable`，字节只在 `close()` 提交（`.crswap` 临时文件），运行中读不到还可能丢。
5. **`exec > f 2>&1; cmd` 输出蒸发 —— 已闭环（v0.4.20）**：根因不是 fd 路由也不是 go4js，而是 **fskit `nodeFile` 缓冲**（`fs/fskit/node.go`）：`Node.Open` 打开时**快照**节点数据副本，`Write` 只写本地 `f.data`，`Close()` 才 `SetData` 提交。→ 文件保持打开时（块重定向/`exec` keepRedirs）节点对读者永远为空；`exec > f` 永不 close 则数据**永不提交 = 写丢失**；`echo x > f` 语句级关闭反而正常（这就是 fd3 案例为何成功）。mvdan/sh 重定向是 **Go io.Writer 级**（`> file` → `r.stdout = *os.File`；`2>&1` → `r.stderr = r.stdout`），**根本不调 dup2**（go4js `Dup2` 是 ENOSYS 也无所谓）。上游 mvdan v3.11.0 的 `defer cls.Close()` bug 仍可选修。
6. **修复（v0.4.20, commit e0e14b2）**：`nodeFile.Write` 末尾 `SetData(f.inode, f.data)` **write-through**（每次写即时提交，close 重提同一 slice 为 no-op；modTime 仍 close 提交，锁序 f.mu→inode.mu 与 Close 一致）。`-race` 全绿；新增 `TestNodeFileWriteThrough`；既有快照语义测试（TestNodeDataIsolation 等）不受影响（读仍走各句柄本地缓冲）。块重定向 wrapper 保留即可——**现在日志实时增长，`tasks.output` 运行中即返回部分输出**。
7. **测试任务污染工作区**：`tasks.create` 走 `addWorkspaceTask` **持久化**进 localStorage；reload 全 restore 重 spawn（含会 panic 的 `crush --version` → gojs RPC panic → 内核卡死、`root.readText` 挂 20s、新任务不出提示符）。**已在 Settings 关掉 "restore tabs"**。工作区现攒 40+ 测试任务（backup key：`gear-shell-workspace-backup:hush-shell`，25 个旧任务的完整 JSON）。
8. **诊断手法**：`await root.readText("task/workspace-task-N/exit")`：`""`=存活 / `"1"`=启动即死 / 其他=退出码；`ctl` 空=没 start；`task/<alias>/ns/tmp/` = 任务自己的 ramfs（捕获日志位置）。扩展 `read_console_messages` **只覆盖页面 console**，blob worker 的 log 抓不到。
9. **task cmd 直接 exec 首 token（不经 shell）——已修（GearShell `44fbad5` wrapTermCmd）**：内核 gojs driver 按 `args[0]` 找二进制（worker.js `readFile(args[0])`）。`cmd:"echo hi; sleep 2"` → 找 `/bin/echo`（镜像没有，/bin 只有 bash/gctl/w9y）→ 任务起不来。headless 因 wrapper 包 `bash -c '{...}'` 首 token=bash 才没事；`cmd:"bash"` 能成因首 token 可执行。**修法（已做）**：term 任务也包 `bash -c '<cmd>'`（wrapTermCmd，与 wrapHeadlessCmd 对称）；面板仍显示原始 cmd；内核 task.go:322 用 shlex.Split 解析 cmd 属性，单引号转义 `'\''` 实测往返正确（`echo it's fine` → args `["bash","-c","echo it's fine"]`）。**行为级验证待非 CDP 浏览器复跑**（wrap 后 `cmd:"bash"` 变成 `bash -c 'bash'`，外层非交互内层交互，提示符应仍出现）。
10. **CDP 自动化环境干扰**：open-claude-in-chrome 扩展附加调试器时，gojs worker 的 blob 脚本 fetch 永久 pending（网络面板 `blob:` 请求 pending）→ worker 不加载 → 任务 ctl 空、永不 start。**同一调用在无自动化浏览器（用户手动）完全正常**。**结论必须非 CDP 环境复核**；判“卡 vs 慢”：hush wasm（20MB）首次下载+编译 1-2 分钟属正常慢。

**代码健康度（commit `8d34453`）**：500/50 行规则长期漂移已修。拆分前最大文件 home.js=895；拆分后所有 JS 文件均 <500 行（最大 files-info.js=488 是既有债务），所有函数 <50 行；具体拆分详见 commit message 列表。新增 10 个模块（home-data/-sections/-xcards、panels-task、app-shell、app-normalize-system、settings-terminal-presets/-fields、crush-runner-parts、crush-panel-tabs）。版本级联 28 文件 + index.html + verify-static；deno fmt 已跑；ESM check + verify-static 全绿；浏览器实测 GearShell.ping/tasks.create/Crush Runner panel 渲染 OK。期间修了 app-shell.js 的导入 bug（AddTerminalButton/FallbackPanel 实际在 launcher.js，不是 panels.js）— ESM 名导出检查的必要性。

## 四、版本/环境现状

- `WANIX_RUNTIME`（app-constants.js）→ **v0.4.23**（含内核死锁修复 `6686897`，`AutoDriver.Start` 移出 `fsys.mu`）；`DEFAULT_HUSH_BINARY_URL` → **v0.5.9**；模块版本（v0.4.23 级联后，2026-08-29 晚）：app-sessions=v20260828.10、app-workspace-task-sessions=v20260828.10、workspace-api=v20260828.17、app.js=v20260828.26、app-constants=v20260828.9、app-normalize=v20260828.7、panels=v20260812.35（未动）、settings.css=v20260812.29（未动）。
- **浏览器 localStorage 的 runtime pin 是手动的**（迁移只处理 legacy URL/host 不处理 semver pin）：`gear-shell-workspace:hush-shell` 的 `ws.runtime` 已手动升 v0.4.23；下次升 wanix 要再手动。
- **版本级联顺序陷阱**：多个模块共享同一版本 token（如 v20260826.2 有 10+ 个模块）时，token 级联会溢出到非依赖模块 → 必须用**全量传播算法**（dirty 集 + 对每个被改动模块升自身版本再传播到其 importer，直到 index.html 的 app.js），且**先 .5→.6 再 .4→.5 防止 token 冲突**（app-constants 的新 .5 会撞 app-sessions 的旧 .5）。`app.js` 自己的 own-name 与 version key 因 `index.html` 无 `./` 前缀始终不对齐 → 必须手动补升 `index.html` + `scripts/verify-static.mjs`。
- 版本纪律：改模块必须 `?v=` 全树 grep 更新 importers（app.js/workspace-api.js/13 个 app-constants importers 等）；index.html 的 app.js 版本与 `scripts/verify-static.mjs:84` 的 marker 同步；`node --input-type=module --check < file.js` 校验 ESM。
- 500/50 行规则：app-sessions.js 已拆（360 行）；**panels.js(553)/app.js(538)/app-normalize.js(528) 在 HEAD 时已 >500（既有债务，未拆）**。
- `memory/` 是 git submodule（wiki 仓库）：改后 `./scripts/sync-wiki.sh`（会 push wiki）+ `git submodule update --remote memory`（若 untracked 冲突先 `git checkout -- .` 再 update）+ 主仓提交指针。
- **wanix 发布链路（每次改 wanix 都照此）**：`node --input-type=module --check < elements/xx.js` → `make js`（重建 dist）→ commit（elements/*.js + **`git add -f dist/wanix.min.js`**，dist 在 .gitignore 需 -f）→ `git tag vX.Y.Z` → `git push origin vX.Y.Z` → 验证 `curl https://w9y.io/go/github.com/justwasm/wanix/wasm@vX.Y.Z` 头部是 `\0asm` + jsdelivr min.js 含新代码 → GearShell `app-constants.js` WANIX_RUNTIME 升 pin → 浏览器 localStorage `ws.runtime` 手动升 pin（semver pin 不自动迁移）。注意：amend 后 tag 要 `git tag -f` + `push --force`。

## 五、下一步方向（按优先级）

> ✅ 已完成：实时输出流（v0.4.20 write-through，页面零改动）、`_awake` 幂等（v0.4.20）、exec-redirect 源码修复（v0.4.20）、测试任务清理（38+9 个已备份清空）、**真 agent 闭环演示**（`scripts/demo-agent-loop.sh`，沙盒内 agent 用 gear 自驱 create→轮询 output→取结果，实测 CLOSED LOOP OK）、**files-ui 版本分裂**（4 importer 统一 .38，commit `df2c9fa`）。

**搁置（用户决定，面向开发者工具现阶段不做）**：
- ~~agents.prompt 撞车~~（**P2 已实现，commit `6e02434`**）：空闲门控（输出后 1200ms 拒绝 + retryAfterMs）+ 真人门控（onKey 记真人键入，5s 内拒绝，`force:true` 覆盖）+ 串行投递。真人空闲时仍可共享终端；Tier 1 通道隔离（agent 自建任务、拒绝注入真人终端）未做，保持共享体验。
- `/js` 安全收窄（P2）：jsfs 当前 rw 挂所有 task，agent 能读 document/fetch。需要时再做白名单根（内核改动）。

**已解决（2026-08-29 晚）**：
- **console 噪音**：WidgetBot Discord 组件改为 opt-in（`widgetbot` 配置开关，Settings 里有 toggle，默认 off，动态加载）；headless 面板文案改为指向 `gear tasks.output`（不再声称输出进 console）；wanix v0.4.22 移除内核 bind-alloc/fetch-url 调试 println（commit `d92b3f3`）。页面加载 console 已干净。**教训：w9y.io 会缓存 tag 的失败构建（v0.4.21 首次构建失败后同 tag 强推仍 502），必须换新 tag（v0.4.22）**。
- **终端任务内核死锁 = 已修（wanix v0.4.23）**：详见里程碑。死锁栈（archive）：goroutine 8 `Task.Tasks` 等 `fsys.mu`（由 `_updateTerminals` 触发）+ goroutine 30 `GetOrCompile` 等 `WebAssembly.compile` promise + goroutine 1 空 select。假说修正：不是“term 绑定与 start RPC 互等”，而是**持锁等 JS promise**（JS handler 未返回 → 微任务队列不跑 → promise 永不 resolve）。
- **railway 域名退役**：`isLegacyHushBinaryUrl` 原来只比版本不比 host，`w9y.up.railway.app`（bin/bash/bin/w9y 的 fetch bind）带当前版本时不迁移 → 已修（railway host 视为 legacy，迁移到 w9y.io，随 `700d0e8`）。

**环境陷阱（重要，勿再误判为产品 bug）**：
- **CDP 自动化环境下 worker blob fetch 永久 pending**：open-claude-in-chrome 扩展附加调试器时，gojs worker 的 blob 脚本请求在网络面板长期 pending → worker 不加载 → 任务 ctl 空、永不 start。**同一调用在无自动化的浏览器（用户手动）完全正常**。判定：网络面板 blob pending = 自动化干扰；hush wasm 下载/编译中（1-2 分钟）= 正常慢。**结论必须在非 CDP 环境（用户浏览器）复核**。
- **task cmd 直接 exec 首 token**（不经 shell）：`cmd:"echo hi; sleep 2"` 会找 `/bin/echo`（镜像没有，/bin 只有 bash/gctl/w9y）→ 任务起不来。headless 没事因 wrapper 包 `bash -c '{...}'`；`cmd:"bash"` 能成因首 token 可执行。**已修：term 任务也包 `bash -c`（`44fbad5`，见踩坑 9）**；行为级验证待非 CDP 浏览器。

**接下来要做（2026-08-29 晚，更新后）**：
1. ✅ **wrapTermCmd（已完成，commit `44fbad5`）**：term:true 任务 cmd 包 `bash -c '<cmd>'`。已实测（非 CDP 浏览器）：`cmd:"bash"` 交互正常、`echo hi; sleep 2` 可跑、终端版闭环 demo 通过（CLOSED LOOP OK (term)）。
2. ✅ **真 agent 闭环 · 终端版（已完成，commit `d9f5c8c` 脚本 + `936fa40` 时序 + `c48918a` 读回修复）**：`scripts/demo-agent-term-loop.sh`——agent 创建 term:true 任务 → `gear agents.prompt` 注入命令 → 任务写共享 OPFS → agent 用 `read` 内建读回 → `CLOSED LOOP OK (term)`。非 CDP 浏览器实测通过。
3. ~~⬜ wanix v0.4.24:term 任务 stdout 落 term(SetFD 方案)~~(**取消,2026-08-29**)——实测 term 输出路径本来就通(见踩坑 3 与 memory round-11),"断链"是 gojs 冷编译慢 + 内核被压卡造成的误判。留给 wanix 的是回归测试 `task_termfd_test.go`(fd bind → Task.FD → term 数据全链路,含根 "." 绑定干扰场景)。
4. ⬜ **wanix v0.4.25(可选增强,非补断链):内核 tee(fd 1/2 镜像 term + 文件)——无损实时转录**：
   - 动机：`agents.read` 是快照（xterm scrollback 有界、alt-screen 应用只有一屏）；agent 要完整 transcript 目前只能走 headless + tasks.output。
   - 方案：term 任务 stdout 同时写 term 流与 append-only 日志文件；v0.4.20 write-through 后页面 800ms 轮询器（startTaskOutputCapture）零改动即可读 → `tasks.output` 对 term 任务也生效。
   - 意义：交互 agent 拿无损历史；`tasks.output` 的 "task has a terminal; read its panel" 错误分支可删，headless/term 两路 API 统一。
5. ⬜ **wanix:task 退出 → 关 term 资源(term 泄漏清理,可选、低优先)**：
   - **现状(2026-08-29 查证)**:进程退出后 `#term/<id>` 资源在内核永不释放——`wanix-term` 元素断连只 `_term.dispose()` 不碰内核资源(`elements/term.js:81-89`),`wanix-task` 断连只 `ctl terminate` 不释放 term(`elements/task.js:158-161`);`PortFile.Close` 是 no-op(`fs/pipe/portfile.go:29`)所以进程退出不会 EOF 管道。agent 长会话反复建 term 任务 → 内核 term 资源无限累积(单资源几 KB,慢腐烂非急性)。
   - **相关已提交**:wanix `1a56988`(term fd 回归测试 `task_termfd_test.go`)、`7f78e8a`(启用 programFile EOF 移除 + 修 `d.remove` Lock/RLock 死锁)。**注意**:EOF 触发需要有人读 program 侧,浏览器没人读 → 该修复本身治不了浏览器泄漏,只是铺好钩子。
   - **方案(三件套,每步独立测试)**:①内核给 `#term/<id>` 加 `ctl` 字段文件处理 `"close"`(给 `d.remove` 公开调用面,零行为变更,纯增量可测);②内核监视器照抄 `spawn.go:243 monitorChildExit`——分配带 term 的任务时起 goroutine 盯 `task/<rid>/exit`,非空即关 term(直接调 `d.remove` 或走 ① 的 ctl,统一入口是设计选择非硬依赖);③`task.js disconnectedCallback` 在 `ctl terminate` 外补关 term(面板关闭即释放)。
   - **顺序理由**:行为变更最小化(先加"删除原语"再加"触发源")+ 纯内核可测先行(快、确定)、浏览器验证最后(慢、环境干扰)。风险点:term 被移除时 `wanix-term` 元素重连流要宽容"资源消失"(P2 已踩过 xterm 重建同类问题)。
   - **价值评估**:不是急性 bug;真正重的是 gojs worker 泄漏(已由 ephemeral 默认解决),term 是第二阶。做不做取决于 term 任务是否为 agent 常用形态。

### 调查存档（已解决，勿重开）

- **exec-redirect 源码调查**：根因 = fskit nodeFile 缓冲（见踩坑 5/6），v0.4.20 已修。过程中的有价值结论：go4js 工具链在 `/Users/gear/Documents/GitHub/go`（Go 1.27 + go4js.1 fork，HEAD d90a163e71）；`src/syscall/fs_js.go` `syscall.Write(fd)` 统一 `fsCall("write",...)` 无 fd 1/2 特殊路由（go4js 层干净）；`Dup2` 在 go4js 是 `ENOSYS`（但 mvdan/sh 重定向是 io.Writer 级、从不调 dup2，故无关）；wanix `Task.FD`（task.go:243）fd<3 未注册时走 `VFSOpen` → `#task/<rid>/fd/N` 绑定。上游 mvdan v3.11.0 `defer cls.Close()` bug 可选提 PR。

## 六、浏览器测试环境速查（CDP MCP）

- 页面：`http://localhost:8000/`，workspace `hush-shell`；tab 需 `tabs_context_mcp({createIfEmpty:true})` 拿 tabId。
- 常用验证：`performance.getEntriesByType('resource')` 确认 `?v=` 模块真实加载；`window.GearShell.ping()` / `tasks.list()` / `tasks.output(id)`；`window.__wanix["1"].root.readText/readDir`（async，await）；`.task-headless` 面板 DOM 检查 cmd/workdir/env。
- 踩坑：扩展偶发断连（`Browser extension is not connected`，等/重开页面）；`root.readText` 偶发挂起（内核卡时，包 try/catch）；**别碰 `term._writer`/`term._reader` 私有字段**（会 60s 超时）；探测脚本别写成一个长表达式。
- **CDP 环境陷阱**：open-claude-in-chrome 扩展附调试器时 worker blob fetch 永久 pending（任务永不 start），**结论必须非 CDP 环境复核**。判“卡 vs 慢”看网络面板：blob: pending = 自动化干扰（自动环境特有）；hush wasm 下载/编译 1-2 分钟 = 正常慢（首次）。
- 直调 API 注意：`tasks.create` 传**对象**（jsfs 展开数组，传数组报 "A command is required."）；`cmd` 任意 shell 语法均可（GearShell 已包 `bash -c`，`44fbad5`）；镜像 /bin 只有 bash/gctl/w9y。

## 七、UX Wishlist 会话（2026-08-28 下午，已提交 edf7157 + 本轮未提交）

> 详情见 `memory/ux-wishlist.md`（功能）与 `memory/gctl-examples.md`（已验证调用清单）。

### 交付功能（浏览器实测全过）

1. **Markdown 预览**：files 编辑器 Eye 切换渲染/源码；`marked` + **DOMPurify**（index.html 新增 CDN）净化，XSS 实测（onerror/script 被剥）
2. **iframe popout 按钮**：wrapper 右上角（hover），`window.open(src,"_blank","noopener")` 真 tab
3. **视频 PiP**：`.files-pip-button`
4. **分屏「在新窗格打开」**：`addPanelByComponent` 单点 `options.direction` → `api.addGroup({referenceGroup, direction})`；launcher「+」菜单 Shift+点击 = 右侧新窗格 + hint
5. **多行标签**：`overflow: { mode: "wrap" }`
6. **gear open 双路由**：`open <url>` → `browser.open`（任意 URL iframe 面板）；`open <file>` → `files.open`（文件浏览器预览，**audio 自动播放**——autoPlay 实测 t=1.2s paused:false）
7. **新窗格参数统一**：`{ group?, referencePanel?, direction? }` 覆盖 panels.open / browser.open / tasks.create / files.open；`panels.list` 暴露 `groupId`
8. **gear 脚本现代化**：bash `[[ ]]` 全构造 hush 实测解析执行 OK；纯内建 dirname/basename（镜像无）；`$1/$2` 需 hush v0.5.9+

### 代码健康度（500/50 行回归）

- **workspace-api.js 869→131**：拆 7 part（events/open-api/config-api/tasks-api/agents-api/task-registry/gctl-bind）
- **files-parts.js 529→269**：FilesEditorPane 拆 files-editor-pane.js 并重构为小组件
- 新工具：`scripts/cascade-bump.mjs`（?v= 全量传播）、`scripts/fn-length-audit.mjs`（>50 行函数扫描）、`scripts/token-scan.mjs`（token 一致性，抓版本分裂）
- **抓到的版本分裂**：parts 硬编码旧 token（4 处）→ 双实例 → "dockview not ready"；已对齐（0 SPLIT）
- **剩余既有债务**：50 行 ×28（FilesPanel 165L、TerminalPresetIconPicker 289L 等，会话前已有）、500 行 ×1（scripts/cdp-mount-test.mjs 600L）

### 版本/环境现状

- `WANIX_RUNTIME` v0.4.23 未动；app.js **v20260828.47**；workspace-api 拆 7 part 后 token 各自独立（events .2、open .4、config .4、tasks .4、agents .1、registry .4、gctl-bind .4）
- **新踩坑**：①wanix 根 FS **reload 即重置**（root.writeFile 的文件刷新消失，测试须同一 page load 内完成）②`root.readDir(".")` 返回**路径字符串**数组非 entry 对象 ③GearShell ready ≠ wanix root ready（写文件要重试等 wasm）④agent 调用无手势，`window.open` 必被弹窗拦（真 tab 只能 popout 按钮）
- memory 子模块：ux-wishlist.md / gctl-examples.md 新增，Home.md 索引已加

## 八、wanix v0.4.24 内核修复 + 下一步方向（2026-08-28 晚）

### 本次发布（已完成，勿重复）

- **wanix v0.4.24**（push 完成，w9y.io wasm + jsdelivr min.js 实测 200）：
  - `f02ad33` jsfs `bad type flag` 崩溃——`safeType()` 防御分类 + 枚举/路径解析逐值降级（`ls /js/document:obj` 不再崩内核）
  - `bac00e5` 任务启动死锁——driver Check 移出 TaskFS 注册表锁 + idbfs `_openDB` 3s 超时/onblocked/重试；VM 激活——`vm.Device`/`VM` 实现 `fs.RouteFS`（chmod/writeFile 下钻）+ worker.go Resolve 断言修正
- **gearshell**：app-constants WANIX_RUNTIME → v0.4.24，cascade 至 app.js **v20260828.48**（commit fb64bc6/4c4ee2b/0fd45f6/acfc974/614dfef 全 push，与 origin 同步）
- memory 已同步 wiki：wanix-jsfs-crash.md / wanix-routfs-device-namespaces.md / lessons.md（`/js` 禁区、探针数括号、RouteFS 规则）

### 下一步方向（按推荐顺序）

1. ~~**B1：`tasks.create({background:true})` ResizeObserver 报错**~~ **已修（2026-08-28 深夜）**：
   根因是 background 任务默认带 term（normalizeTask `term !== false`），而 background 分支传的
   anchor 是 `null` → `attachOverlayTerminalSession` 里 `ResizeObserver.observe(null)` 抛 TypeError。
   修复：`app-workspace-task-sessions.js` `attachWorkspaceTaskSession` 对 `!session.term || !anchor`
   都走 wake 分支（跳过 overlay）。实测 `tasks.create({cmd:'gear panels.list'},{background:true})`
   → `ok:true`、无报错；term/无 term 两种 background 任务均正常跑完并 cancel 干净。
   **附带发现并修复**：`panels.open('vm', {})` 把 options 泄漏成 VM config（`addPanelByComponent`
   把第 4 参 options 传给 adder 的第 3 参 config/profile 槽）→ `config.backendUrl=undefined` →
   v86 归档 bind src=null → 404「Failed to fetch archive null」。修复：addPanelByComponent 不再把
   options 传给 PANEL_ADDERS（direction/group 已在上方消费）。VM/workbench/terminal 经 API 打开
   现在都用默认 config。
2. ~~**B2：VM 面板启动恢复验证**~~ **已过（2026-08-28 深夜）**：restoreTabs=true + 保存 VM 面板后
   reload，home+vm 恢复、`wanix-vm` 重建（vm-panel-1 + term 连接 `#vm/vm-panel-1/term`），
   全程 0 console error——无 deadlock、无 `chmod #vm/1/alias` 激活错误（对比 v0.4.23 时代的报错）。
   workspace 已还原（restoreTabs=false、VM panel 关闭）。
3. ~~**A：代码健康债**~~ **已清（2026-08-28 深夜）**：`fn-length-audit` 0 violations（原 28→34 个 >50 行函数全部
   拆完：FilesInfoPane 396L 拆为 files-info-pane.js + files-info-pane-body.js + helpers；useCrushRunnerPanelController
   281L 拆 3 sub-hooks + 6 模块函数；TerminalPresetIconPicker 289L 拆 catalog/categories/keyboard；useCrushPresetCrud、
   useFilesActions/useFilesEditor、files-tree/files-topbar/files-mounts/files-context-menu/files-favorites-ui/
   files-resize/files-panel-sections、AddTerminalButton、launcher/settings-launcher/home-sections/runtime/
   settings-terminal-presets/app-terminal-sessions 全部 ≤50）；`scripts/cdp-mount-test.mjs` 600L 拆出
   `cdp-mount-driver.mjs`（419+190，冒烟通过）。验证：fn-length-audit 0 + token-scan 0 SPLIT + verify-static +
   deno fmt --check 91 文件 + eslint 0 errors + ESM check + ?v= 一致性全绿；浏览器实测 Files 面板（tree/topbar/
   info grid↔list/排序/选择/volumes/favorites）、Crush Runner、Settings launcher-order、IconPicker（动态挂载
   1549 图标 + 6 分类）、background 任务全过。
4. **C：wanix term-leak 收尾**（TODO 五的剩余）：task-exit 监控（spawn.go:243 模式）+
   `task.js` disconnectedCallback close + 内核 ctl "close" 文件；改后 `go test -count=1 ./term/ ./`，
   发 v0.4.25
5. **B3：任务输出读取 UX**——`tasks.output` 对带终端任务返回 "read its panel"，agent 读输出绕
6. **D：竞赛交付物**——docs/、神奇海螺队-第一轮评审/、README/TODO 均 untracked；README 补 v0.4.24 能力

### 环境备忘

- 测试 tab 590428658/590428736：workspace runtime 已清 override（用 CDN v0.4.24 默认）
- dev server：localhost:8080 python ThreadingHTTPServer（本次会话一直在线）
- wanix 本地仓库 /Users/gear/GitHub/wanix（= /Users/gear/Documents/GitHub/wanix 同 inode），dist/wanix.debug.wasm 为本地产物（gitignored）
- 死锁/崩溃复现姿势：`ls -la /js/document:obj`（旧内核崩）、多 tab 同开同 workspace（idbfs blocked）、保存 VM 面板后重启

## 九、低垂果实盘点(2026-08-29,agentic workspace 收尾候选)

> 基于 milestone 表(M1-M5/P2)+ 评测缺口(#1-#8)逐项核对代码现状。纯 app 侧、
> 无内核改动的优先;内核项单列(非低垂)。详细分析见 memory/agentic-workspace.md
> 「低垂果实盘点 2026-08-29」。

**已落地(勿重复)**:M0 桥、config/panels/browser/files/tasks/agents/events 全
namespace、headless 输出捕获+实时流、P1 临时任务+GC、P2 终端读屏+双门控、
评测 #1/#3/#4 已通、A 代码健康债清零、B1/B2 修复。

**低垂果实(按优先级,全部 app 侧)**:
- ✅ **A1(#8/M2)配置审计环 + Settings「Agent Activity」+ undo**:workspace-audit.js
  (localStorage 环,封顶 50)+ `config.audit.*` + updateShell 审计包装(字符串或
  options 第二参都收);Settings agent-activity 区(条目 + Undo + before/after
  diff + Clear)。浏览器实测 14 项全过(API+UI)。
- ✅ **A2(#6 最小形态)事件持久化**:workspace-events.js 落盘 + 高水位 drained,
  跨 reload 不重投;boot seedEventBuffer。实测 emit → reload → drain 读回 → 不重投。
- ✅ **A3 `gear help`**:方法清单 + examples(heredoc);`gear version` 映射 ping。
- ✅ **A4 `gear agents.prompt-wait <id> <text> [timeout]`**:bash 重试糖 +
  `_ge_json_escape` 纯 bash 转义;JS 单引号 `\"` 被吞的坑已修(`\\"`)。
- ✅ **A5(M5 降级 + D)README/docs**:README 加 Agentic Workspace 章节 + v0.4.24
  能力;browser 降级文档化。
- ✅ **A6 scripts/demo-agentic-eval.sh**:#1/#3/#4/#8 一条脚本。**真实浏览器已跑**
  (MCP 扩展,2026-08-29,详见 round-19):稳定 PASS 8/9——#8/#3/#4/A3 全绿;
  #1 在扩展附着会话下 term worker 输出被环境阻塞(headless 全通,eval2 同会话
  提示符曾渲染 → 间歇性),非扩展真实浏览器应全绿待复核。修过的脚本 bug:
  ①tasks.output 用 panelId 提取数字 session id(create 返回 UUID taskId);
  ②#4 只比 workspace tasks 数组(updatedAt 每次 save 都变,尾部对比误伤);
  ③#1 注入前等 `➜` 提示符(冷编译窗口注入被吞);④set -u 下 read 前初始化 line。
  另修真 bug:crush recheck 崩溃(ctl 漏 programAutoManagedRef)。

- ✅ **M4 音乐面板 + `gear music.*`**(round-18 初版 + **round-23/24 补全**,
  commit 84ee6b4/f5f3b7b):
  - round-18:music-engine.js(单例 `<audio>` + 异步 VFS 解析)+ music.js 面板 +
    注册链 + workspace-api music 命名空间 + gear help;autoplay 政策下 agent 调用
    停在 paused,真人点击面板即播。
  - **round-23**:队列/播放列表 + 三档循环 + 自动连播;audio-tags.js(ID3v2 元数据 +
    USLT/.lrc 歌词);VFS 文件选择器(vfs-picker.js 可复用);tab 右键 Duplicate。
  - **round-24**:进度条 Seek、拖拽排序、随机播放、多命名歌单(localStorage)、
    历史去重 + 播放次数徽标。详见「十、轮次 23/24」+ memory/music-player.md。

**内核/搁置(非低垂)**:C1 wanix v0.4.25 term-leak 三件套(可选)、C2 内核 tee
(可选增强,tasks.output 对 term 任务生效)、C3 P2 /js 安全收窄(设计搁置)、
#2 Tier-1 隔离(刻意保留共享终端;agent 自建任务即可自隔离,无需代码)。

## 十、轮次 23/24:Music 播放器补全 + 可复用 VFS 选择器 + tab Duplicate(2026-08-29,已提交)

> commit:`84ee6b4`(round-23)、`f5f3b7b`(round-24)+ 各 memory 指针提交。全部浏览器实测。

### round-23:基础能力(commit 84ee6b4)
- **可复用基础设施 `vfs-picker.js`**:Wanix FS 文件选择器(单/多选、扩展名过滤、
  面包屑 + 路径直达、键盘导航),与 Files 面板同一 readDir 契约,样式独立
  vfs-picker.css(z-index 1100)。任何"从 FS 选文件"的面板可复用。
- **Music 播放器(网易云式基础)**:music-engine 加队列 + 三档循环(off/all/one)+
  自动连播;`audio-tags.js`(零依赖)ID3v2 元数据 + USLT 歌词 + `.lrc` 侧车解析;
  面板加 Playlist 区 + 歌词滚动高亮 + Browse 按钮。
- **dockview tab 右键菜单 Duplicate**:`getTabContextMenuItems`(Pin 自动前置),
  仅 content 面板(home/deck/settings/files/runtime/music/fallback);同组内源 tab
  右侧打开 + rememberOpenPanel 保持久化。实测 files-1/files-2 并存,各自独立目录。
- **Launcher 溢出修复**:卡片 680px 在矮视口被 grid 居中裁切 → `.fallback-panel`
  改 flex + `overflow-y:auto` + 卡片 `margin:auto`;顺带修 `moreOptions.map(renderRow)`
  ReferenceError(应为 rowFor)。

### round-24:播放器补全(commit f5f3b7b)
- **进度条/Seek**:`musicSeek(seconds)` + MusicSeekBar(range slider,拖拽本地值 +
  pointerup 提交);根因修复——audio 事件补 `loadedmetadata/durationchange`
  (paused 时 duration 才进得去状态)。
- **播放列表拖拽排序**:`musicReorderQueue(from,to)`,播放指针钉住原曲;面板行
  draggable + drag-over 高亮(真实鼠标拖拽可用,合成 DragEvent 不触发 React onDrop)。
- **随机播放**:`musicSetShuffle(on)`,next/ended 随机挑非当前曲;面板 Shuffle 按钮。
- **多命名歌单**:`music-playlists.js` localStorage 持久化(gearshell.music.playlists.v1),
  save/load/rename/delete/list;面板 dropdown + Save/Rename/Delete。
- **历史去重 + 播放次数**:recordHistory 按 src 合并置顶 count+1,面板 `×N` 徽标。
- **500 行拆分**:music.js 581→321 + music-panel-parts.js(334)+ music-playlist-ui.js(228);
  engine 481(歌单持久化拆 music-playlists.js)。

### 环境备忘(round-24 更新)
- 全部新 API 经 gear `music.*` 暴露(jsfs 同步);面板/API 同一 engine 单例。
- 可复用参考:`memory/music-player.md`(模块结构 + API 表 + vfs-picker 复用手册)。

## 十一、用户 WISHLIST(2026-08-29,全部未开始)

> 用户明确提出的长期愿景,按原话整理;每条附实现锚点(现有代码/机制),未做任何一条。

1. **设置中加模型 provider 配置能力,并暴露给 gear**
   - 内容:Settings 新增 provider 管理(name/baseURL/apiKey/model 列表,可增删改),
     存入 workspace config(`config.*` 已可被 gear 读写,settings 已有
     launcher-order/terminal-presets 同款模式可抄);gear 暴露 `config.providers.*`。
   - 锚点:settings-panel.js 分区模式、workspace-config-api.js(getSystem 等)、
     gear-bind.js help 扩展。⚠️ apiKey 属敏感字段,审计环(workspace-audit)要脱敏。
   - ✅ 配置层 + gear + 脱敏已实现(2026-08-29,round 26):`config.providers`
     存 shell config,`config.providers.list/save/remove` 经 gear 暴露,审计/读取
     全链路 `redactSecrets` 脱敏,空 apiKey 保存保留存量 key。UI 在 Playground
     Providers tab(playground-providers.js);如需 Settings 出入口,复用该组件。

2. ✅ **Home 直接用 GearShell API 实现面板操作**(2026-08-29 已实现,见「十二、
   轮次 25」):`window.GearShell.panels.open(component, options)` 就是 gear 的
   JS 本体(workspace-api.js:112),Home 按钮改调它,与 agent 通道同一 API、白拿
   分屏参数 + 审计。home.js openPanel 保留 addPanelByComponent 作 fallback
   (API 未就绪时)。`gctl`→`gear` 重命名已解耦,单独成项或砍掉。

3. **iframe 本地网页支持**
   - 内容:browser.open 现在只收 http(s)://(非 http(s) 返回 error),本地页面=
     打开 Wanix VFS 里的 html/资源。可行路线:Service Worker 拦截一个虚拟
     origin(如 `https://vfs.local/<path>`),从 `getWanixRoot().readFile` 供资源,
     iframe 指过去即得"本地网站"体验(子资源相对路径天然可用)。
   - 锚点:browser.open(workspace-open-api.js)、app-sessions.js iframe 会话、
     vfs-picker.js 路径语义可复用。

4. **AI 聊天、生成视频、生成图片等功能**
   - 内容:依赖 #1(provider 配置)。聊天面板(流式输出)、图片/视频生成工具。
     生成结果落 VFS(`/opfs`),Files 面板直接可见;gear 暴露 `ai.*` 供 agent 调用。
   - 锚点:依赖 #1;面板注册走 addPanelByComponent 目录;流式可借鉴
     tasks.output 800ms 轮询 / term 通道。

5. **账户登录 + 云同步**
   - 内容:登录后把 workspace 配置/面板布局同步到云端,换设备恢复。
   - 锚点:memory 子模块已走 git wiki 同步(scripts/sync-wiki.sh)——云同步
     可复用同一 git 通道(workspace JSON 入 wiki 仓库私有分支)或接后端;
     序列化已就绪(workspace.ui.dockviewLayout 布局持久化,round-21)。

6. **远程资源挂载**
   - 内容:Files 侧栏现在只能挂本地目录(File System Access API);远程
     WebDAV/S3/git/ssh 挂成 `/mnt/<name>`。
   - 锚点:files-mounts.js(bindLocalDir 模式)、wanix RouteFS
     (设备命名空间下钻,见 wanix-routfs-device-namespaces.md)。

7. **自我修改、发布**
   - 内容:shell 内的 agent 能改 GearShell 自身(源码/配置)并发布新版本。
   - 锚点:自我修改 = agent 编辑 OPFS 工作副本 + reload 生效(静态无构建,
     利于此);发布 = 现有 deploy 链路(scripts/sync-wiki.sh、deploy-site)扩展到
     主站产物。

8. **save as mhtml 后仍能正常工作**
   - 内容:浏览器"另存为 MHTML"单文件快照后,打开快照仍能跑起来。
   - 现状障碍:buildless 多模块 + `?v=` 版本化 + importmap(esm.sh CDN)+
     Worker → MHTML 快照只有内联的静态资源,ES module 相对导入在 file:// 快照
     下全断。可行路线:新增一条打包产物链路(esbuild/rollup 把全部分子内联成
     单 HTML,或 `shell.mhtml` 发布件),与"无构建"开发态并存(发布件生成属
     scripts/ 工具,不改开发工作流)。

9. **tab/app 系统可扩展(future-proof architecture)+ 插件市场**
   - 内容:任何开发者能发布自己的 tab/app 给别人用,shell 里有插件市场。
   - 现状:组件目录集中硬编码(app-shell.js PANEL_COMPONENTS)、launcher 目录
     静态(app-constants PANEL_CREATION_OPTIONS + 图标映射)。
   - 可行路线:①运行时插件 API——`registerPlugin({id, component, params, icon})`
     (dockview 本就支持运行时注册组件,lucide 图标目录已中心化);②远程加载
     (importmap 扩展 / 动态 import 插件 URL);③市场目录(JSON 清单 + 安装/更新
     按钮,进 launcher + Settings 插件页)。

## 十二、轮次 25:Home 接入 GearShell API(2026-08-29,已提交)

- commit:`<本轮 commit>`,home.js openPanel 从 DI 注入的 addPanelByComponent
  改为 `window.GearShell.panels.open(component, options)`(API 未就绪时 fallback
  回直连 adder)。
- 收益:Home 与 agent 走同一 API 通道(分屏 direction/group 参数可直接传)、
  workspace-audit 事件覆盖 Home 操作;按钮调用点(home-sections 三处)零改动。
- 实测:Home「Open Terminal」→ terminal-1 面板 + xterm 入 DOM;「Browse apps」→
  fallback launcher 打开;console 无新报错。

## 十三、轮次 26:GearShell API Playground + Provider 配置(2026-08-29,已提交)

- commit:`<本轮 commit>`。新面板 `playground`(launcher 可见,可 Duplicate),
  三个 tab:Explorer / Providers / Events。
- **Explorer**:`playground-api-catalog.js` 手写全量 API 目录(59 个方法,9 个
  分组:Root/config/panels/browser/files/tasks/agents/music/events),每方法
  带参数 schema(string/number/boolean/json/handler)、hint、gear 等价命令;
  运行走 `window.GearShell`(与 gear 同桥),JSON 结果 + 请求历史;点状方法名
  (`config.providers.save`)按段解析。
- **Providers**(WISHLIST #1 的配置层):provider 存 shell config
  `config.providers`,app-normalize 归一化,DEFAULT_CONFIG 加空数组;gear 暴露
  `config.providers.list/save/remove`;UI 增删改(编辑时空 apiKey 保留存量 key)。
- **Events**:live `gear-shell:*` feed(patch window.dispatchEvent 观察,不动
  agent 的 ring;drain 需手动点)+ pending 计数 + emit 表单。
- **密钥脱敏**:`workspace-audit.js` 新增 `redactSecrets`(递归把 apiKey 置 "")
  ——getShell/getSystem/getWorkspace/providers.list/audit.list 全部脱敏;
  `updateShell` 对 providers 按 id 回填存量 key(脱敏 getShell 往返不丢 key);
  审计环存原始快照、读取时脱敏,undo 仍还原真实数据。
- 实测(浏览器):59 方法全渲染;panels.list/tasks.create(music.nowPlaying/
  config.getShell 等经 UI 运行成功;providers 增删改 + 空 key 保 key + 换 key;
  getShell 渲染 apiKey:"" 无泄漏;Events emit/drain 正常;console 零报错。
- ⚠️ WISHLIST #1 的 UI 放在 Playground 而非 Settings(用户本轮的指示优先);
  如需 Settings 也出入口,复用 playground-providers.js 组件即可。

## 十四、轮次 27:插件内核(WISHLIST #9 切片 1)+ Music 插件化(2026-08-29,已提交)

- commit:`<本轮 commit>`。新增 `plugins.js` 运行时插件内核 + `music-plugin.js`
  (Music 变成第一个插件,dogfood)。
- **加载**:`config.plugins`(shell config,normalize 合并 DEFAULT_PLUGINS,用户按
  id 覆盖内置)→ `registerPlugin(manifest)` → `import(entry)`。entry 三种:
  http(s) URL(需 CORS)/ `/` 同源路径 / `vfs:/...`(readFile → Blob,单文件)。
  模块约定:`export function register(ctx)` 或 `plugin.register(ctx)`。
- **注册**:`ctx.registerPanel({component,label,icon,title,render})` → 直接 mutate
  `PANEL_COMPONENTS`(dockview 在 addPanel 时按名实时查 components[name],已对
  v8.2.0 源码核实)+ `PANEL_CREATION_OPTIONS` push + 未知名类型补进
  DEFAULT_LAUNCHER_ITEM_ORDER;`panels.open("music")` 与 launcher 经
  panels.js `addPanelByComponent` 的 openPluginPanel 分支路由(通用 opener:
  `${component}-<n>` id + rememberOpenPanel)。
- **权限(T1 护栏)**:`createScopedApi(api, allow)` —— Proxy 按点号路径解析,
  通配 `panels.*`;未授权返回 `{ok:false, error:"permission denied: path"}`;
  manifest `permissions.api` 声明(内置 music:music.* + panels.open/list)。
  T2 iframe postMessage 桥是后续切片(真正可强制)。
- **Music 去硬编码**:app-shell PANEL_COMPONENTS / panels.js PANEL_ADDERS /
  app-panels PANEL_CREATION_OPTIONS 三处删掉 music;music.js 删除
  initMusic/addMusicPanel/nextPanelIndex;launcher 顺序保留(位置不变)。
- **实测**(浏览器):boot 后插件内核 `listPluginPanels`=[music]、load ok;
  `panels.open("music")` → music-1;launcher Music 行点击开面板(点按钮而非
  行 div);Music 面板渲染 + `music.nowPlaying` 正常;`createScopedApi` 拒绝
  ping/允许 config.getShell 与 config.providers.*;VFS 插件(`vfs:/opfs/...`)
  注册 + 打开成功。console 零真实报错(仅 scratch 测试组件的预期 React 报错)。
- ⚠️ 踩坑:`normalizePlugin/normalizePlugins` 首次 edit 静默失败(modified since
  last read),浏览器报 "app-normalize.js does not provide an export named
  normalizePlugin" 才抓到 —— ESM 检查不查缺导出;edit 失败必须重试确认。
- 后续:Plugins 设置页(安装/启停/权限编辑)、T2 iframe 桥、市场(JSON 清单)。

## 十五、轮次 28:Plugins 设置/管理页 + config.plugins API(2026-08-29,已提交)

- commit:`<本轮 commit>`。Settings 新增「Plugins」分区(settings-plugins.js +
  settings-template 区块 + settings.css 样式),配套 `config.plugins.*` API。
- **API**(workspace-config-api.js,与 providers 同款:存 shell config、写路径
  审计):`config.plugins.list / install / remove / setEnabled`。jsfs 同步桥 →
  写 config 后 fire-and-forget 重载内核(`unregister + register`);
  `list()` 合并内核实时状态(loaded / loadError / panels / builtin)。
- **UI**:列表行(built-in/enabled/disabled/loaded/load-error 徽章、面板名、
  错误信息)+ Enable/Disable/Edit/Remove 按钮;Add/Edit 表单(id/name/
  version/icon/entry/permissions 每行一条);built-in 只能禁用不能删;
  PLUGIN_CHANGED_EVENT + WORKSPACE_CHANGED_EVENT 双刷新。
- **内核扩展**(plugins.js):`unregisterPlugin(id)`(关面板→删组件/launcher
  条目/顺序,顺序关键:先关面板再删组件,否则 dockview 渲染已开面板撞缺失
  组件 → 整个 grid 崩)、`mergePluginStatus`、PLUGIN_CHANGED_EVENT 事件。
- gear help + playground catalog 加 config.plugins.*。
- **实测**(浏览器全生命周期):Settings UI 安装(VFS 插件)→ loaded → 打开面板
  渲染 → Disable(面板关闭 + 注销,无崩溃)→ Enable(重载)→ Remove(卸载 +
  审计条目);坏 entry → load-error 徽章显示错误;console 零报错。
- ⚠️ 本轮踩坑(全部已修 + 记 memory):
  1. queryElements 漏 addButton(edit 静默失败)—— 按钮永远找不到;
  2. pluginActionButtons 解构名与 actions 返回键不符(onToggle vs
     togglePlugin)—— 监听器绑到 undefined;
  3. unregisterPlugin 先删组件后关面板 → dockview 崩(改先关后删);
  4. **?v= 版本分裂三处**(app-panels-store@59/62、playground-parts@13/14、
     workspace-config-api@43/47):cascade 单次只抬一级,落后的文件永远差一档;
     plugins.js 的 getDockviewApi 拿到空实例 → 面板不关闭。写了个全库引用
     审计脚本(统计每模块所有 ?v= 引用去重)手工对齐,并手工改 settings-plugins
     的 plugins.js 引用。
- 待办:Plugins 市场(JSON 清单 + 安装按钮)、T2 iframe 桥、plugin 更新机制
  (同 id 重装 = 更新)。

## 十六、内置 panel 批量 plugin 化 — iframe 插件 + deck(round 29,commit `<本轮 commit>`)

- **研究结论**:内置 panel 三类可 plugin 化 —— ①iframe 配置型(rickroll /
  browser / bonsai / codigo / crush)②React 组件 + DI 型(music 已做,deck 本轮
  以「注册型插件」方式做:deck-plugin.js 只管 registerPanel,deck.js 的 initDeck
  dep shim 保留在 app.js)③内核持有型(home/settings/files/runtime/terminal/
  workbench/vm/group/task/fallback)不可 plugin 化(boot 兜底 + 会话持有)。
- **内核扩展**(plugins.js):`registerIframePanel` + `getPluginIframeConfig` +
  `registerSyncPlugins()`(boot 同步注册 entry-less iframe 插件,消除启动竞态);
  `ensureRestorable`(插件组件推入 STARTUP_PANEL_TYPES,修复 music 面板重载不
  恢复的 round 27 遗留);unregister/mergeStatus/list/is 全覆盖 iframe。
- **迁移**:IFRAME_PANEL_OPTIONS 删除;deck + 5 iframe 进 DEFAULT_PLUGINS
  (built-in 可禁用不可删);DEFAULT_LAUNCHER_ITEM_ORDER / STARTUP_PANEL_TYPES
  / DEFAULT_COLLAPSED_LAUNCHER_ITEMS 保留为持久化 allow-list。
- **实测**:7 插件全 loaded;open/render/disable/enable 全生命周期无崩;
  startupPanels 里 iframe 插件(rickroll)启动即开(同步注册生效),组件插件
  (deck)启动兜底 Home(T1 异步固有,已接受);console 零报错。
- 待办:Plugins 市场(T2 iframe 桥之后)、T2 桥、plugin 更新机制。

## 十七、Settings 组件化 + Plugins 独立页面(round 30,commit `<本轮 commit>`)

- **研究**:Settings 分区可插件化 —— 内核 `registerSettingsSection({id,label,
  render})` + listSettingsSections()(SettingsPanel 挂载时追加 `<details>` 分区);
  ctx.api 与面板插件同款权限裁剪。**dogfood**:Plugins 分区走该 API
  (settings-plugins.js),第三方照抄。
- **抽取**:Plugins 管理从 Settings 折叠块迁出为独立面板 plugins-panel.js
  (launcher + panels.open 可达),Settings 留紧凑卡片(N installed · M enabled
  + Open plugins page 按钮,scoped api 打开)。
- **美化**(plugins.css):渐变 header、卡片网格、lucide 头像、动画 toggle、
  彩色徽章、hover 浮起、错误横幅、空状态;**模态框** Add/Edit 表单支持
  Module / Iframe app 双形态(entry+permissions 或 src+allow+allowFullscreen),
  编辑态 id 锁定。
- **修 round 29 bug**:unregister 对 iframe 面板漏清 PANEL_CREATION_OPTIONS /
  DEFAULT_LAUNCHER_ITEM_ORDER(提前 return),卸载后 launcher 残留;已修。
- 实测:7 卡渲染、toggle 禁用、模态框装 iframe 插件、Settings 卡片计数/开面板、
  launcher 无残留、console 零报错。
- 待办:Plugins 市场(T2 桥后)、T2 iframe 桥、plugin 更新机制。

## 十七b、group 面板 plugin 化(round 30b,commit `<本轮 commit>`)

- GroupPanel(静态图)迁为插件 group-plugin.js;panels.js addGroupPanel /
  PANEL_ADDERS 条目删除,app-shell / app-panels 移除注册;DEFAULT_PLUGINS 加
  group。可 plugin 化的面板至此全部迁完(music 27、deck+iframe 29、group 30b)。
- 实测:8 插件 loaded、open 渲染、launcher 有 Group、disable/enable 正常。

## 十八、web-pet + widgetbot 插件化(round 31,commit `<本轮 commit>`)

- 内核第三种注册 `registerOverlay`(shell chrome):PluginOverlays(app-shell)
  订阅 PLUGIN_CHANGED_EVENT 渲染;manifest enabled 管可用性,config 标志
  (wagiDogEnabled/widgetbot)管可见性(两级开关,遗留开关不变)。
- web-pet-plugin.js(WagiDogPet overlay)+ widgetbot-plugin.js(WidgetBotOverlay,
  widgetbot.js 改 React 组件,注入逻辑不变)。
- 实测:10 插件 loaded;pet/crate 在标志持久后启动即出现;disable/enable 全
  生命周期无崩;console 零报错。

## 十九、runtime + playground 插件化(round 32,commit `<本轮 commit>`)

- 迁移评估:13 内置面板中 settings/plugins/fallback/iframe 为内核身份不迁,
  terminal/vm/task 高风险低价值,低难度叶子面板(runtime/playground/home/
  files/workbench)可迁。
- runtime-plugin.js + playground-plugin.js:ctx.registerPanel 注册;
  addRuntimePanel/addPlaygroundPanel + PANEL_ADDERS 条目删除(通用 opener
  等价);playground 的 initPlayground DI shim 整体移除(app.js 联动)。
- DEFAULT_PLUGINS 加 runtime/playground;PANEL_COMPONENTS /
  PANEL_CREATION_OPTIONS 移除对应项;cascade → app.js?v=20260828.117。
- 实测:12 插件 loaded;两面板 open 渲染正常;launcher 可见;disable/enable
  生命周期无崩;console 零报错。
- 下一轮候选:home(需处理 addPanelByComponent 默认 fallback 分支)→ files
  → workbench。crush-runner 按信任定位留内核。

## 二十、home + files + workbench 插件化(round 33+34,commit `<本轮 commit>`)

- **round 33 home**:home-plugin.js 注册 LandingPanel;home.js 不动(initHome +
  addLandingPanel 保留:LandingPanel 读 homeDep、addLandingPanel 是
  addPanelByComponent 未知组件兜底)。三处内核登记移除。
- **启动竞态修复(关键)**:home 是 startupPanels 默认项,每次 boot 必开;插件
  异步注册可能晚于 dockview onReady → addPanel 拿 undefined 组件 → dockview
  崩溃全白屏(实测复现)。plugins.js 加 getPluginBootPromise()(memoized
  registerPluginsFromConfig);app-shell openStartupPanels await 后再开
  startup/restore 面板;onReady 改 async。消除所有 plugin 化面板的启动竞态。
- **round 34 files + workbench**:registerPanel 新增可选 open(api, group)
  自定义 opener(openPluginPanel 优先);files 用 addFilesPanel(renderer 模式
  实时翻转 + openFilesPanels 追踪),workbench 用 addWorkbenchPanel(单实例)。
  restore 路径不动(直接调 addWorkbenchPanel)。
- 实测:15 插件全 loaded;boot 正常;files 渲染 explorer;workbench 双开仍
  单实例;disable/enable 全生命周期无崩;console 零报错。
- 剩内置:terminal/vm/task(高风险低价值)+ settings/plugins/fallback/
  iframe/crush-runner(内核身份)。

## 二十一、vm 插件化(round 35,commit `<本轮 commit>`)

- vm-plugin.js(render VmPanel + open addVmPanel);三处内核登记移除;addVmPanel
  导出保留(restore 直调)。DEFAULT_PLUGINS 加 vm(16 插件)。
- 实测:boot 正常、open 渲染 VM 会话、标题带序号(自定义 opener)、
  disable/enable 全生命周期无崩、console 零报错。
- 待办:task 需先加 registerPanel `launcher:false` 开关(否则错误进入 launcher)
  或维持内核;terminal 高难度待评估。

## 二十二、settings + crush-runner 插件化(round 36,commit `<本轮 commit>`)

- settings-plugin.js(通用 opener)+ crush-runner-plugin.js(custom opener
  addCrushRunnerPanel)。initSettings/initCrushRunner/addX 全留内核。
- 澄清:launcher 的 agent = 独立 iframe 插件 "crush",与 crush-runner 面板
  无关;禁用 crush-runner 插件不影响 agent(实测确认)。
- 实测:18 插件 loaded;settings 内插件 section 正常;crush-runner
  disable/enable 生命周期无崩;console 零报错。
- 剩余内置:terminal(高)、plugins/fallback/iframe(内核身份)、task
  (需 launcher:false 开关,收益薄,建议维持内核)。

## 二十三、Launcher 插件化 + swappable(round 37,commit `<本轮 commit>`)

- 组件 fallback → launcher;内核空壳守卫改走插件路径(addPanelByComponent
  ("launcher")),launcher 实现可替换(禁用内置 → 启用注册同名 component 的
  第三方插件)。launcher-plugin.js 默认启用;兼容 shim 兜住旧 "fallback"
  保存布局;Home "Browse apps" CTA、DUPLICATABLE、panels-store 过滤全量改名。
- 实测:19 插件 loaded;空壳守卫重开 launcher;旧名路由;disable/enable
  生命周期无崩;console 零报错。
- 至此内核面板仅剩:terminal(核心)、task(双模任务面板)、plugins(管理器
  自指)、iframe(插件基座)。

## 二十四、terminal.embed API + Home 实时终端(round 38,commit `<本轮 commit>`)

- 新 API:window.GearShell.terminal.embed(anchor, profile?) → {sessionId,
  detach}(同步,内核 attachTerminalSession 路径;插件面板可嵌真终端)。
- Home:点击 mkt-demo-frame → 静态演示换成真 wanix 终端(实测出现
  "➜ / $" 提示符,输入可达)。home manifest 加 terminal.embed 权限。
- 已知:Home 隐藏重挂载后 demo 回静态(会话持久但不可见);会话按重挂载递增。
- 后续候选:embed 复用/清理策略、T2 iframe 桥、plugins 市场。

## 二十五、gctl→gear 改名 + 500 行拆分(round 39,commit `<本轮 commit>`)

- gctl→gear:GEAR_BIND(gear-bind.js)+ bin/gear + shell 内容 + memory 文档
  (gear-examples/gear-cookbook)+ 脚本;legacy bin/gctl 迁移保留。
- 500 行:5 超限文件全拆(app-plugin-manifests / app-normalize-runtime /
  app-normalize-plugins / playground-catalog-shell+agent / vfs-picker-parts /
  plugins-deps+scope+loading);全树 <500,fn-length 0。
- 拆分教训:跨文件缺失符号 node --check 查不出 → 必 browser 实测;数组
  拆分布局 brace 随行搬;私有 helper 跟调用方走。

## 二十六、插件内容 OPFS 缓存(round 44,已做)+ 内存统计 & 内核插件化(设计,未拍板)

### A. 插件 bind 内容 OPFS 缓存(round 44,已实现)

- 动机:每次任务启动都 fetch 全部绑定的 wasm(w9y.io 往返 + 每任务主 frame 流缓冲 + 并发 fetch 风暴阻塞主线程)。
- 实现:`app-plugin-cache.js`。boot 时 `primePluginContentCache(loadConfig().plugins)`
  把 enabled 插件的 wasm 依赖下载进 `opfs/cache/plugin/<pluginId>@<pluginVersion>/<dst basename>`
  (`.src` 边车文件存来源 URL,同版本 pin 升级自动重下;并发 3;`response.body.pipeTo(createWritable())`
  流式落盘不占 JS 堆);成功后建 **src → blob URL** 会话级映射。
  `appendBindElement`(app-terminal-sessions.js)对 `type:"fetch"` 的 bind 优先用
  `cachedBlobUrl(src)` 换 src → 任务挂载零网络、离线可用。
- 接线:app.js boot(ensurePluginToolBinds 之后)+ workspace-config-api.js 的
  install/setEnabled/remove 三处(和 ensurePluginToolBinds 配对)。
- **诚实边界:不减少每任务挂载内存**(字节进任务内核 fs 就得留一份,nodeFile.data);
  减少内存的正解是按需挂载(round 43 fix 2)。缓存解决的是:重复下载、网络延迟、
  离线、per-open fetch 风暴。
- **关键事实(用户指出)**:OPFS 是浏览器 API(`navigator.storage.getDirectory()`),
  页面在内核启动前就能直读,`/opfs` 只是浏览器 OPFS 的投影 —— 所以这个缓存
  已经绕过内核 VFS,不存在"蛋鸡"问题。
- 待办:blob URL 映射是会话级(每次 boot 重建);若 blob 常驻内存成为问题,加 LRU 上限。

### B. 内核内存统计 runtime.ReadMemStats(设计,未拍板)

- 动机:8+ 并发终端 OOM 只能靠 goroutine dump 反推;有 stats 可在逼近 4GB 前预警。
- 方案:wanix 内核(task fs 视角)暴露每任务内存统计:
  - 每个 task 的 `ctl` 支持 write `"mem"` → 返回该 worker 内核的
    `runtime.ReadMemStats` JSON(HeapAlloc/HeapSys/HeapObjects/StackInuse/NumGC 等)。
  - 或暴露只读 `/task/<rid>/mem` 文件,打开即返回快照。
  - 页面侧:轮询器(复用 events 800ms 节奏)把每个活跃任务的 HeapAlloc/4GB 占比
    画进诊断页,超 70% 预警。
- 注意:每个 gojs worker 是独立 wasm 实例,MemStats 只能从 worker 内部读 →
  必须走 task fs 通道(`ctl` 由 worker 内核自己回答即可,天然可行)。
- 备选:`performance.memory` 只覆盖主 frame JS 堆,不含 wasm 线性内存,不可用。
- 收益:同类 OOM(embed 泄漏、bind 挂载过量)下次 crash 前就能定位。

### C. 内核/系统组件插件化(可能设计,未拍板 —— 用户:标注为一种可能,不是决定)

> 方向:让 wanix 内核乃至所有系统组件像插件一样可缓存、可 pin、可更新。
> **以下为探讨性设计,尚未决定是否实施。**

- 事实:内核 = workspace.runtime 里一对可 pin URL(`wasmUrl` + `moduleUrl`),
  `app-wanix.js:25` 把 wasmUrl 设成 `<wanix-namespace>` 的 `wasm` 属性;页面完全掌控。
  w9y.io 的 `wanix/wasm@v0.4.25` 与插件 wasm 同一构建管道。
- 步骤 1(内核 wasm 缓存引导):boot 时用 A 的同款机制把内核 wasm 缓存进 OPFS,
  用 blob URL 启动内核 → 内核离线可启动。**坑**:内核 JS 模块(wanix.min.js)含
  `new URL("workbench/", import.meta.url)` 相对资源解析,`import(blobUrl)` 会断;
  JS 部分更适合同源打包(现有 `wanix-dist`)或 SW 拦截,wasm 部分 blob 缓存无副作用。
- 步骤 2(内核 bind 支持 OPFS src):bind 新增 `opfs:` 前缀 src
  (如 `src: "opfs:/cache/plugin/..."`),任务启动彻底零 HTTP —— 需要小内核特性。
- 步骤 3(内核作为 plugin 条目):runtime 进 DEFAULT_PLUGINS 作为特殊"boot 插件"
  (必须最先解析),boot 顺序:页面 → 内核插件 → 其它插件;版本管理/更新流统一。
- 边界:任务命名空间不能绕过内核(命名空间是内核侧的);"plugin 直读 OPFS"仅页面侧成立。

### D. w9y 自持 registry(round 45,已实现 —— 用户设计裁定:registry 归 w9y,非 GearShell)

- 用户裁定:GearShell 不该 bookkeep;registry 由 w9y CLI 自己写在 prefix 根
  (`<prefix>/w9y-registry.json`)。**上游 w9y 已发布 v0.0.7**(registry.go +
  mod apply 记账 + mod list-installed + mod remove);GearShell 只剩薄编排
  (headless 任务跑 CLI + 镜像读取,app-w9y-registry.js)。
- 已实测:apply/remove/自动同步/重启持久化/`/opfs/wanix/examples/spinner`
  直接跑(懒投影零副本)。详见 memory/plugins.md round 45。
- 遗留(未做):bbtex 面板接入已安装的 /opfs/wanix/examples(直接 cmd 路径,
  取代 fetch bind/blob 缓存——app-plugin-cache.js 可整体退役);C 步骤 2
  (bind opfs: src)可缓;w9y mod apply 的 manifest 变更后旧 entry 文件不清理
  (stale file, registry 正确替换)。
