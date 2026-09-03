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

## 五·五、js/wasi 多 worker 协作（微服务计算器 + 终端换行,2026-08-30 深夜 已完成 ✅）

> 详情见 `memory/dev-server-and-task-workers.md` + `memory/ongoing-work.md`。

### 已完成（全部浏览器实测,生产 CDN）
- **微服务计算器全通**:`examples/calc.js 6 7 mul` exit 0,编排者(js)+wasi+gojs+js
  四种子任务协作,`✅ all three workers agree: 42`。
- **examples 插件改为 preset 式 per-task `files` binds**(不再 systemFiles):
  `app-plugin-manifests.js` examples 插件 `systemFiles` → `files`;内核 js driver
  改读任务 ns(`t.NS()`)后四种 worker 全走 per-task 挂载。`getTaskBinds()` 可见
  `plugin-examples-files-*` + `plugin-examples-ns`(父挂载),workspace.system.binds
  干净。crush runner 同款机制。
- **wanix 三连发**:v0.4.26(spawn 卡死=nullFile.Stat panic + stdio 默认 inherit)、
  v0.4.27(js driver 读任务 ns)、v0.4.28(终端换行:programFile.WriteAt 翻译 +
  xterm convertEol)。全部 w9y.io/jsdelivr 验证 + 浏览器实测。
- **终端输出堆叠 bug 修复**:appendFile → WriteAt 绕过 programFile 的 
→

  翻译 → 裸 
 + convertEol 未开 → 输出堆一行。双修(WriteAt 覆写 + convertEol)。

### 待办
1. ⬜ 提交本轮 gearshell 改动(manifest files 转换 + runtime v0.4.28 + cascade + 文案)。
2. ⬜ memory wiki 同步(sync-wiki.sh + 子模块指针)。
3. ⬜ wanix fork 三连发已 push;gearshell push。

### 规则（已确立，2026-08-30）
- **go dev server（no-store）下不需要 ?v= cascade bump**：本地调试改模块直接生效，cascade-bump 只在发布前统一跑一次。减少无关 diff。

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

## 二十七、下一步计划(2026-08-30 compact 前拍板,双模已批准)

> 优先级:P0 = 先做;P1 = 接着做;P2 = 之后。每个条目带必要上下文,可直接开工。
> **round 46-47c 已完成**:P0-1/P0-2(46)、w9y TUI + Packages 面板 + 退出提示定位
> 修复 + w9y 自版本守卫(47)、Plugin Template 参考插件(47b)、插件依赖符号级归位 +
> headless 日志演示(47c)。全部已浏览器实测,memory/plugins.md 有逐轮记录。

### P0-1:任务退出检测 + 终端 [Process completed] ✅ round 46 完成

- workspace-task 会话去掉 `if (session.term) return;`(app-workspace-task-sessions.js),
  终端会话现在也轮询 `task/<id>/exit`;退出写 `[Process completed (exit code N)]` /
  `[Process exited with code N]` + 派发 task.status 终态(agents/runHeadlessTask 共用,
  已实测 events.drain 可见 succeeded/failed)。
- repl/embed 会话(普通终端、bbtex embed)原本无轮询,新加 `startReplExitPolling`
  (app-terminal-sessions.js)轮询 `task/repl-<id>/exit`;destroy 清定时器。
- 注意:提示前先 `term.write("\x1b[?1049l")` 离开 alt screen,否则全屏 TUI 冻结帧
  会吞掉提示。

### P0-2:bbtex 切换到已安装路径(双模落地) ✅ round 46 完成

- plugin manifest 新增 `w9y: { mod: "bbtex", version: "v2.0.12" }`,63 条 wasm 数组删除。
- `ensureW9yDependencies(plugins)`(app-w9y-registry.js):boot + install/enable 后比对
  registry 镜像,缺失/版本不符 → `w9y mod apply`(fire-and-forget,结果走 w9y.changed)。
  disable/remove **不**卸 mod(全局共享)。
- normalizePlugin 保留 w9y 字段;builtin 刷新时 wasm 强制替换为默认(空即空)→
  老工作区的 63 条旧 bind 自动清除(迁移关键)。
- bbtex:`embedProfileFor` cmd → `/opfs/wanix/examples/<id>`(懒投影零副本),
  去 extraBinds fetch + bin ns;保留 skipPluginBinds(命名空间极小,12 上限);
  pager 的 artichoke.md 仍走 preset extraBinds。playground 加 w9y 缺失提示条。
- `app-plugin-cache.js` **保留不退役**:仍为 shell-tools 的 bash/w9y/gear
  fetch-bind 内容做 OPFS 缓存;blob 交换只服务非 w9y fetch bind。
- 涉及文件:app-plugin-manifests.js / app-normalize-plugins.js /
  workspace-config-api.js / app.js / app-w9y-registry.js / plugin/bbtex/*。

### P1

- **内核 wasm OPFS 缓存引导**(TODO §26C-1):wasm 走 blob URL 无副作用;内核
  JS 模块含 `new URL("workbench/", import.meta.url)` 相对解析,不能 blob
  import,JS 走同源打包(wanix-dist)/SW。
- **包管理 UI** ✅ round 47:builtin "Packages" 面板(plugin/w9y/*),registry 为
  数据源,装/卸/Re-apply/列表/版本对比(declared 徽标)+ w9y.changed 实时刷新。
- **Plugin Template** ✅ round 47b:plugin/template/*,enabled:false 默认禁用(零
  网络请求),演示 registerPanel/registerSettingsSection/registerOverlay + 权限 API
  + headless 任务日志/JSON 元数据输出。写插件从这里拷。
- **插件符号级归位** ✅ round 47c:单插件使用的面板组件从根 panels.js 移入插件
  目录;files 面板专属链移入 plugin/files/;add*Panel 恢复路径等核心定义保留根。
  新插件一律遵守:从 ../../ 导入的必须是核心/共享定义。
- **w9y mod apply TUI** ✅ round 47(上游 v0.0.9,shell-tools pin 已同步):bubbletui package-manager/
  progress-bar 动画照搬(spinner + 进度条 + 字节计数 + ✓/✗ 列表);仅 tty 启用,
  headless 输出不变。

### P2

- **MemStats**(TODO §26B):task ctl 写 "mem" 返回 runtime.ReadMemStats,
  页面轮询诊断,70% 预警。
- **内核 bind `opfs:` src**(TODO §26C-2):任务挂载彻底零 HTTP。
- **内核插件化**(TODO §26C-3):runtime 进 DEFAULT_PLUGINS 作 boot 插件。
- w9y mod apply 的 manifest 变更后旧 entry 文件不清理(stale file,registry 记录
  正确替换;可给 mod remove/apply 加清理)。

### 代码风格决策(已定:htm,✅ 已完成首批迁移)

- **React.createElement vs htm**:选 htm(无构建步,贴合 buildless 规则)。已迁移
  6 个插件文件:plugin/template/template.js + template-overlay.js、plugin/w9y/w9y.js、
  plugin/vm/vm-panel.js、plugin/workbench/workbench-panel.js、
  plugin/settings/settings-terminal-fields.js。htm 经 importmap 引入
  (`"htm": "https://esm.sh/htm@3.1.1"`),`const html = htm.bind(React.createElement)`。
  迁移使违规函数从 6 降到 4(81L→67L、77L→60L)——htm 模板更紧凑。
- **插件依赖铁律(用户问的 importmap 问题)**:插件只能 import importmap 声明过的
  裸标识符。URL/vfs entry 的插件模块,bare specifier 都按**文档级 importmap** 解析,
  没声明的裸导入直接抛 "Failed to resolve module specifier";绝对 URL 导入虽能加载,
  但破坏单 React 实例保证(dockview/hooks 双实例必炸)+ 绕过版本 pinning。新依赖
  一律先加 index.html importmap。vfs/blob entry 单文件无相对导入,importmap 是唯一共享通道。

### compact 备忘(下一会话必读)

- **htm 行为**(实测):`class` 直传不转 className,React 必须手写 `className`;
  元素间纯空白节点被剥离,文本节点内容保留原样(含首尾空格);`...${props}` spread
  可用;函数属性(onClick/onChange/ref)正常,测试里"丢了"是 JSON.stringify 隐藏函数值;
  Fragment 用 `<${React.Fragment}>...</>`(htm 无 `<></>`);DOM 标签勿自闭合+紧跟文本
  (`<span/>x` 解析器崩),组件自闭合 `<${Icon} .../>` 安全。
- **python `\n` 是真换行**:匹配源码里的字面 `\n`(如 `join("\n")`)必须写 `\\\\n`;含 `\n` 的替换改用 edit 工具(无转义层)。
- **htm 模板内反引号要转义**(`` \`cmd\` ``),否则终止模板字面量。
- **web-pet 循环陷阱逃生**:cascade-bump 的 SKIP_DIRS 含 `web-pet` → plugin/web-pet/
  是盲区,每轮级联 web-pet 的 panels 引用都落后一档。修完 web-pet 若再级联又会推
  panels +1 → 死循环。逃生 = 版本号只需"从未被服务过":(1) 先 sed web-pet 的 panels
  引用到当前值 + 手动升 web-pet.js/web-pet-plugin.js/manifest 三级;(2) 跑一次级联;
  (3) 再 sed web-pet 到级联后的 panels 终值,【不再跑级联】(web-pet.js 的 URL 仍是
  新鲜的)。split-audit 确认全树 panels 版本唯一。

- 事件 shape:`{id, topic, payload, ts}`,字段是 **topic** 不是 name。
- OPFS `getDirectoryHandle` 只接受单段路径(`'a/b'` 抛 "Name is not allowed")。
- `Promise.race` 返回单个值,勿写成 `const [x] = await`(会抛 not iterable)。
- 两次 `JSON.parse` 的对象永远 `!==`,比较用 `JSON.stringify` 值比较。
- runHeadlessTask 完成信号不可靠 → 用业务产物(registry/exit 文件)轮询。
- cascade 后 leaf+importer 恒差一档 → split-audit + sed 低→高(既有规则)。
- /opfs 是懒投影:页面写的浏览器 OPFS == 任务里的 /opfs(已验证
  probe.txt/wanix/examples 互通),安装/缓存直接写 OPFS 即可,任务零副本读取。
- **cascade 每轮都会把 panels.js 再推一档 → 每次 cascade 后必须全量 split-audit,
  再 sed web-pet 的 panels 引用**(web-pet 滞后 = 双实例 = boot 时 overlay 抛
  "initPanels() has not been called" = **整个 dockview 不挂载**,最隐蔽的 wedge)。
- **boot 顺序陷阱**:需要 initPanels/GearShell 的调用(如 ensureW9yDependencies)
  必须放在 initWorkspaceApi 之后;失败只有 w9y.changed {ok:false} 事件,console 无报错。
- **退出提示定位**:内核退出时把 xterm 光标归位 → 写 [Process completed] 前用
  `writeAtContentEnd`(找最后一个非空行,行号 = lastIndex+2,buffer 用
  term.buffer?.active)。repl 会话轮询 `task/repl-<id>/exit`,workspace-task 轮询
  `task/workspace-task-<id>/exit`,都要轮询。
- **tasks.create API**:`background` 必须放 options 第二参
  `tasks.create(spec, {background:true})`(放 spec 里被忽略 → UUID id 对不上数字
  session id);headless 捕获输出必须 `term: false`(默认 term:true),输出走
  tasks.output(id)。
- **w9y PATH 影子**:任务 PATH 是 /opfs/home/go/bin:/opfs/wanix:/bin,mod 安装的
  /opfs/wanix/w9y 会影子 /bin/w9y;boot 守卫(ensureW9yDependencies 的 cliVersion
  参数)把已装的 w9y mod 保持在新 pin(v0.0.9);旧 CLI 不写 registry(静默成功 bug)。
- 浏览器验证:机器上 boot 慢,等 60-90s;dockview 选择器是 `.dv-shell`(不是
  .dockview);wedge 恢复 = 关 tab → 新 tab → 新 ?v=。
- verify-static.mjs 的 web-pet 路径检查绑定的是 `import("../../web-pet/index.js")`,
  改 web-pet 结构时要同步。

## 二十八、iframe 面板崩溃修复 + CORP NOT-SET 调研(2026-08-30,已提交 57ff02f + 部署)

### iframe 面板 ReferenceError 崩溃(已修 ✅)

- **现象**:点开 codigo(任何 iframe 插件面板:Browser/Bonsai/Codigo/Crush/Rick Roll)
  报 `ReferenceError: iframe is not defined`,`createIframeSession (app-sessions.js:60)`。
- **根因**:500 行拆分 commit `0a118c0`(2026-08-26)把 iframe 元素绑定弄丢了——
  `const session = { id, wrapper, iframe, ... }` 引用了不存在的局部变量。
- **修复**(`57ff02f`):`terminalLayer?.appendChild(wrapper)` 后补
  `const iframe = wrapper.querySelector("iframe")`。同文件另两个 session 工厂
  (workbench/vm)无此问题。cascade 升 `app-sessions.js` → .172→.173,已部署
  gear.sh,生产实测 codigo.dev 正常渲染,console 零新错误。
- **教训**:拆分大文件时,模板字面量里创建的 DOM 元素若被 session/state 对象引用,
  必须显式取引用(querySelector/变量),纯靠"看着像"容易漏。

### COEP credentialless 下 CORP NOT-SET 提示(无需处理,纯调研 ✅)

- **现象**:Network 面板里 codigo.dev 的文档请求(以及 crush/rickroll 等跨源 iframe)
  显示 `Cross-Origin-Resource-Policy: NOT-SET` + "To use this resource from a
  different origin..." 提示。
- **结论(已实证)**:`credentialless` 模式下 CORP **不强制**——跨源 no-cors 资源
  只剥离凭据,照常加载(实测:gear.sh 页面 `crossOriginIsolated=true`,w3.org 无
  CORP/ACAO 的 favicon 正常 48px 加载;codigo.dev iframe 正常渲染)。
  提示是 DevTools 的善意提醒,不是错误/阻断。若当初用 `require-corp`,这些请求会
  被真阻断(这正是 vercel.json 选 credentialless 的原因)。
- **要消掉提示只有两条路**:
  1. 等上游(codigo.dev/justwasm.github.io/youtube)自己加
     `Cross-Origin-Resource-Policy: cross-origin`(不可控);
  2. **自托管 iframe 源**(同源,不触发 CORP 检查)——bonsai/browser 已是同源
     (`src: "/bonsai/"`、`src: "/browser/"`),codigo/crush/rickroll 是跨源。
- **✅ 已走通第 1 条(2026-08-30)**:codigo 的 Vercel 部署(btwiuse/vscode
  `vercel.json`)补上了 `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp`(提交 `ec6e514cc7f`,含 COEP 的
  响应即满足父页面 credentialless 下的 frame embed 检查),实测跨源 iframe 正常
  渲染、无 NOT-SET 提示。注意 codigo.dev 会拒绝陌生 Host 头(308→vercel.com /
  403),所以 **Vercel 外部 rewrite 代理方案不可行**(会带原 Host);若将来仍要
  自托管,走 `isolation/` CF Worker(Worker fetch 自动带目标 Host)。
- **验证陷阱**(再次踩):DevTools 的 Issues/Network 提示**不在 console 消息里**,
  `read_console_messages` 读不到;旧版本残留错误(.172)会留在 console 缓冲区误导
  判断,判定新版本是否生效要看 `performance.getEntriesByType('resource')` 的
  ?v= token + 重开面板后**新增**错误。

## 二十九、iframe 插件 × GearShell API 桥(2026-08-30 研究完成,未实现)

**背景**:plugin 化已支持同页组件插件(权限白名单注入),但 iframe 插件
(browser/bonsai/codigo/crush/rickroll)是 entry-less,与 shell **零通信**。
用户目标:iframe 能调 window.GearShell(文件系统/音乐/窗口管理等),并用
iframe 形式承载大部分插件。研究结论见 memory/iframe-plugins.md。

**方案**:postMessage 桥 + 复用 createScopedApi 权限系统。
- 协议:`{ gear: { id, method: "music.play", args: [] } }` → shell 校验
  origin(白名单=已注册 iframe 插件 src 的 origin)+ permissions.api →
  分发 window.GearShell → 回 `{ gear: { id, ok, result } }`。
- iframe 侧 gear-bridge.js:Proxy 封装,GearShell.music.play() → Promise。
- manifest 给 iframe 插件加 `permissions: { api: [...] }`(默认空=全拒)。
- 能力:panels.open/list(窗口)、music.*(音乐)、browser.open/files.open、
  terminal.embed、tasks.* + events.on(任务)、w9y.list(包)。
- 注意:GearShell 全同步(jsfs 约束),桥天然异步;真·文件读字节需新增
  async API,先做 UI 级。

**落地顺序**:① gear-bridge.js + shell 桥 + 白名单 + 校验 → ② bonsai/browser
(同源 iframe)先接桥实测 → ③ codigo/crush 跨源走 postMessage 全链路 →
④ 按需 async 文件 API。存量组件插件暂不 iframe 化(重写成本高),新插件
优先 iframe + 桥。

### §二十九 执行计划(压缩后可独立开工)

**目标**:iframe 插件能通过 `window.GearShell`(桥代理)调 shell API——
窗口(panels.*)、音乐(music.*)、打开资源(browser.open/files.open)、
终端(terminal.embed)、任务(tasks.*)、事件(events)、包管理(w9y.list)。
校验 = origin 白名单 + 复用 createScopedApi 的 permissions.api。

**STEP 1 新建 iframe 侧桥 `gear-bridge.js`(仓库根,同源托管 `/plugin/gear-bridge.js`)**
- 顶部守卫:`if (window.top === window.self) { /* 顶层页直接用真实
  GearShell,不装代理 */ return; }`(workspace-api.js 已设 window.GearShell)。
- `window.GearShell = new Proxy(target, get)`:取 `key`,若当前路径已有值
  且为函数 → 返回 `(...args) => invoke(path, args)`;否则返回子 Proxy
  (路径拼接 ".")。`invoke(path, args)`:自增 id,`parent.postMessage(
  { gear: { id, method: path, args } }, "*")`,存 pending Map,Promise
  等回包 `{ gear: { id, ok, result } }`(超时 ~8s reject)。
- 事件订阅(必做,见坑 2):`GearShell.subscribe(topic)` → invoke
  `__subscribe`(shell 特殊通道),shell 推送 `{ gear: { event: { topic,
  payload } } }`;桥内维护 listener 表 + on/off 语义。
- 与现有调用方的兼容:页面自身加载 bridge 时若顶层已有 GearShell 直接透传。

**STEP 2 新建 shell 侧桥 `plugins-iframe-api.js`**
- 导出 `initIframePluginApi()`,在 app.js 中 `initWorkspaceApi()` 之后调用。
- `window.addEventListener("message", handler)`:
  1. `const g = event.data && event.data.gear; if (!g || !g.id || !g.method) return;`
  2. **origin 白名单**:由 `plugins.js` 新增导出
     `getIframePluginForOrigin(origin)`(遍历 pluginIframes,`src` 相对路径
     → `new URL(src, location.href).origin`;绝对 URL → `new URL(src).origin`;
     返回 `{ component, manifest }` 或 null)。
  3. **权限校验**:`createScopedApi(window.GearShell, entry.manifest.
     permissions?.api || [])`,沿 method 点分路径取函数,不存在/denied →
     回 `{ ok: false, error: "denied: <path>" }`。
  4. 调用 `fn(...args)`,回 `event.source.postMessage({ gear: { id, ok,
     result } }, event.origin)`(结果 JSON 可序列化;GearShell 方法已
     safe() 包成 {ok,...})。
  5. `method === "__subscribe"` → 注册真实 `events.on(topic, cb)`,把
     pushEvent 的 payload 转发给该 iframe(`event.source.postMessage(
     { gear: { event: { topic, payload } } }, origin)`),记录
     iframe→topic→off 表,页面 unload 清理。
- 注意:**只允许 JSON 可序列化参数/返回**(函数参数直接拒绝返回错误)。

**STEP 3 manifest + 接线**
- `app-plugin-manifests.js`:给 iframe 插件加 `permissions: { api: [...] }`
  (默认无 = 全拒)。演示集:
  - bonsai:`["panels.list", "music.nowPlaying", "music.play", "music.pause"]`
  - browser:`["panels.open", "browser.open", "files.open", "events.on",
    "events.off", "tasks.create", "tasks.output", "config.getShell"]`
- `app.js`:import + 调 `initIframePluginApi()`。
- `app-normalize-plugins.js`:确认 entry-less iframe 插件的 `permissions`
  字段在 normalize 后保留(不丢)。

**STEP 4 测试(Go dev server 8091,先同源)**
- 新建演示插件 `plugin/iframe-api-demo/`(manifest 挂 iframe src
  `/plugin/iframe-api-demo/index.html` + permissions.api 含
  `panels.list`、`music.nowPlaying`、一个未授权方法做反面):
  - index.html 引 `<script src="/plugin/gear-bridge.js">`,页面按钮
    `GearShell.panels.list()` / `GearShell.music.nowPlaying()` 显示结果。
- 浏览器:开面板 → 调用成功返回 JSON;未授权方法返回 denied;console
  无异常;dev server 无报错。
- 权限反面:临时把 demo 的 permissions 留空 → 全部 denied。
- 跨源(codigo/crush)同一协议,STEP 4 只验同源;跨源留 STEP 5。

**STEP 5 跨源验证(可选,独立任务)**
- codigo.dev 的 index.html 加 `<script src="https://gear.sh/plugin/gear-bridge.js">`
  (btwiuse/vscode 仓库,vercel 部署),shell 侧给 codigo 声明
  permissions.api(如 `["config.getShell", "panels.list"]`),验证
  postMessage 全链路(codigo.dev 已带 COEP: require-corp,不影响)。

**坑(必读)**
1. **GearShell 全同步**(safe() 包装,jsfs 约束),但桥是异步的——iframe 侧
   收到的是 Promise;不要假设返回同步值。
2. **回调无法跨 postMessage**:`events.on(topic, cb)` 的 cb 不能序列化。
   必须走 `__subscribe` 通道(shell 侧注册真实监听 → 事件推送 iframe),
   bridge 暴露 on/off;其他带函数参数的 API 直接拒绝。
3. **回复必须用 `event.source.postMessage(..., event.origin)`**,不能用
   `window.parent.postMessage(..., "*")` 之外的乱目标。
4. `createScopedApi` 的 `then` 键返回 undefined(Proxy thenable 安全),
   桥不要假定遍历会看到函数之外的东西;method 不存在时给出明确错误。
5. 500 行/50 行规则:新模块保持小;`plugins.js` 只加一个导出函数,
   别把桥逻辑塞进去。
6. 提交前:`node --input-type=module --check < file` + `verify-static.mjs`
   + `fn-length-audit.mjs`;迭代用 Go dev server(no-store),无 ?v=。

### §二十九 实现记录(2026-08-30 已落地,STEP 1-4 完成)

**已交付**(commit 待提交):
- `gear-bridge.js`(仓库根,classic script):`window.top !== window.self`
  守卫;`window.GearShell = pathProxy("")` 可调用 Proxy(任意路径访问返回
  可调用节点,调用即 postMessage `{ gear: { id, method, args } }`);
  8s 超时;函数参数直接 reject;`subscribe/unsubscribe/on/off` 四桥方法;
  pagehide 自动 unsubscribe。顶层页不装代理。
- `plugins-iframe-api.js`(shell 侧):`initIframePluginApi()` 在
  `initWorkspaceApi()` 后接线;`subscribe/unsubscribe` 特殊通道(注册真实
  events.on → push `{ gear: { event } }`);普通调用 = permitsPath 白名单
  检查 → createScopedApi 沿点分路径取函数 → 调用 → 回 `event.source.
  postMessage({ gear: { id, ok, result } }, event.origin)`。
- `plugins.js`:`listPluginIframes()` 导出(iframe 插件注册表快照)。
- `plugins-scope.js`:`permitsPath` 导出。
- `app.js`:import + `initIframePluginApi()` 调用。
- `app-plugin-manifests.js`:`iframe-template` 插件(DISABLED 默认,
  权限面板/list music.nowPlaying/play/pause tasks.create events.on/off
  config.getShell)。**500 行拆分**:examples 插件移到
  `app-plugin-manifests-examples.js`(`DEFAULT_PLUGINS.push` 合并)。
- `plugin/iframe-template-plugin/`:`index.html` + css 自包含 demo
  (按钮:panels.list / music.nowPlaying / play / pause / config.getShell /
  tasks.create / files.open(反面)/ subscribe / unsubscribe)。

**与计划的偏差**(重要,后续 STEP 5 照此修正):
1. **白名单不用 origin 匹配**:同源 iframe 全部共享 shell origin,origin
   匹配会塌缩到第一个注册者(browser,无 permissions → 全拒)。改为
   **iframe 元素身份匹配**:`event.source`(WindowProxy)=== 某
   `<iframe>` 的 contentWindow,且该元素 src href === 注册插件 src href。
   跨源同样成立(WindowProxy 身份可比,不能读 document)。见
   `plugins-iframe-api.js` 的 `getIframePluginForSender`。
2. **可调用 Proxy 的路径拼接**:根 path 为 "" 时拼接必须
   `path ? path + "." + key : key`,否则出现 `.music.nowPlaying` 路径。
3. **订阅通道名用 `subscribe`/`unsubscribe`**(非 `__subscribe`),在
   `permitsPath` 之前特判,不占 permissions.api(桥自身通道,恒可用)。
4. **非函数值路径**(如 `version`)返回 `{ ok: true, result: value }`,
   桥侧 `await GearShell.version()` 可读。
5. `normalizePlugins` **不从 def 继承 permissions**(用户配置优先级),
   同源/跨源存量 iframe 插件要在已存 workspace 里显式声明
   permissions 才放行——默认全拒,符合安全预期。

**验证结果**(Go dev server 8091,workspace 配置里 enabled:true):
- panels.list / music.nowPlaying / music.pause / config.getShell /
  tasks.create(background)全部成功返回;files.open → "permission denied";
  subscribe 后 shell `events.emit("task.status")` 推送到 iframe 的
  on 回调;unsubscribe 后事件不再推送;permissions.api 留空 → 全部 denied;
  console 无桥相关错误(browser/ 子模块的跨源报错是既有噪音)。

### §二十九 终端桥(vscode.Terminal 式数据 API,2026-08-31 已落地)

**背景**:mkt-demo Home 的嵌入终端是 `terminal.embed(anchor)`(DOM 参数 +
detach 函数返回值,workspace-terminal-api.js),**无法跨 iframe**。iframe 插件
需要 vscode.Terminal 式数据 API:iframe 自己渲染 xterm,shell 持有内核会话,
postMessage 传字节。wanix 内核协议(../wanix elements/term.js + term/device.go):
`#task/repl-<id>/term/data`(ReadableStream+WritableStream)、`.../winch`(写
"cols rows xpixel ypixel")、`#task/repl-<id>/exit`。**路径必须带 `#`**
(`#task/...`);`waitFor` 的 timeout 必须是整数字面量(浮点 → CBOR 非 uint64
→ 内核 panic "arg 1 is not a uint64")。

**已交付**:
- `workspace-terminal-bridge.js`:shell 侧。`dispatchTerminalCall(event, gear,
  plugin)` 由 plugins-iframe-api 路由(terminal.* 在通用 scoped 调用之前特判,
  权限用 permitsPath 自检)。API:create(默认 profile 合并,创建无 wanix-term
  的 headless 会话 + 回复 sessionId,异步连接数据流)/ write(Uint8Array)/ 
  resize(winch)/ dispose / list。数据泵:waitFor data → openReadable+Writable
  → 读循环 → `event.source.postMessage({ gear: { event: { topic: "term.data",
  payload: { sessionId, data } } } }, origin)`;exit 轮询 → term.exit。
- `app-terminal-sessions.js`:`createHeadlessTerminalSession`(task-only,无
  wanix-term DOM;session.term=null,wakeTerminalSession 不可用于它);同时把
  `startReplExitPolling` 的路径从 `task/repl-<id>/exit` 修正为
  `#task/repl-<id>/exit`(前者静默读不到)。
- `app-terminal-sessions.js` 另一修复:终端任务默认 profile 之前被 workspace
  残留的 `defaultTerminalProfileId:"jsdemo"`(examples 测试遗留)劫持,所有终端
  都跑 examples/hello.js 一次性脚本——**不是桥的问题**,是 workspace 配置污染。
- demo(`plugin/iframe-template-plugin/index.html`)加 Live terminal 卡片:
  jsdelivr 动态 import `@xterm/xterm@6.1.0-beta.303`(与内核同版)+ addon-fit,
  `terminal.create({})` + subscribe term.data/term.exit + onData→write + fit
  缩放→resize。
- manifest:iframe-template permissions 加 terminal.create/write/resize/dispose
  (注释:write 是键盘注入,只给可信插件)。

**验证结果**(dev 8091):create→reply sessionId ✓;write/resize/dispose/list
路由+权限 ✓;subscribe 通道 ✓;**js 任务全链路**:terminal.create({cmd:
"examples/hello.js", type:"js"}) → term.data 推送收到 "hello from a wanix js
worker" + 任务 dump → term.exit code 0 ✓(数据泵+退出检测端到端通)。
**gojs 交互 bash 在此 CDP 后台 tab 不产数据**(gojs worker 不 spawn,连 shell
自带终端同病;生产需前台验证)。**坑**:MessageEvent 没有 id 字段,handler 里
回包必须用 gear.id(曾用 event.id → 回包 id:undefined → iframe 匹配不上 → 8s
超时)。

### §二十九 Terminal 插件发布 + gojs/bash 排查(2026-08-31)

**`plugin/terminal-frame/`(独立插件,默认 enabled)**:全屏 iframe 终端,四周
窗口 chrome 仿 mkt-demo-frame — 红绿灯标题栏(gear@gear: ~)、圆角边框 + 阴影。
打开面板即自动 terminal.create + xterm(jsdelivr 同内核版本),onData→write、
fit→resize、term.data/term.exit 推送;状态机 connecting→connected→waiting
(8s 无输出提示)/exited;失败 banner + ↻ 重启按钮。manifest permissions:
terminal.* + panels.list + events + config.getShell。manifest 声明无 css
(iframe 页自加载,防注入 shell —— verify-static 新增 iframe 插件豁免)。

**gojs bash 不显示的根因(排查结论)**:
- 症状:bash 终端任务 kind=gojs、cmd 正确、exit 空(任务"运行"但无输出、无
  worker、无 "gojs worker started" 日志)。Worker 构造从未发生
  (patch window.Worker 实测 log 为空)。
- 对照:wasi hello.wasm(166B)全链路通(Worker 创建 + "hello from WASI!" +
  exit 0);js hello.js 也通。两者与 gojs 走相同路径(Open→ReadAll→
  GetOrCompile→StartTaskWorker)。
- 差异:bash = hush gojs wasm **25MB**;hello.wasm 166B。内核侧读 bin/bash
  25MB 只要 339ms(非 ReadAll 问题);页面侧 compile 25MB 成功。**卡在
  GetOrCompile 的内核侧 WebAssembly.compile(25MB)** — 在受限/后台 tab 的
  事件循环下 promise 不 settle → TinyGo select 死锁。
- 佐证:calc.js 例子的 gojs bash 子任务(`bin/bash -c '...'`,同一 25MB 二进制)
  在 production 前台环境全通("✅ all three workers agree: 42")。→ **环境
  相关**(前台用户浏览器正常;CDP 后台 tab / 受限环境卡),非 shell/桥 bug。
- 产品侧缓解:terminal-frame 的 waiting 状态 + banner 提示,不再死屏。
- 若要在受限环境可用,方向:wanix fork 里 gojs driver 改流式编译
  (WebAssembly.instantiateStreaming 直接给 URL/stream,不经内核内存)或
  减小 hush 体积。

**拆文件**:app-plugin-manifests.js 再次超 500 行 → bbtex 移到
`app-plugin-manifests-bbtex.js`(push 合并,同 examples)。verify-static 改为
拼接所有 app-plugin-manifests*.js 检查;新增 iframe 插件 css 豁免(manifest
块含 `iframe: {` 的插件,其 css 文件不必在 css: 声明)。

## 三十、wanix instantiateStreaming 改造:大 gojs/wasi 二进制加载(2026-08-31 定案)

**根因(排查闭环)**:bash 终端(hush gojs wasm 25MB)在受限/后台环境"无输出、
exit 空、Worker 从未构造"。对照实验(patch window.Worker 记录构造):
- gojs + 166B hello.wasm → Worker 构造 ✓
- gojs + 18MB w9y → Worker 未构造 ✗
- js driver + 18MB w9y → Worker 未构造 ✗(js driver 不 compile,只 ReadFile!)
- **结论:不是 GetOrCompile,不是 gojs 特有 —— 是"内核读大 fetch bind 文件"卡住**
- 进一步:bridge 任务命名空间里 **bin/bash 根本不存在**(stat ErrNotExist)——
  fetch bind 在命名空间 setup 时 `io.ReadAll(NewReadableStream(binding.data))`
  (wasm/wasm.go:308-315)逐 chunk 读 25MB stream,每个 chunk 一次 JS promise
  往返,受限环境卡死 → 二进制没 bind 上 → driver LookPath/Open 失败 → 空转。
- 生产前台正常(stream 推进快);wasi(166B)/小文件全过;memfs 里有完整副本
  的任务(如旧 repl-1)能 stat 到 bash。

**改造方案(用户指定 instantiateStreaming 方向)**:
1. **wasm.go fetch bind 改一次性读**:`io.ReadAll(NewReadableStream(v))` →
   `new Response(stream).arrayBuffer()` 一次 promise 读全(浏览器侧缓冲,
   不经 Go 逐 chunk 事件循环)。修命名空间 setup 卡顿。
2. **cache.go 加 GetOrCompileStreaming(url)**:`WebAssembly.compileStreaming(
   fetch(url))`,按 URL 缓存编译后的 Module(memCache 扩展);compile 在浏览器
   主线程进行,不经内核 Go 内存。
3. **gojs/wasi driver 优先 URL 编译**:查 task 命名空间 bind 的 dst→src 映射,
   命中 → GetOrCompileStreaming(src) → StartTaskWorker(wasmModule 已随 payload
   传 worker,worker 不再 re-read 文件);未命中(非 fetch bind)→ 旧路径
   (ReadAll + GetOrCompile)。
4. **dst→src 映射**:wasm.go bind 时记录(全局 map,path→src;同 path 异 src
   少见,fallback 旧路径兜底)。
5. **wasm cache 不受影响**:memCache(GetOrCompile,path+hash)保留用于小文件/
   非 URL 路径;URL 缓存独立条目,容量上限同 maxModules。

**验证**:本地 go1.27 构建 wanix.debug.wasm → dev server 本地 serving(workspace
runtime wasmUrl 指向本地)→ 开 terminal-frame 面板 → bash 出提示符 + echo
回显。再回归 calc.js(wasi+gojs+js 三 worker)。

**注意**:wasm memory 无 max(flags=0)= 可 grow 到 2GB(不是固定 10MB);Crush
100MB 佐证。真正瓶颈是 stream 逐 chunk 的事件循环往返,不是内存。

**§30 进展(2026-08-31 已实施,wanix commit `a834422`)**
- wasm.go:fetch bind 改 `Response(stream).arrayBuffer()` 一次读(修 setup 卡顿)
  — **实测 bin/bash 完整 bind 进任务命名空间(25MB)** ✓
- cache.go:`GetOrCompileStreaming(url)` — compileStreaming 优先 + MIME 兜底
  (blob URL 常无 application/wasm 头 → fetch+arrayBuffer+compile),按 URL
  缓存 Module;`RegisterFetchBind/FetchBindSrc` dst→src 映射。wasm cache 不
  受影响(GetOrCompile path+hash 路径原样保留)。
- gojs/wasi driver:URL 命中 → streaming 编译;失败 → 旧文件路径兜底。
- **实测**:改造前 Worker 从未构造;改造后 **gojs bash Worker 构造成功** ✓
  (后台 CDP tab 仍受 timer 节流,rc 引导慢,输出待前台验证;生产用户实测
  可跑)。
- 踩坑:`resp.arrayBuffer()` 返回 ArrayBuffer,`js.CopyBytesToGo` 要
  Uint8Array(先 `new Uint8Array(ab)` 包装),否则内核 panic
  "CopyBytesToGo: expected src to be a Uint8Array"。
- 待办:验证前台 bash 输出 + 回归 calc.js;发布 wanix v0.4.29(tag +
  w9y 构建)后,shell 侧 bump runtime wasmUrl。

**§30 收尾(2026-08-31,wanix v0.4.29 + v0.4.30 候选,gearshell 全闭环)**
- ✅ **v0.4.29 发布 + shell bump**:wanix tag v0.4.29 = a834422(streaming
  fix);gearshell `app-constants.js` WANIX_RUNTIME wasmUrl/moduleUrl →
  v0.4.29。dev workspace 的 runtime 覆盖(local debug wasm + debug flag)
  已清理,新端口 8092 全新 origin 验证:bash 出提示符 + 输入回显 + 输出流动 ✓
- ✅ **gojs worker 二次读 25MB(wanix `be25895` = v0.4.30,已 tag+push)**:worker.js
  无条件 `readFile(argv[0])` 再经 9p 读一遍,即使 payload 已带 wasmModule;
  后台/受限 tab 卡这里。修:wasmModule 存在则跳过。w9y.io + jsdelivr v0.4.30
  均已 200;gearshell app-constants 已 bump v0.4.30。
- ✅ **winch 不更新修复(gearshell,本轮)**:根因 = `root.writeFile` 写 winch
  后 chmod,`*signal.FS` 拒绝 chmod → 每次 resize 静默失败(壳层 wanix-term 用
  openWritable 才不受影响)。桥改 openWritable+writer(wakeTask 就绪门 + 真实
  像素透传);iframe 加 window resize→fit→resize。**实测窗口 619→1400 → winch
  帧 146 28 1251 587**(term-host 真实像素)✓
- ✅ **状态机修正**:8s 定时器只在 sawData=false 时置 waiting;收到 term.data
  后置回 connected(之前数据已流动仍卡 "waiting for output…")。
- ⬜ 回归 calc.js(wasi+gojs+js 三 driver 对 v0.4.30 内核)
- ⬜ 用户确认后:推 gearshell 本轮提交(winch 修复 + v0.4.30 bump)→ Vercel 部署验证

## 三十一、iframe 插件移植候选清单(2026-08-31,按难易度排序)

参考实现:`plugin/terminal-frame/`(全屏终端 + 窗口 chrome + terminal 数据桥)
与 `plugin/bbtex-iframe/`(sidebar + 全高堆叠滚动终端 + w9y.status)。iframe
插件 = 自足 vanilla 页面 + `/plugin/gear-bridge.js` + manifest permissions.api
白名单;前端框架与 core 解耦。**已 iframe 化**:terminal-frame、bbtex-iframe、
iframe-template(演示)、browser/bonsai/codigo/crush/rickroll(外部 src)。

**易(1-2 会话,纯自足页面,几乎无桥依赖)**
1. **group** — 图片/组查看器:一个 `<img>` + panels 打开即显示,零 API。
2. **widgetbot** — 现已是第三方 widget,iframe 化天然贴合。
3. **deck** — reveal.js 演示:reveal-lib.css/theme 已 vendored,页内自载;仅
   需要 decks 文件列表(files.* 只读目录,或 manifest 静态声明)。
4. **playground** — GearShell API 浏览器:纯调用已白名单的 core API
   (panels.list/tasks.create/config.*/events),playground-explorer 逻辑可平移。

**中(2-3 会话,需要桥 API 补齐或 UI 重写)**
5. **home** — 落地页 + 活终端 demo:终端走 terminal.create 数据桥(已证明),
   静态内容自足。
6. **web-pet** — Wagi Dog:精灵动画自足;需要 config.wagiDogEnabled 读 + 点击
   交互(events)。
7. **music** — 播放器:music.* 已可在桥白名单放行;注意壳层 music-engine 是
   **同步** jsfs 实现,桥是异步——需要 shell 侧确认 music API 无副作用依赖
   调用时序。
8. **w9y** — 包管理器:list/status/apply/remove + w9y.changed 已全在桥能力内
   (bbtex-iframe 已验证 w9y.status + 事件)。
9. **launcher** — 应用网格:panels.list/open + config 读;UI 平移量中等。

**难(3+ 会话,或需新增桥能力,或本就不适合)**
10. **files** — 文件管理器:需要**字节级 async 文件 API**(readFile 返回 bytes、
    readDir/stat/write),当前 jsfs 同步面没有;桥要新增 files.* 白名单方法
    (getWanixRoot 包装,参考 Files 面板)。这是最大的桥能力缺口。
11. **settings** — 配置管理:config.* CRUD 桥可用,但 Settings 有大量分区
    (providers/runtime/system/workspace…)重写成本高。
12. **crush-runner** — Crush 预设管理:config 读写 + 终端 + audit,中等偏重。
13. **vm / workbench** — 依赖 wanix-vm/wanix-workbench 内核 DOM 元素与 9p
    导出,**不适合 iframe**(壳层保留,别移植)。

**建议顺序**:先做 1-4 立竿见影(都是纯展示/演示型,正好服务竞赛 demo),
再做 5-8 交互型,9-12 看需求;13 明确不做。files 的字节 API 缺口若要做
文件类插件,先补桥能力(单列 P1)。

## 三十二、VM 终端尺寸修复 + bbtex iframe 收尾(2026-08-31)

**VM stty size 修复**(wanix 已 squash 为单 commit `b22ae59` + 重写 message,
extras 重打,gearshell 待推):
- 根因两层:①v86 驱动硬编码 100x100;②libv86 SendWindowSize 写 (c,b) 序而
  Linux 读第一个为 cols → 参数对调(对称默认值掩盖)。
- 修:驱动转发 winch 时驱动侧交换为 [rows,cols];不动 vendored libv86。
- **SIGWINCH 语义已验证(真 ptmx 行为)**:guest 走 virtio-console RESIZE 控制
  消息 → 内核 tty_do_resize(唯一改 tty->winsize 的路径,stty size 读它)→
  kill_pgrp(fg pgrp, SIGWINCH)。实测:①stty 跟随 80x35→105x38→121x38→138x38
  ✓;②前台 `sh -c 'trap ... WINCH'` 在 resize 时收到 SIGWINCH(trap 必须装在
  前台 job 里;装在 shell 里没用——job control 下 fg job 是独立 pgrp)✓;
  ③busybox top 每轮 refresh 用 get_terminal_width_height 重读尺寸,resize 后
  自动按新宽度重排(48 列时表头截到 "CPU %CPU CO")✓。
- ⬜ **发布链(等用户)**:`npm publish wanix-extras`(bump)→ gearshell
  `DEFAULT_VM_BACKEND_URL` 指向新版本(当前仍 0.4.0-rc2 旧 tgz)。
- ⬜ 推 gearshell 待推提交(bbtex-iframe 系列 + memory)

## 四十四、统一 Plugin 图标来源(2026-09-02)

- Plugins 页面、Spotlight 与 Dockview `PanelTab` 统一以 manifest 的 Lucide icon name
  为唯一来源；iframe panel 传递 plugin icon，v86/rv64 的 `Cpu` 图标补入 Spotlight
  字典，不再被 fallback/别名替代。

## 四十三、统一 Plugin 图标来源(2026-09-02)

- Plugins 页面使用 manifest 的 Lucide icon；Spotlight 与 Dockview tab 现在也从同一
  manifest icon 字段取值，iframe panel 将 icon 传到 `PanelTab`，不再让 v86/rv64 等
  iframe 使用 fallback 图标。

## 四十二、模型 API 与 Settings 滚动修复(2026-09-02)

- `config.models.list/save/remove` 已加入 GearShell，模型存储在对应 provider 的
  `models` 数组，支持名称、上下文窗口、最大 token、推理和图片能力字段；Playground
  catalog 已增加三项操作。
- Settings iframe 恢复正常页面滚动：仅禁用 overscroll，不再让 body `overflow: visible`
  阻断滚动；`html` 负责纵向滚动，`.settings-panel` 保持至少一屏高度。

## 四十一、Debug runtime 历史与默认重置(2026-09-02)

- `/debug/` 增加 `Reset Default`，恢复 wanix v0.4.33 的默认 module/wasm URL。
- 增加 active workspace 级 runtime 历史，保存和恢复前自动记录当前 URL，最多保留
  30 条；点击 `Restore` 直接回写 localStorage，不经过 GearShell API。
- `/debug/` 左上角增加带 GearShell logo 的主页返回入口，直接链接 `/`；正文
  增加顶部内边距，避免内容与固定定位 logo 重叠。
- Runtime history 每条记录展开显示完整的 Module URL 与 Wasm URL，再提供 `Restore`，
  避免只显示时间导致无法判断将要回滚到的版本。

## 四十、Debug runtime URL escape hatch(2026-09-02)

- 新增 `/debug/` 静态页面，不加载 GearShell API 或 iframe bridge，直接读写
  `gear-shell-active-workspace`、`gear-shell-workspace-index` 与 active workspace key。
- 页面可直接设置 `runtime.moduleUrl` / `runtime.wasmUrl`，保存后重新加载 GearShell
  生效，作为 runtime 配置损坏时的逃生舱；默认示例为 wanix v0.4.33。
- Settings iframe body 同样禁用 overscroll，保留正常内容滚动但不产生回弹。

## 三十九、Launcher 焦点与键盘导航(2026-09-02)

- Launcher 激活时向页面派发 `GearShellPanelFocused`，Launcher 搜索框自动获得焦点；
  全局 hotkey 触发 `panels.open("launcher")` 后也在下一帧补发该事件，修复 Launcher
  已经激活时按 Ctrl+Shift+P 导致 search bar 失焦的问题。
- 搜索框所在 card 统一接管 ArrowUp/ArrowDown，基于当前 activeElement 在 Launcher
  item list 中连续循环移动焦点，支持反向导航，Enter 点击当前 item，保留鼠标操作和
  现有搜索过滤行为。

## 三十八、Settings iframe 禁用 overscroll(2026-09-02)

- Settings iframe 的 `html`、`body` 与 `.settings-panel` 统一设置
  `overscroll-behavior: none`，保留内容滚动但禁止触摸板/触摸快速滚动产生弹簧回弹。

## 三十七、Launcher 单例(2026-09-02)

- `panels.open("launcher")` 和内部 `addPanelByComponent(..., "launcher")` 现在先查找
  已存在的 Launcher panel；存在时只激活并复用，不再创建重复 tab。
- `Ctrl+Shift+P` 因此始终打开同一个 Launcher，返回结果增加 `id` 与 `reused` 信息。

## 三十六、Playground VM API 与 AGW 域名迁移(2026-09-02)

- Playground API catalog 新增 `vm.list` / `vm.create`，workspace API 增加对应
  root namespace，iframe manifest 放行 `vm.*`、`w9y.*`、`hotkeys.*`。
- API catalog 审计补充 `terminal.*`、`vm.*`、`w9y.*`、`hotkeys.*` 等此前漏列的
  namespace；VM/terminal 的 iframe 专用 dispatch 仍负责真实 session。
- VM iframe 专用 dispatch 仍负责真实 VM session，Playground 的 `vm.create` 作为
  API 目录入口可观察桥接限制；真实创建应传 VM backend/Linux 配置。
- 默认 `AGW` 已改为 `https://agw.k0s.io`，架构文档同步替换旧 AGW host；旧日志和
  非 AGW Railway 服务地址不属于本次替换范围。

## 三十五、Plugin Hotkey API 与 Launcher 快捷键(2026-09-02)

- Playground API sidebar 使用 6px WebKit scrollbar、Firefox `thin` 和统一 thumb
  颜色，与结果 JSON 区域的滚动条视觉一致。
- 新增 `app-hotkeys.js`，提供 `registerHotkey`、`unregisterHotkey`、`listHotkeys`，
  并监听 shell 全局 `keydown`；当前 action 采用受限的 `panels.open` 结构，避免插件
  注册任意脚本回调。
- Plugin module 的 `ctx` 新增 `registerHotkey(spec)` / `unregisterHotkey(id)`，
  注册项按插件 owner 隔离，插件注销时自动清理。
- Core 默认注册 `ctrl+shift+p`，执行 `panels.open("launcher")`，因此可直接打开
  Launcher 页面；GearShell API 暴露 `hotkeys.list/register/unregister` 供受信调用者使用。

## 三十四、Playground iframe 名称与 Root API 权限修复(2026-09-02)

- Playground 内置 manifest 的 `name`/`label` 统一为 `GearShell API Playground`，
  并同步刷新已保存插件配置的 manifest name，避免 Launcher 和 dock tab 继续显示含义
  不明确的 `Playground`。
- Explorer tab 改名为 `GearShell API Explorer`，与其他 Playground 产品区分。
- iframe 权限白名单补充 root API 的 `version` 和 `ping`，修复 bridge 返回
  `permission denied: version` / `permission denied: ping`。

## 三十三、Playground iframe 视觉与 version 修复(2026-09-02)

- Playground iframe 的 body 现在复用 shell 的系统字体栈与 14px 基准，避免
  `ROOT`、`CONFIG` 等目录标题和原 builtin 版本出现字体漂移。
- manifest 标题改为 `GearShell API Playground`，因此 launcher、dock tab 和
  iframe 注册标题保持一致。
- Explorer 的 `version` value 通过 bridge 调用 `version.toJSON`，但 manifest
  白名单是 `config.*` 等，导致 permission denied；iframe 现在将 value 作为
  bridged callable执行，避免直接访问 Proxy 内部属性。
- iframe 文档、根容器及 Explorer 两个滚动容器统一设置
  `overscroll-behavior: none/contain`，禁止触控板或触摸快速滚动时的弹簧回弹
  和顶部白边，保留刚性滚动。
- Playground iframe 根布局固定为 `100vh` 且 `html/body/#app` 隐藏外层溢出；
  Tab 内容不再撑高 iframe，Explorer detail、Providers、Events 在内部滚动，
  左侧 API column 继续独立保留 scrollbar。
- 移动端 Playground Explorer 改为上下分屏，API sidebar 位于上方，detail 位于下方；
  中间 resizer 使用 Pointer Events 支持触摸/鼠标拖拽调整 sidebar 高度，桌面端保留左右
  分屏并调整 sidebar 宽度。
- Settings iframe 的启用 Plugin 卡片增加 `Open` 快捷入口，调用
  `panels.open(plugin.panels[0])`，行为等价于从 Launcher 打开该插件；禁用插件不显示
  入口，仍保留 Enable/Disable 操作。
- 注:libv86 resize handler 还写 config-space this.cols=e[0](收 [rows,cols] 时
  config 里 cols/rows 是反的);guest 只走控制消息路径不用 config,故无害,
  但别再依赖 config 空间。

**本轮经验**(详见 memory/plugins.md round 45):
- 对称默认值掩盖参数序 bug;修"恒值"后必须方向性验证。
- dev workspace 配置改动走 config.updateShell,别直接写 localStorage
  (normalize 重存会冲掉)。
- 第三方 minified 源码别打补丁,驱动侧补偿优先。
- iframe 插件默认 enabled(否则 Plugins 页"消失")。

## 三十三、VM 联网跑通(vnet 网关,2026-08-31)

**目标**:guest 能 `apk update && apk add`(用户说"apt"但镜像是 Alpine,用 apk)。
参考 tractordev/apptron(tractordev 也是 wanix 作者)的虚网方案,放弃 mrrowisp
(wisp 在 v86 客户端只支持 TCP,DHCP/DNS 不通;vnet 带 UDP,guest 标准 udhcpc)。

**已完成**:
- 新仓库 `gearshell/vnet`(github.com/progrium/go-netstack/vnet 网关,~150 行):
  `/x/net` WebSocket(Qemu framing:4 字节 BE 长度 + L2 帧)→ vnet.AcceptQemu;
  内置 DHCP(DHCPStaticLeases/pool 10.0.0.0/8,gw 10.0.0.1)+ DNS(:53 UDP+TCP)+
  TCP/UDP NAT 出网;debug 端点 /stats /cam /leases。镜像 btwiuse/arch:golang
  启动时 `git clone + go build`(k8s 内构建,不推镜像)。
- 已部署 k3s:`deploy/k8s.yaml`(Service:8080 + Deployment + Ingress),TLS
  cert-manager letsencrypt(certificate 需显式创建,ingress-shim 没自动建)→
  `wss://vnet.net.k0s.io/x/net`。
- gearshell `normalizeVmWispUrl` 放行 ws:/wss:(vnet 用 lb 适配器,非 wisp)。
- **端到端验证**(dev VM,手动起网):udhcpc 拿到 10.0.0.2/8、默认路由
  10.0.0.1 → wget http://example.com ✓ → apk update(HTTPS)OK: 25056 包 ✓
  → apk add htop(3.4.1)✓。

**待办**:
- ⬜ guest 开机自动起网:镜像 wanix-linux.tgz 加 /boot/rc(或改 /bin/init):
  `ifconfig lo up; ifconfig eth0 up; udhcpc -i eth0 -s /bin/post-dhcp` + post-dhcp
  脚本(设 IP/路由/resolv.conf)→ 重建镜像 → extras 新 tag。
  (临时方案:gearshell vm 会话加一个 boot/rc 的 file bind 覆盖,不用重建镜像。)
- ⬜ 持久化(下阶段):内核 archive bind 改 cowfs{Base: memfs 解包, Overlay:
  idbfs "vm/<key>"}(照 apptron boot.go:206-242),guest 9p 写入进 IndexedDB。
- ⬜ vnet 服务可选增强:ngrok 式公网入口(apptron worker 的 tcp-<port>-<ip> 模式)。

**坑**:
- cert-manager ingress-shim 不会自动为 Ingress 建 Certificate(matrix 是手动/历史
  建的);显式创建 Certificate 资源即可(issuerRef letsencrypt)。
- GitHub push 拒 "email privacy restrictions":commit 作者邮箱必须用
  `<id>+<login>@users.noreply.github.com`(btwiuse: 54848194+btwiuse@...)。
- gearshell normalize 在新代码生效前会拒掉 wss:,先 reload 再 updateShell。

## 三十四、guest 开机自动网络 + tmux 修复(2026-08-31)

- **tmux 根因**:9p 根(wanix vfs)不支持 unix socket mknod → bind() ENOSYS
  ("error creating /tmp/tmux-0/default (Function not implemented)")。修:启动时
  `mount -t tmpfs tmpfs /tmp`。详见 memory/vnet-network.md。
- **机制**(与 crush runner preset 同款的 task bind mount,镜像保持通用):
  镜像 /bin/init 会 source /boot/rc(若存在)→ gearshell 在 wanix-vm child binds
  挂 `boot/rc`(tmpfs + ifconfig lo/eth0 up + udhcpc)+ `bin/post-dhcp`
  (udhcpc hook:IP/路由/resolv.conf)两个 file bind 覆盖。boot/ 与 bin/ 目录镜像
  里已存在,无需像 crush preset 那样先 mint ramfs 保父目录。
- ✅ 已验证:新开 VM → eth0 自动 10.0.0.x + resolv.conf 10.0.0.1 + tmpfs /tmp
  → apk add tmux → tmux 建会话/attach/detach 全通。
- 不重建镜像:image 保持通用,guest 覆盖一律走 task bind(参考
  memory/crush-runner-mounts.md 的 preset 挂载纪律)。

## 三十五、rv64.js 插件 + 联网 bonus(2026-08-31)

- **rv64.js**(ibuildthecloud,RISC-V 64 全系统模拟器,Rust→WASM,TinyEMU 系)
  做成 iframe 插件 `plugin/rv64/`:自足页面(xterm + RV64.create + wsproxy 网络),
  **emulator 库以 git submodule 引入**(plugin/rv64/vendor → ibuildthecloud/rv64.js,
  module worker 必须同源,不能 CDN 跨域加载)。镜像/内核/wasm 走 deploy-site 临时
  静态宿主(3rvx4t2c1dti.matrix.k0s.io,CORS *)。
- **联网 bonus 完成**:rv64 guest 静态 10.0.2.15/24 gw 10.0.2.2(镜像 rv64-init 内
  置 QEMU slirp 惯例)→ wsproxy(裸 L2 帧 WebSocket)→ 同一个 vnet 网关。为此:
  ①vnet subnet 从 10.0.0.0/8 改成 **10.0.2.0/24 gw 10.0.2.2**(v86 DHCP guest 自动
  适应);②ext4 磁盘用 e2tools 补 /etc/resolv.conf(nameserver 10.0.2.2,Alpine
  minirootfs 没有 resolv.conf)→ 78MB ext4 gzip 后 4.4MB 部署。
- **验证**:Alpine 3.24 启动到交互 shell(ALPINE_READY)→ `apk update`
  OK: 26786 packages ✓(HTTPS 出网)。注:CDP 合成键入到 iframe xterm 会丢空格,
  是测试工具假象,真人键盘输入正常(apk update 就是靠输入管道执行的)。
- **verify-static.mjs 修两个坑**:①manifest 文件名 regex `[a-z-]+` 不支持数字 id
  (rv64)→ 改 `[a-z0-9-]+`;②插件 500 行检查加 "vendor" 目录豁免(submodule
  第三方库,同 sw.js 豁免)。
- 遗留:assets 临时宿主(deploy-site)后续换永久 CDN;可把 rv64 的 ext4 也接
  OPFS 持久化(下阶段统一做)。

## 三十六、rv64 guest tty 修复(stty size)(2026-08-31)

- **现象**:rv64 guest `stty size` → "stty: standard input"(v86 guest 正常)。
- **根因**:rv64 机器模型的控制台是**裸 ns16550 UART**(virt.rs:199 "Minimal
  ns16550 (8250) UART"),没有终端尺寸通道 → 内核 ttyS0 的 winsize 恒为 0x0;
  busybox `get_terminal_width_height` 把 0x0 当作"no size information"报错。
  对比 v86:virtio-console 有 RESIZE 控制消息 → tty_do_resize → winsize 有值。
- **修**(guest 侧):/rv64-init 里 `exec setsid -c /bin/sh -l </dev/ttyS0 >&0 2>&1`
  (给 shell 真实控制终端,job control 开启)+ 开机 `stty rows 24 cols 80`(默认
  winsize)。实测:stty size → "24 80";`stty rows 40 cols 120` 后 → "40 120" ✓
  (TIOCSWINSZ 变更内核会发 SIGWINCH)。ext4 用 e2tools 改写后重新 gzip 部署。
- **真正的动态 ptmx 修复**(上游):rv64.js 需要实现 virtio-console RESIZE 事件
  (照 v86 libv86 的 virtio-console0-resize)+ guest 控制台挂 hvc,插件把 xterm
  尺寸推给 guest → tty_do_resize + SIGWINCH 自动跟随。当前无此通道,只能静态
  默认 + 手动 stty。

## 三十七、rv64 终端随窗口 resize(未完成,等待匹配 kernel)

- 已确认：当前 rv64.js Wasm API 已添加 `vm.resize(cols, rows)`，但已发布
  kernel 启动日志没有 `virtio_console`，所以不能宣称自动 resize 完成。
- 下一步：从 rv64.js fork 构建匹配 `VIRTIO_CONSOLE` 的 kernel，更新完整资产
  后，用 Chrome MCP 验证 `tty`、`stty size`、窗口拖动和 SIGWINCH。

## 三十八、原版 VM 与 v86 iframe 网络/回归闭环(已完成)

- 目标:xterm 随窗口 resize 时,guest ttyS0 的 winsize 跟随(现在无尺寸通道,
  只有静态默认 24x80 + 手动 stty)。
- ❌ **否决:vnet /x/http + guest httpd CGI 方案**(已实现过但撤回思路):插件
  fetch 尺寸到 guest 的 httpd CGI 应用 stty。**问题:断网(guest 网络没起来、
  vnet 挂了)就不能 resize——设计不合理**。resize 是本地 UI 事件,不该依赖
  网络链路。vnet 的 /x/http 反向代理端点本身保留(通用工具,浏览器→guest HTTP)。
- 已实现 rv64.js 标准 virtio-console size 配置变化 API，但 Chrome 实测当前
发布 kernel 未枚举 `virtio_console`，因此动态 resize 尚未闭环。
- `/rv64-init` 权限问题已定位，构建脚本已固定为 0755；需要重新生成并发布
与 `VIRTIO_CONSOLE` 配置匹配的 kernel + 镜像后再验证。
- 网络 CGI/httpd 方案已移除。

- `823d36b` 的无条件 DHCP 曾使默认 `vmNetworkMode: "none"` 的原版 VM
  卡在 `/boot/rc`，已拆分为无网络/有网络两套 boot hook。
- GearShell API：`GearShell.config.updateShell({ vmNetworkMode: "wisp", vmWispUrl: "wss://vnet.net.k0s.io/x/net" })`；改配置后需关闭并重开 VM。
- `wss://` 对应 vnet 的原始 L2 WebSocket，`wisps://` 是另一套 Wisp 协议。

## 三十八、原版 VM 与 v86 iframe 网络/回归闭环(已完成)

- 原版 VM 保持 `export="ttyS0"`，默认无网络也能启动到 `~ #`。
- 配置 vnet 后，Chrome MCP 验证 `tty=/dev/hvc0`、`stty size=51 115`，并通过 `wget -qO- ip.sb` 得到公网 IP `152.32.165.233`。
- v86 iframe 使用独立页面和同款 vnet 网络配置，已验证可启动并联网。

## 三十九、RV64 demo/kernel 交接快照（2026-09-01）

### 当前状态

- RV64 fork 已创建并存在于 `https://github.com/btwiuse/rv64.js`。本地仓库
  `/Users/gear/GitHub/rv64.js` 的 `main` 当前为 `e6ab9e7`，比 fork 的 `main`
  多 13 个本地提交；**这些提交尚未推送**。不要直接推送，先完成下述本地 demo 验证。
- RV64 fork 的 CI workflow 已手动触发并成功：run `33426082076`。CI 本身不是问题。
- 失败的是 Demo images workflow：run `33401094403`（tag `demo-images-v11`）。
  kernel/Wasm/image 构建阶段成功，失败发生在 `tests/alpine-boot.mjs`，4 分钟内没有
  收到 `Linux version` 输出。此前 tag `demo-images-v9`/`v10` 还曾在 Alpine 验证中显示
  `ALPINE_READY` 但没有 `APK_UPDATE_OK`，不能据此判定 demo 成功。
- 当前 GearShell 主仓库的 `.gitmodules` 已在工作区暂存，RV64 vendor URL 已改为
  `https://github.com/btwiuse/rv64.js`，不要使用 `git add -A`，不要动无关的 untracked
  交付物。

### 已确认的技术事实

- `virtio_console` 只有在 RV64 runtime 创建 `virtioConsole: true` 时才会进入设备列表；
  `tests/alpine-boot.mjs` 已加入该参数，并使用
  `console=ttyS0 console=hvc0 root=/dev/vda rw init=/rv64-init`，保留 ttyS0 启动日志。
- allnoconfig 的 RV64 kernel 配置现在显式启用 `TTY=y`、`HVC_DRIVER=y`、`VIRTIO=y`、
  `VIRTIO_MMIO=y`、`VIRTIO_CONSOLE=y`。缺少 HVC/TTY 时，Kconfig 会静默丢弃
  `VIRTIO_CONSOLE`，于是日志只出现 `virtio_blk`。
- virtio-console config layout 已修正为标准 packed layout：cols 位于 config offset 0，
  rows 位于 offset 2；`config_generation` 和 configuration-change interrupt 也已实现。
  Rust virtio 测试 15/15 通过。
- 本地 Docker/Nix 构建链现在可用：Docker 使用 OrbStack，Nix 使用容器
  `nixos/nix:2.30.2`，持久卷名为 `rv64-nix-store`，命令需设置
  `NIX_CONFIG='experimental-features = nix-command flakes'`。`.#virt-kernel-fast`
  已在容器内成功构建，输出为 `linux-riscv64-unknown-linux-gnu-6.12.7`。
- 本地完整 asset build 曾因把宿主 macOS 目录挂入 Nix Linux 容器后，生成的 rootfs 文件
  权限归属/不可读导致 `mke2fs` 报 `Permission denied ... bbsuid`；不要直接把宿主生成的
  `target/bench` 当作 workflow 等价物。应在同一 Nix 容器中执行整个
  `tools/build-demo-assets.sh`，或者先修正 rootfs 权限后再跑。
- 本地 build 生成的 kernel 启动时出现 `virtio_blk virtio1`，但随后 root mount 失败，
  因为测试仍使用旧/不匹配的 disk 链接；必须保证 `web/images/alpine/alpine.ext4`、
  `web/images/alpine/Image`、Wasm 都来自同一次容器构建。不要单独复制 kernel 后混用旧 disk。
- 运行 `tests/alpine-boot.mjs` 前必须确认三个文件存在，否则脚本会合法地输出
  `SKIP Alpine boot`：Wasm、`web/images/alpine/Image`、`web/images/alpine/alpine.ext4`。
- 用户已确认 Docker 可用，并要求沿途触发 RV64 CI；CI run `33426082076` 已成功。

### 下一步（严格顺序）

1. 在容器中清理并重建完整匹配资产，使用同一个 `nixos/nix:2.30.2` 容器、
   `rv64-nix-store` 卷和 `/Users/gear/GitHub/rv64.js` 挂载；不要只构建 kernel。
2. 在相同容器中执行 `node tests/alpine-boot.mjs`，必要时设置
   `RV64_BOOT_TRACE=1`。必须看到 `virtio_console`、`ALPINE_READY`、
   `OK: ... distinct packages available` 和 `APK_UPDATE_OK`，否则继续修复，不推送。
3. 用 `wasm-objdump` 或等价工具检查 Wasm 导出包含 `virt_console_resize`，并检查 kernel
   config 产物确实包含 `CONFIG_VIRTIO_CONSOLE=y`、`CONFIG_HVC_DRIVER=y`。
4. 只有本地完整 demo 通过后，才提交/推送 RV64 fork，创建新的不可变 demo tag，并发布
   matched Wasm/kernel/disk。不要复用已经失败的 tag。
5. 更新 GearShell `plugin/rv64/index.html` 的 asset URL 后，启动 Go dev server，使用
   Chrome MCP 新 tab 验证 `tty`、`stty size`、panel resize，以及
   `trap 'echo WINCH' WINCH; sleep ...` 是否收到 SIGWINCH。最后再更新 memory/TODO。

### 重要经验

- RV64 CI 成功不代表 demo images 成功；必须分别看 workflow/job/step。
- Demo images 失败日志要先区分构建失败、rootfs 组装失败、guest boot 失败和 apk 网络失败，
  不要只看最终 `AssertionError`。
- 资产必须是 matched set；Wasm API、kernel 的 virtio-console 支持、设备树设备顺序、
  rootfs 的控制终端必须同时匹配。
- 当前不应声称 RV64 自动 resize 或 SIGWINCH 已完成；Chrome MCP 端到端验证仍待完成。

## 四十、RV64 浏览器端到端打通（2026-09-01 夜，上下文压缩前快照）

### 已完成并在浏览器验证（全部通过）

- 本地 macOS 原生工具链构建（无需 docker/nix）：fakeroot + brew e2fsprogs
  （mke2fs/debugfs），rootfs 直接复用 `target/bench/alpine-riscv64` 缓存目录。
- rv64.js 源码修复（`/Users/gear/GitHub/rv64.js`，工作区有改动待提交推送）：
  1. virtio.rs：console 设备 DRIVER_OK 边沿发 config-change 中断 → guest 启动即得 80x24 初始尺寸；
  2. virtio.rs：console virtqueue 16 → 128；
  3. web/rv64.js：#tick 空闲退避（slice 指令 <1000 睡 10ms）→ 修掉 100% CPU；
  4. web/rv64.js：`virtioConsoleInput` 调 wasm `virt_export_input`（输入进 virtio console）；
  5. tests/virt-smoke/mk-alpine-rootfs.sh：devpts/tmpfs/TERM=xterm/DHCP(wsproxy)/
     `<> /dev/hvc0`（读写打开，tmux 死锁根因）/ shell 起在 hvc0。
- GearShell `plugin/rv64/index.html`：资产改本地 `/plugin/rv64/assets/` 直读、
  监听 console+export、cmdline 加 `console=hvc0`、v86 式启动后 `refitAndResize()`
  （初始 tty 尺寸正确，无需手动 resize）。
- 浏览器验证：启动 → `tty`=/dev/hvc0、初始 `stty size`=面板尺寸（56 104）、
  窗口 resize 后 `stty size` 跟随、`top` 自动重排（SIGWINCH）、DHCP 网络 + `apk add` 成功、
  **tmux attach 正常显示**（此前死锁，根因是 `</dev/hvc0` 只读打开导致 server 写
  client 传来的 stdin fd 返回 EBADF）。

### 待办（压缩后继续）

- 推送 rv64.js fork：`cd /Users/gear/GitHub/rv64.js && git add <本轮文件> && git commit && git push btwiuse main`；
  文件：crates/rv64-system/src/virtio.rs、web/rv64.js、web/rv64.worker.js、
  tests/virt-smoke/mk-alpine-rootfs.sh（+ tests/alpine-boot.mjs 视情况）。
- 重建 demo 制品：`tools/build-demo-assets.sh target/local-demo-images`（本地已备好
  wasm/Image/ext4，输出 SHA256SUMS 即制品）。
- GearShell：vendor 子模块推进到新的 btwiuse/rv64.js 提交；提交 index.html、
  `.gitmodules`（vendor URL 改 btwiuse）、TODO.md、memory/ 并推送。
- `plugin/rv64/assets/`（约 84MB：wasm 4.5M + Image 4.1M + ext4 75M）为生成物，
  建议加 .gitignore 不提交，部署时单独上传。
- 剩余可选：github actions 的 Demo images 工作流本地等价验证（`node tests/alpine-boot.mjs`
  已能用本地资产跑通到 ALPINE_READY+apk）；Chrome MCP 键盘偶发丢字符为工具问题。


## 四十一、RV64 历史重写(2026-09-02)

- 原 main 领先上游 14 个 commit,含 3 组弯路(净零):rv64-resized guest helper、
  config 偏移 8/12 再改回、hvc0 attach 又 revert。
- 新分支 `rv64-virtio-console-features`(基于 origin/main)按 feature set
  重写为 5 个 commit:resize 管线 / DRIVER_OK+queue128 / 内核+启动测试 /
  hvc0 shell(rootfs+JS) / CI workflow_dispatch。
- 顺带清掉最终树 2 行弯路残留:usr/local/sbin mkdir、ttyS0 stty。
- 新树与旧 b7c861d 树仅差 3 行注释+2 行删除;virtio 15 测试全绿。
- 定稿:旧 14-commit 历史(b7c861d)→ 备份分支 `backup/rv64-console-experiments`
  推送保留;feature 分支提升为 main(force-push);评审中删除与 virtExportInput
  重复的 virtioConsoleInput 并 squash 进 hvc0 shell commit;最终 HEAD `92d5342`
  (5 个提交);gearshell vendor 已指向 92d5342;CI 已触发(run 33449565236)。


## 四十二、WANIX × rv64 到 v86 同等地位(2026-09-02)

- rv64.js main:新增 vm.serial.send(8250 UART 输入通道);adapter 设备对调
  (终端 hvc0 + winch→vm.resize,hostexport ttyS0);guest init 加 TERM 与
  tmpfs(/tmp /run /dev/shm,9p 根不支持 unix socket,tmux 必须);release
  v0.3.0(btwiuse)并回填 Makefile SHA。commit 64a173a + e2895ef。
- wanix 本地(/Users/gear/GitHub/wanix,未 push):应用 wanix-riscv64.patch;
  等价移植 wexec JS-task/signal/live-read;新增 examples/rv64.html。
- 原生 macOS 构建 guest bundle(无 Docker):既有 alpine rootfs + kernel +
  riscv64 交叉编译 wexec/hostexport + extras/linux/bin 脚本。
- 浏览器验证全通过:boot 进 hvc0 shell;stty size 跟随面板(50 75→26 20);
  fetch relay 网络(apk update 26785 pkgs,apk add tmux);tmux attach 正常。
- wanix 已发布 v0.4.32(justwasm/wanix main+tag,含 wexec JS 移植与 rv64 示例页),
  w9y.io/jsdelivr 验证通过;gearshell pin 已升 v0.4.32(app-constants.js +
  plugin/v86/index.html)。
- 待办:wtop/wrepeat 的 wexec-js 未在页面实测;fetch relay 慢是已知瓶颈;
  guest 安装不持久(命名空间 RAM)。


## 四十三、wanix runtime 加载回退(2026-09-02)

- 问题:localStorage 旧 pin(semver 被视为用户自定义,normalize 不迁移)在
  新发布后仍被旧设备导入;URL 失效则 app.js 的 import() reject,整页加载失败。
- 修复(方向1,commit 79fdc51):resolveWanixRuntime() 先试配置 module,失败
  回退源码默认对(module+wasm 成对);app.js boot 门接入;可用 pin 仍尊重。
- 实测:404 pin 自动回退 v0.4.32 启动;v0.4.29 恢复后照常加载;node 单测 7/7。
- 未选:?debug 模式、出错手动指定版本(设置面板已有手动改 URL 能力)。


## 四十四、移动端 terminal 点按聚焦修复(2026-09-02)

- 问题:移动端 terminal 失焦后手指点按无法重新聚焦(iframe 内浏览器不合成
  xterm 依赖的 mousedown);桌面鼠标正常。
- 修复:wanix-term 加 tap 聚焦(wanix v0.4.33);4 个裸 xterm 插件页(rv64/
  terminal-frame/bbtex-iframe/iframe-template-plugin)内联 enableTapFocus;
  gearshell pins 升 v0.4.33。
- 验证:合成 touch tap 聚焦 true、滚动不聚焦 false;v0.4.33 CDN 字节一致。


## 四十五、rv64 插件双日志修复 + xterm 路径澄清(2026-09-02)

- 双日志根因:console=ttyS0 console=hvc0 双内核 console,hvc0 注册后每条
  printk 双份;页面把 console+export 两流都写同一 xterm。修复:页面 hvc0 首字节
  后丢 ttyS0 流(b4c253b)。wanix adapter 无此问题(仅 console=hvc0)。
- 澄清:wanix-term 与裸 xterm 是两条独立路径 —— v86 iframe 是 wanix-term(自身
  import wanix@v0.4.33),rv64 等 4 插件是裸 xterm;修复分别落在 wanix v0.4.33
  与页面内联 enableTapFocus。v86 wanix-term tap 聚焦已直接合成 touch 验证。


## 四十六、插件终端统一:裸 xterm + 共享宿主 kernel(2026-09-02)

- v86 插件迁移到裸 xterm(像 rv64),VM 经 vm.create 桥接跑在宿主 wanix kernel
  (startVmSession renderTerm:false);实测 boot/网络/输入通。
- 5 个自渲染终端插件统一用 plugin/xterm-bundle.mjs(wanix 同款 addon 全集,
  同 beta tag);normalizePlugins 补 permissions 合并。
- **遗留 TODO:v86 winch→guest resize 仍 100 100**。已验证:winch 帧写入与
  信号广播正确、term 路径正确、适配器(v86.tgz rc3)含 forwardWinch、guest
  resize 机制本身通(默认 100 100 生效)。宿主 wasm 曾为旧 debug 构建;workspace
  pin 已同步 v0.4.33 后仍无效。隔离页 wanix/examples/v86-resize-test.html 保留。
  下一步候选:重建/重发 v86.tgz 并加日志,或对照 rv64 适配器(同模式可用)。

## 四十七、移除独立 VM 面板,资产配置归 v86(2026-09-02)

- 独立 VM 面板(plugin/vm)功能被 v86 插件覆盖,整体移除。
- 删除:plugin/vm/(vm-config.js、vm-plugin.js、vm-panel.js、guest rc)、
  DEFAULT_VM_BACKEND_URL/LINUX_URL、getVmPanelConfig、addVmPanel、
  attachVmSession、config 键 vmBackendUrl/vmLinuxUrl/vmMemory/vmNetworkMode/
  vmWispUrl + normalize*、Settings Wanix tools 的 VM 字段、launcher "vm" 项、
  saved-layout 的 vm 恢复分支。commit c61285b。
- 保留:bridge 的 VM 会话引擎(createVmSession/startVmSession/vm.create,
  供 v86 在宿主 kernel 跑),自身内联 fallback URL,不再读宿主 VM config。
- 结论印证:wanix-linux.tgz 是 x86-only(boot/bzImage),rv64 用独立的
  wanix-linux-rv64.tgz,故 VM 面板移除不影响 rv64。

## 四十八、Settings iframe parity 交接(进行中,2026-09-02)

- **目标**:Settings UI 从 builtin React entry 迁为 lazy iframe,所有宿主操作放在
  `config.*` facade,不新增 `settings.*` namespace。旧 builtin Settings 文件保留作
  reference;当前 manifest 指向 `/plugin/settings/index.html`。
- **Core/bridge**:新增 `workspace-config-settings-api.js`,由 `configApi` spread
  暴露 `config.workspace.*`/`presets.*`/`binds.*`/`tasks.*`/`terminalProfiles.*`/
  `terminalIcons.*`/`launcher.*`/`reset`;`workspace-api.js:wrapNamespace` 递归
  safe;`plugins-iframe-api.js:handleCall` await Promise。`app-normalize-plugins.js`
  用 `def.entry !== undefined` 与 `css: def.css || []` 清掉 builtin→iframe 旧 entry/css。
- **当前 iframe UI**:`plugin/settings/index.html` + `iframe-settings.css` 已覆盖
  Behavior、Workspace、Runtime & system、Mounts & tasks、Terminal presets、Agent
  activity、Plugins。资源区块已从裸 JSON 升级为 cards/forms:system/task bind
  Add/Edit/Remove、上下移动+原生 drag/drop;file content textarea;tasks Run/Edit/
  Remove/Add;profiles Add/Edit/Delete、默认项、icon search+真实 Lucide SVG preview;
  custom presets Load/Edit/Update/Delete;plugins enable/disable(必选保护)。Workspace
  JSON 仍作为高级 escape hatch,Runtime share URL/copy,Agent activity 为 timeline
  cards + changed keys + before/after diff + Undo。
- **已验证**:syntax/static/diff checks;浏览器 Settings iframe `Loaded`,system 7,
  task mounts 6,profiles 2,presets 4,plugins 28,sections 7;icon 搜索 rocket 得 1
  项,profile Edit 回填,resource cards draggable。
- **明确未完/续接顺序**:1)检查并修复真实 Settings iframe 的新增/编辑/排序边界(尤其
  systemSet/task set 的审计与 normalized return);2)第三方 `registerSettingsSection`
  目前是 DOM callback,尚无跨 iframe render protocol;3)旧 builtin `app.js` 仍需彻底
  去掉 `settings-icons.js`/`initSettings` 的 eager 共享依赖(先把 icon picker 抽到
  独立 shared module,否则 Settings UI 虽 iframe,部分旧 Settings React 依赖仍进 boot);
  4)确认默认 plugins 归一化后不再保留 Settings entry/css;5)完成浏览器交互回归后再
  commit/push,不要把当前骨架误标完整 parity。

## 四十九、GearShell API Documentation plugin(2026-09-02,已提交 0b1894b + 5bdfed1)

用户要"比 Playground 更详尽的 GearShell API 文档组件"。Playground 是
**可执行 catalog**(每方法 React form + Run),Documentation 是**可读
markdown**(每方法独立 .md,签名 + 参数表 + 返回 + 多个示例 + 权限片段)。

- 新插件 `plugin/gearshell-docs/`:index.html(importmap + bridge +
  entry)、docs.css(inline,github-dark 主题,不漏到 shell chrome)、
  docs-app.js(React + htm + marked@17 + DOMPurify + lucide-react)。
- 142 个 API 文档 + 8 个跨切 guides(overview / iframe-bridge /
  gear-cli / permissions / events / fs / tasks-agents / config-audit),
  共 150 个 markdown 文件。
- `scripts/build-docs-content.mjs` 是 canonical source:从 RECORDS +
  CONFIG_TABLE / MUSIC_TABLE / TERMINAL_TABLE / FS_TABLE + GUIDES
  生成所有 .md 与 `content/index.json`。**index.json 的 path 字段由
  生成器派生**(record.id.replaceAll(".", "/") + ".md"),不再手维护,
  避免第一次发货时 `version.md` / `ping.md` 被错指到 `root/` 子目录
  导致 404(详见 memory/api-docs.md 的 "first-iteration 404" 一节)。
- manifest 注册到 `app-plugin-manifests-plugins-core.js`,权限集与
  Playground 相同(全 root + 14 namespace 全读 + fs.*);icon `BookOpen`。
- UI:侧栏 TOC 按 namespace 分组(每组显示条目数)、全局搜索过滤、
  hash 路由(`#/terminal.create`)、代码块 copy 按钮、最后访问页面
  通过 `config.kv` 持久化(localStorage 兜底)。
- 已用 Chrome MCP 实测:打开面板正常渲染、Config 73 个方法侧栏正确
  显示、`#/version` 不再 404、代码块 4 个 copy 按钮 payload 正确、
  `config.kv.get("gearshell-docs:last-page")` 返回 `"agents.prompt"`、
  控制台零错误。
- 提交:`0b1894b`(插件主体) + `5bdfed1`(404 修复 + index.json 自动化)。
- 关联:`memory/api-docs.md`(新写)、`memory/Home.md`(索引)、
  `memory/playground.md`(末尾 sibling 注释)。

## 五十、GearShell.fs.watch + Notes 插件迁 fs + 事件链根因修复(2026-09-02)

用户要给 Notes 插件做"外部实时编辑→UI 实时刷新"。本以为只是给 fs API 加
个 watch,结果沿途挖出两个**让所有 iframe 插件从来没收过 live event 的根因
bug**(Notes / crush-playground / app-store 看起来都在订阅 config.changed,
运行时永远静默)。详见 `memory/plugins.md` round 60 + `memory/verification-pitfalls.md` §13。
本节只列交付与 TODO 联动。

### 交付

- **新 API** `GearShell.fs.watch(path, {recursive})` + `unwatch(handle)` +
  `events.fs.changed` 事件 topic。底层 Chrome `FileSystemObserver`,只支持
  `/opfs/...` 路径(wanix 内核没 fs.notify)。
- **Notes 插件从全 kv 迁混合存储**:index 留 kv,body 走 fs markdown 文件
  (`/opfs/home/notes/<folder-slug>/<slug>.md`)。一次性的 v1→v2 迁移在
  `notes-storage.js#migrateLegacy`,旧数据首启自动转。
- **根因 bug A**:kv / config 写用 `pushEvent` 改成 `emit`(11+1 处),
  `config.changed` 现在真的会触发 events.on。
- **根因 bug B**:`plugin/gear-bridge.js#bridgeOn` 加 lazy subscribe,iframe
  `events.on` 现在真的会收到 host 推送的事件。
- 新插件模块:`notes-storage.js`(463 行)+ 重写 `notes-store.js`(462 行)
  + 瘦身的 `notes.js`(86 行)。所有文件 ≤500 行规则。

### 联动 / 已知遗留(下轮接)

1. ⬜ **kernel 端 fs.notify**:让 `#task/...` / fetch / archive bind 也能
   watch(目前只能观察 OPFS)。需要内核 9p 加 notif/watch——文件大但模式
   已经在 OPFS 侧验证。
2. ⬜ **Files 面板挂载 Notes markdown 预览/编辑**:`/opfs/home/notes/`
   现在是真实 fs 树,Files 面板打开 markdown 应该走 Notes 同款 markdown
   渲染器(目前是裸 Files 自己 render)。共享渲染器 = 跨应用外观一致。
3. ⬜ **Notes body 审计 + 来源区分**:fs.writeFile 不进 audit ring,
   外部写(terminal `cat >` / Files 面板编辑器 / agent)与 Notes UI 内的
   写没法区分。下次需要时把 fs write 也走审计环。
4. ⬜ **跨 workspace 的 fs.watch 重订阅**:Notes reloadKv 已覆盖,但
   `useNotesStore` 的 watcher 句柄是 mount-time 一次性的;workspace 切换
   时 OPFS root 改变需要 `unwatch + watch` 重新初始化。
5. ⬜ **smoke-test 防回归**:写一个 5 行的 e2e 测,iframe 内 `events.on`
   + 宿主 `emit` → 断言 cb 触发,跑在 CI。**优先级中**:不是阻塞,但
   这类根因 bug 一旦再回退又没人能发现。

### 顺带修复的细节

- OPFS `/opfs/home` 不预创建:首启需显式 `mkdir -p`,Notes 的
  `loadAll` 已做。
- wanix 不递归 mkdir:写 `/opfs/home/notes/x.md` 前必须 mkdir 父目录,
  `notes-storage.js#createNote` 已做。
- chrome `FileSystemObserver` 一次 write 产生 2 条事件(appeared +
  modified),订阅方 dedup(`setBodyCache` 同 key 多次 set 是 no-op)。
- stale closure:fs.changed 处理器关在 mount-time 的 notes/folders 上,
  新建 note 永远查不到。加 `notesRef` / `foldersRef`(沿用 `bodiesRef`
  模式)。
- ?v= token:0 匹配。ESM strict check:`node --input-type=module --check`
  全清白。
- `verify-static.mjs` 仍有 pre-existing `DeckPanel` marker failure
  (Deck→iframe 迁移遗留,本轮无关)。

## 五十一、Settings Plugins → Apps + 砍掉 in-page Plugins 代码(2026-09-03)

### 背景

Settings 页一直有"Plugins"卡片 + 单独的 Plugins 面板;后者是
`plugin-panel.js`(react 组件) + `plugins-page.js`(卡片/弹窗/查询/启用
列表)的组合,通过 `panels.open("plugins")` 走 `PluginsPanel` 通道。
2026 早期 App Store iframe 插件上线后,`plugin/app-store/` 已经能完成
同样的 install/enable/remove/搜索/标签筛选,**所有能力都 API 化**了,
没有 in-page 版独有的特性。所以 Plugins 这套 in-page 代码可以全部删掉,
Settings 那一栏改成 "Apps" 并把 App Store 作为唯一入口。

### 改动

**删除(5 个文件,共 761 行):**

- `settings-plugins.js`(72 行)—— Settings 卡片的 in-page 注册,
  `registerPluginsSettingsSection()` 一并删。
- `plugins-page.js`(274 行) —— `PluginsPage` 主体。
- `plugins-panel.js`(54 行) —— `PluginsPanel` dockview 壳。
- `plugins-cards.js` / `plugins-modal.js` —— 500-line split,跟
  `plugins-page.js` 一起无引用,**一并清掉**。
- `PluginsPanel` 在 `app-shell.js` 的 `PANEL_COMPONENTS` 注册
  (`plugins: PluginsPanel`)删除;`panels.js#PANEL_ADDERS.plugins`
  分发删除。
- `app-panels.js#PANEL_CREATION_OPTIONS` 的 `{ component: "plugins",
  label: "Plugins", icon: Puzzle }` 删;`Puzzle` 的 lucide import 删。
- `app-constants.js#DEFAULT_LAUNCHER_ITEM_ORDER` 和
  `STARTUP_PANEL_TYPES` 里的 `"plugins"` 字符串删。
- `app-shell.js#DUPLICATABLE_PANEL_TYPES` 删 `"plugins"`。

**保留(插件内核的工具,与 Plugins panel 无关,其它插件/iframe 桥还要用):**

- `plugins.js`, `plugins-deps.js`, `plugins-overlays.js`,
  `plugins-css.js`, `plugins-loading.js`, `plugins-scope.js`,
  `plugins-iframe-api.js` —— 全部还在,registry / DI / CSS 注入 /
  iframe bridge 都是通用层。

**改写:**

- `plugin/settings/index.html`:
  - 顶部 tab `[data-tab="plugins"]` → `[data-tab="apps"]`,文案 "Plugins"
    → "Apps"。
  - 整个 `<section data-section="plugins">`(标题 + plugin-list 卡片 +
    "Open plugins page" 按钮)替换成 `<section data-section="apps">`:
    一段说明 + 一个 "Open App Store" 按钮 + 一行 `<span id="apps-count">`
    显示 `N enabled of M installed`(同源 `GearShell.config.plugins.list`,
    不重复实现 toggle 控件)。
  - `renderPlugins` 函数体换成 `renderApps`,只算 enabled 总数写
    `#apps-count`。
  - `#open-plugin-manager.onclick` → `#open-app-store.onclick`,
    `panels.open("plugins")` → `panels.open("app-store")`。
- `plugin/spotlight/spotlight-overlay.js#EXTRA_APPS`:
  `{ component: "plugins", name: "Plugins", iconName: "Puzzle" }` →
  `{ component: "app-store", name: "App Store", iconName: "Store" }`。
- `app-plugin-manifests-iframes.js` 的 app-store manifest 注释更新
  (明确 "唯一 Apps 管理面,替换 round 50 之前的 in-page Plugins")。
- `plugins.js` 里"built-in Plugins link card"那段注释同步改写。

### 验证(浏览器实测,localhost:8080)

- `panels.open("settings")` → 新 iframe 加载 OK;`[data-tab="apps"]`
  命中,`[data-tab="plugins"]` 不存在。
- 切到 Apps tab → 标题 "Apps",文案 "The App Store is the single source
  of truth for plugin state." + "Open App Store" 按钮 + 实时计数
  ("18 enabled of 33 installed — manage from the App Store.")。
- 点 "Open App Store" → `panels.open("app-store")` 触发 → 出现
  `iframe[title="App Store"]`,正确 iframe 加载。
- ESM 全清白(`node --input-type=module --check`,所有动过的文件 0
  错误)。
- `verify-static.mjs` 的 `DeckPanel` marker 失败是 pre-existing
  (Deck → iframe 迁移的遗留,跟本轮无关)。

### 用户体验差异

- 启用/禁用 plugin 的流程从「Settings 里 toggle」变成「Settings > Apps
  > Open App Store > 在 App Store 里 toggle」。少一次点击,但多了一次
  进入 App Store 的强引导(用户更容易发现 App Store 的搜索/标签/列表
  视图这些老 Plugins 页没有的功能)。
- Spotlight 搜索 "app" 或 "store" 直接出 App Store(原来是 "plugins"
  → Plugins panel)。

## 五十二、Files 面板迁移到 GearShell.fs.*(2026-09-03,本轮)

里程碑:面板内部所有对 wanix kernel / `getWanixRoot()` 的直接调用全部走
`GearShell.fs.*`,只剩 mount 链(`_setupNamespace` + `showDirectoryPicker`)
留在 host。Files iframe 化只差打包。详见 `memory/files-panel.md`「Files
面板迁移到 GearShell.fs.*」+ `memory/plugin-iframe-migration.md` Files Tier1
状态节。

### 设计选择

- **两步走**:先做 API 适配再做 iframe 切割。本轮做第一步,稳定后再做打包;
  这样在 API 层先验证 host-only 边界是否真的就是 mount + picker,而不是
  迁移完了才发现 iframe 还多要几个 kernel 句柄。
- **新增 `plugin/files/files-fs.js`** 作为 panel 的 fs 表面;所有 panel 模块
  拿 `getFs()` 而不是 `getWanixRoot()`。iframe 化时只在这一个文件改实现
  (走 `gear-bridge.js` → postMessage),panel 其余代码不动。
- **`GearShell.fs.unmount(id)` 替代 `root.unbind(dst, dst)`**:bind graph
  和 IDB 持久化从两处分散维护(`files-mounts.js` + `workspace-fs-api.js`)
  收敛到 `workspace-fs-api.js` 一处。panel 只调 `fs.unmount(mount.id)`。

### 交付

- 新模块 `plugin/files/files-fs.js`(131 行):暴露 `{readDir, readFile,
  readFileText, writeFile, writeFileText, stat, mkdir, rm, rename, exists}`,
  所有方法背后调 `GearShell.fs.*`。
- 9 个 panel 模块替换:`files.js` / `files-editor.js` / `files-context-menu.js`
  / `files-tree.js` / `files-panel-hooks.js` / `files-path.js` /
  `files-mounts.js` / `files-registry.js` / `app.js`。DI 表去掉
  `getWanixRoot` 和 `wanixSystem` 两个 key,新增 `getFs` / `onKernelReady` /
  `getMountKernel` 三个 host-only dep。
- `files-mounts.js:unmountLocalDir` 走 `GearShell.fs.unmount(id)` 替代
  `root.unbind(dst, dst)`。
- stat 字段从 wanix PascalCase (`Size`/`ModTime`) 切到 GearShell.fs
  snake_case (`size`/`modTime`),`enrichEntryStats` 不再依赖 wanix 内部 shape。
- kernel-ready 事件订阅从 `wanixSystem.addEventListener("ready", ...)`
  改成 `filesDep("onKernelReady")(cb)` disposer 模式。

### 留 host 的边界(为什么不能整个 iframe 化)

| 能力 | 文件 | 原因 |
|---|---|---|
| `showDirectoryPicker` ×2 | `plugin/files-mounts.js` | File System Access API 必须 user gesture 在顶层文档触发,无法跨 postMessage |
| `bindLocalDir(handle, dst, getKernel)` 内的 `kernel._setupNamespace("1", "", binds)` | `plugin/files-mounts.js` | wanix bind graph 唯一入口,只有 host 持 kernel 句柄 |
| `onKernelReady` 订阅 | `app.js`(通过 `filesDep("onKernelReady")` 暴露) | wanix 元素发 ready CustomEvent,host 桥成 disposer;iframe 形态可走 `events.on("kernel.ready", ...)`,待 wanix 暴露 |

### iframe 化的下一步(留作未来工作)

`permissions.api: ["fs.*", "config.*", "panels.*", "events.*"]` 已经就位,
打包时不需要新增 manifest 权限。具体步骤:

1. 把 `files.js` + 12 个 sibling 装进 `plugin/files/index.html`(仿 Notes
   插件的 buildless React+importmap 形态,见 `memory/pluginization-lessons.md`
   round 39)。
2. `corePlugins` 里 Files 的 `entry: "/plugin/files/files-plugin.js"`
   改成 `iframe: { src: "/plugin/files/index.html" }`。
3. `files-fs.js` 的实现换成走 bridge:`window.GearShell.fs.*`(经
   `gear-bridge.js` 自动转 postMessage)。
4. `files-mounts.js` 留在 host(因为 `bindLocalDir` + `showDirectoryPicker`),
   Files 面板通过 `GearShell.fs.mounts.requestLocalDir()` / `remount()` /
   `unmount()` 触发;mount 列表通过 `events.fs.changed` 推送给 iframe。
5. kernel-ready:如果 wanix 暴露了 `events.emit("kernel.ready", ...)`,iframe
   形态直接 `GearShell.events.on("kernel.ready", retry)`;否则沿用 host dep。

### 验证

- `node --input-type=module --check` 全 10 个 touched 文件通过。
- grep `plugin/files/` 无 `getRoot` / `wanixSystem` / `_setupNamespace` /
  `showDirectoryPicker` 引用(注释除外;`plugin/files-mounts.js` 是
  host-only 文件保留这三条)。
- `getWanixRoot` 仍在 `workspace-fs-api.js` / `workspace-terminal-*` /
  `music-engine.js` / `plugins-loading.js` 等 host-side 模块使用(合理——
  这些是 PTY / music engine / plugin kernel,合法需要 kernel 句柄)。
- 浏览器实测待本轮 commit 后跑(CDP 测 Files panel: tree 展开 / 文件 open
  / save / rename / mkdir / delete / upload / volume mount / unmount /
  reconnect 全链路)。

### 本轮未做、刻意保留

- **Files iframe 打包**:本里程碑在 API 层足够优秀,iframe 化等以后有精力。
  manifest 仍标 `entry`,boot 时仍 fetch;但 host dep 收敛后这条链风险更小。
- **workbench Tier1**:与 files 同结构,等 files iframe 验证后再启动。
- **`scripts/verify-static.mjs` 的 `DeckPanel` marker 失败**:pre-existing
  (Deck → iframe 迁移遗留),与本轮无关。

memory 已同步 wiki(待 `scripts/sync-wiki.sh` + 推进 memory 子模块指针):
- `memory/files-panel.md` 新增「Files 面板迁移到 GearShell.fs.*」节
- `memory/plugin-iframe-migration.md` 新增「Files Tier1 状态」节
- `memory/Home.md` Latest rounds 加 round 61 条目

## 五十三、Files 面板 mount 链迁 GearShell.fs.*(2026-09-03,本轮)

用户追问:fs mount 还没有走 GearShell API?——对,上一轮只把 unmount 改了,
picker / bind / restore / reconnect 还是直接调 `bindLocalDir` +
`showDirectoryPicker`。本轮补齐,Files 面板**完全不再持有 kernel 句柄**。

### 改动

- **`workspace-fs-api.js` 集中 6 个 mount API**(新增 4 个):
  - `fs.requestLocalDir(name?)` — 弹 picker + bind + IDB persist,host-only
  - `fs.reconnect(id)` — 重新 picker(权限撤销时)+ bind,host-only
  - `fs.remount(id)` — silent queryPermission + bind,host-only
  - `fs.restoreMounts()` — boot 时静默重连所有有权限的 mount
  - `fs.mounts()` — 列 metadata(已有)
  - `fs.unmount(id)` — unbind + IDB drop(已有)
- **`plugin/files-mounts.js:useLocalDirMounts` 退化为 UI shim**:
  `restoreStoredMounts` → `fs.restoreMounts()`,
  `handleMountLocalDir` → `fs.requestLocalDir()`,
  `reconnectLocalDir` → `fs.reconnect()`,
  `unmountLocalDir` → `fs.unmount()`(上轮已做)。
  删 `getKernel` 入参 + `restoredMountsRef`(panel 不再需要 dedup,host 端
  `restoreMounts` 自己 idempotent)。
- **`bindLocalDir` 现在只被 `workspace-fs-api.js` 调用**(grep 验证),
  panel 全程不持 `_setupNamespace`。`showDirectoryPicker` 也只在
  `workspace-fs-api.js` 里调。
- **`initFiles` 删 `getMountKernel` dep**,只剩 `getFs` + `onKernelReady` 两个
  host-only 入参(后者是 kernel ready 事件订阅,跟 mount 无关)。
- **Playground catalog** 新增 4 个 mount 调试入口(panels 列表);
  `scripts/build-docs-content.mjs` 的 FS_TABLE 同步,自动生成 docs 页面
  `plugin/gearshell-docs/content/fs/{mounts,requestLocalDir,reconnect,restoreMounts}.md`。
- **Docs index** 由 `node scripts/build-docs-content.mjs` 自动生成(150 API + 8 guides)。

### 验证

- `node --input-type=module --check` 全部 touched 文件通过(8 个)。
- `grep -E "showDirectoryPicker|bindLocalDir|_setupNamespace|getKernel|getMountKernel"`
  在 `plugin/files/files.js` + `files-panel-hooks.js` 下**零命中**(注释除外)。
- panel 入口(VolumesSidebar / FilesPanel)全部走 `window.GearShell.fs.*`,
  `useLocalDirMounts` 返回的 `restoreMounts` / `handleMountLocalDir` /
  `unmountLocalDir` / `openMount` 全部转发到 host 端的 fs 表面。

### 留 host 的边界

- **FSA picker**(`showDirectoryPicker`):必须是真实 user gesture 在顶层
  文档触发,iframe 没法触发。`fs.requestLocalDir` / `fs.reconnect` 在 host
  端执行 picker,iframe 调一次 postMessage,host 完成 picker 后回 result。
- **`bindLocalDir` → `_setupNamespace`**:wanix bind graph 唯一入口,
  kernel handle 只在 host 端持有。这两个 host-only 限制让 `fs.*` 的 mount
  方法无法纯前端转发,但对 iframe 透明(panel 只调 `fs.requestLocalDir()`)。
- **`onKernelReady` dep**:kernel ready 事件订阅暂时走 host(wanix 元素
  发 ready CustomEvent)。iframe 形态可改为 `events.on("kernel.ready", ...)`
  (待 wanix 暴露)。

### Files iframe 化仅剩打包

API 适配**全部完成**。Files manifest 仍标 `entry`,boot 时仍 fetch 入口
模块;iframe 化的下一步纯粹是打包 + 入口,与 API 层无关。具体步骤记录在
上一节「iframe 化的下一步」,留作未来。

memory 待同步:
- `memory/files-panel.md` 「Files 面板迁移到 GearShell.fs.*」 节更新 mount
  链全走 API 的描述
- `memory/plugin-iframe-migration.md` Files Tier1 状态节同步
- `memory/Home.md` Latest rounds 加 round 62 条目

## 五十四、Files mount 链回滚 + 调查记录(2026-09-03,本轮)

**用户实测反馈**:round 五十三 把 Files 面板的 mount 链也搬上
`GearShell.fs.*` 后,**Mount 按钮 picker 出来、用户选了目录,但 bind 没
落到 kernel** —— `/mnt/<name>` 在面板里能看到 entry 但 VFS ls 不到。
本轮把 mount 链回滚到原来的 direct kernel/picker 路径。

### 回滚内容

- `plugin/files-mounts.js` —— `useLocalDirMounts` / `restoreStoredMounts` /
  `handleMountLocalDir` / `reconnectLocalDir` / `unmountLocalDir` 全部回滚
  到 round 五十二 之前的 direct-kernel 版本(直接调 `showDirectoryPicker`
  + `bindLocalDir` + `_setupNamespace`)。
- `plugin/files/files-registry.js` —— `getMountKernel` 重新列为 host-only dep。
- `plugin/files/files.js` —— `useFilesPanelActionsWire` 重新传
  `getKernel: useCallback(() => filesDep("getMountKernel")?.(), [])`。
- `plugin/files/files-panel-hooks.js` —— `useFilesPanelMounts` 重新接受
  `getKernel` + `getRoot` 入参。
- `app.js` —— `initFiles` 重新加回 `getMountKernel: () => wanixSystem?._kernel`。

### 保留不变(API 层已正确,只是 panel 走不通)

- `workspace-fs-api.js` 六个 mount API 全部保留:`fs.mounts` /
  `fs.requestLocalDir` / `fs.reconnect` / `fs.remount` / `fs.restoreMounts` /
  `fs.unmount`。Playground catalog 调试入口保留;docs 页面保留。**Files
  面板不再调它们**,但 agent / 未来 iframe / 其他 builtin 仍然能用。
- `fs.readFile` / `writeFile` / `readDir` / `stat` / `mkdir` / `rm` /
  `rename` / `exists` / `watch` / `unwatch` —— round 五十二已落地的 VFS API,
  全部正常工作,Files 面板继续用。

### 调查过的嫌疑(都没确认是 root cause)

1. **`safe()` 包装**:不会把 async 函数降级成同步值,call 端 `await` 拿到
   Promise 正确结果。✅ 排除。
2. **`wanixSystem` ESM live binding**:live binding 应该正常工作。✅ 排除。
3. **FSA user gesture 跨 API 边界丢**(最可疑):`showDirectoryPicker`
   要求 transient user activation 在 stack frame 上;`fs.requestLocalDir`
   是 async function,内部 `await loadStoredMounts()` 之后再调 picker,
   跨 micro-task 可能让 picker 看到的 stack frame 不再是用户点击的那一
   个。Picker 仍能弹(很多浏览器宽容),但后续 bind 的 state machine 可能
   受 activation window 影响。
4. **call stack 太深 / event loop 优先级**:`safe(asyncFn)` →
   `bindLocalDir` → `_setupNamespace`,三层 async 可能让 bind 写入的 state
   在 panel `refresh()` 时还没生效,导致列里看不到。

### 留给未来重试

如果将来想重做 mount API 化,先诊断清楚:
- 抓 picker 失败 / 失败位置 / `_setupNamespace` 的 return value / 错误堆栈
- 区分三个分支:FSA gesture 跨 API 边界丢 / kernel bind 实际成功但 Files
  列拿不到 / IDB 持久化失败
- 候选解法:把 `requestLocalDir` 拆 picker / persist / bind 三阶段,让
  panel 自己控制激活时序;或者 fs 层只暴露纯数据操作(`mounts.list` /
  `unbind` / `queryPermission`),picker 留 host-only 给 panel 自己

memory 已同步:`memory/files-panel.md` 末尾新增
「Mount-chain API attempt + rollback(2026-09-03)」 节,详细列出
「哪些 API 状态」「调查过的嫌疑路径」「当前 host-only 边界」
「留给未来重试」「改动文件清单」。

## 五十二、App Store 权限披露 + 按权限过滤(2026-09-03)

### 动机

App Store 当前只在 Edit / Install 弹窗里露出 `permissions.api` 文本,
浏览态只看到 kind / tags / enabled-state。`appsettings` 里要求"披露应用
请求的 Permission 列表",所以需要让"这个插件要用到哪些 API path"成为
**目录级别的可读信息**,并支持按权限反向查询("谁用了 fs.*?")。

### 改动

**新增内容**

- `PERMISSION_CATALOG`:每个 namespace 配一条 blurb + 常用 method 一行
  说明。覆盖 `panels / config / events / fs / terminal / tasks / vm /
  music / browser / files / agents / hotkeys / w9y / shell`。未在表
  里的 path 走 fallback,显示成 "Custom method path — not in the
  built-in catalog"。
- `describePermission(path)`:把 `terminal.write` 拆成
  `{ ns, label: "Terminal", methodLabel: "write", blurb: "Write input
  bytes to a terminal." }`。
- `summarizePermissions(plugin)`:`{ list, wildcards, others }` 给 chip
  排版用。
- `groupByNamespace(perms)`:把扁平数组按 namespace 折叠成
  `[ { ns, label, blurb, paths[] } ]`,给 PermissionPanel 的分组视图。

**新组件**

- `PermissionChip`:单条权限的 chip。命名空间标签 + method 标签;
  wildcard(`fs.*`)用金色描边以示作用域大。可选 `onClick` —— 在卡片
  / 列表的摘要里是按钮(点了跳过滤),在 modal / 展开面板里是静态
  `<span>`(纯文档)。
- `PermissionSummary`:一行版摘要。"Permissions:" + 前 2 个 chip +
  `+N more` 链接。Plugin 完全无权限时显示绿色 "No API permissions
  requested."。
- `PermissionPanel`:完整分组视图。按 namespace 分 section,每个
  section 有 blurb + 全量 chips,顶部 "N API permissions requested"。
  空态有图标的友好解释。
- `PluginDetailModal`:Grid view 点 "Permissions (N)" 按钮 / chip / 卡
  片顶部图标打开的详情弹窗。包含完整 PermissionPanel + Open 按钮 +
  关闭按钮(右上角 X + 点遮罩关闭)。

**Grid 视图变化**

- 每张卡片底部新增 `Permissions:` 一行摘要(前 2 个 chip + `+N more`)。
- 卡片 action row 新增 "Permissions (N)" 按钮(蓝色描边),点击打开
  detail modal。

**List 视图变化**

- 行布局改成 6 列:`chevron | icon | name/id | tags | perms | actions`,
  perms 列 `minmax(0, 420px)` —— 容器够宽时一行展开所有 chip,不够时
  自动换行;始终放不下就把行扩起来(见下)。
- 行首 `ChevronRight` / `ChevronDown` 按钮:点击切换该行的展开。
  展开后下方插入 `PermissionPanel`(完整分组视图)。
- 行 hover / expanded 状态走 `.as-row-wrap` 而非 `.as-row`,保证展开
  面板不破坏行 hover 高亮。
- 每行还显示 `PermissionSummary`,chip 本身可点(跳过滤)—— 不展开行也
  能 1-click 反查 "谁用了 X"。

**搜索栏新增 `perm:` 语法**

- `perm:<path>`:过滤包含此精确 path 的插件(也匹配声明了匹配 wildcard
  的,例如 `perm:fs.read` 同时匹配 `fs.*`)。
- `perm:`(空):只显示请求了至少 1 个 permission 的插件(`/ 33` → `16 /
  33`)。
- 任何以 `perm:` 开头的输入会在顶部加一条 banner:`Filtering by
  permission: <code>perm:...</code>` + Clear 按钮。
- placeholder 文案也改:"Search by name, id or use perm:<api-path> to
  filter by permission"。
- **chip click 即跳转**:summary 里的 chip 是按钮,点 Music 卡的 `Music
  *` 直接 `setQuery("perm:music.*")`,可见列表立刻 33 → 3。

**Store 状态新增**

- `expandedRows: Set<id>` —— 哪些行展开了。
- `detailPlugin: Plugin | null` —— 当前打开的 detail modal。
- `toggleExpandedRow(id)` / `openDetail(plugin)` / `closeDetail()`。

**CSS 新增**

- `.as-perm-chip` / `.as-perm-summary` / `.as-perm-panel` / `.as-perm-group` /
  `.as-perm-banner` / `.as-detail-modal` / `.as-row-wrap` / `.as-row-chevron` /
  `.as-row-expand` 全部新加。`@media (max-width: 720px)` 列表网格退化到
  4 列(chevron/icon/name+id/actions),tags+perms 折到 name 列下方。

### 验证(浏览器实测,localhost:8080)

- 启用 `app-store`, `panels.open("app-store")`。
- **Grid**:33 张卡,每张有 `Permissions:` 一行 + `Permissions (N)`
  按钮。`Runtime` 这类无权限插件显示绿色 "No API permissions
  requested."。
- **List**:33 行,每行右侧有完整 chip 摘要 + `+N more`;点 chevron 展开
  后看到完整分组(例:Music → 2 groups / 3 chips,Files → 4 groups /
  14 chips 之类)。
- **Detail modal**:点 Music 卡的 "Permissions (3)" → 弹窗显示 3 个
  permission 分 2 组(Music + Panels)。遮罩点关 / X 关均工作。
- **`perm:` 过滤**:
  - `perm:fs.*` → 3 / 33
  - `perm:panels.open` → 8 / 33
  - `perm:terminal.*` → 5 / 33
  - `perm:` → 16 / 33(任何 plugin with any permission)
  - 点 Music 卡 `Music *` chip → 自动 `setQuery("perm:music.*")` → 3 /
    33
- **空权限态**:Runtime 的详情弹窗显示 "No API permissions requested.
  This plugin runs in the same origin as the shell. It can read DOM and
  call bridge methods only inside its iframe."
- ESM 全清白;`node --input-type=module --check` 0 错误。
- Console 无 error / warning。

## 五十三、App Store 卡片 1:1 预览图(2026-09-03)

### 动机

之前 App Store 的卡片只有 icon + 文字描述,逛 33 个插件时很扁平,无法
快速看出 "这玩意儿大概长什么样"。给每张卡片加一块**正方形预览图**——
可以是 AI 生成的 stylized UI mockup,也可以是插件本身的真实截图(取决于
什么能渲染)。

### 实施

**生成管线:** `scripts/gen-app-store-previews.mjs`(230 行)— Node 脚本
逐个 `spawn("mmx", ["image", "generate", "--prompt", ..., "--aspect-ratio",
"1:1", "--out", "<id>.png"])`,33 个插件覆盖一遍。

**视觉风格统一**:每条 prompt 后面拼同一段 STYLE 常量(deep navy 渐变,
soft cyan-purple glow, rounded inner panel, cinematic),每个插件
subject 是它对应的 UI 元素(music player / file tree / IDE / Wagi Dog /
ASCII heart / matrix rain / etc.),accent 色按插件主色区分。整个
catalog 看起来像一组排版统一的卡片。

**生成结果**:`plugin/app-store/previews/<id>.png` 共 33 张,100–210 KB
每张,1:1 比例。`mmx image generate --aspect-ratio 1:1` 默认输出正方形
PNG。33 个全部 0 失败。

**二次精修**:第一轮里 `spotlight` 和 `terminal-frame` 偏模糊,重新跑
了带 "crisp focus, no blur" 的 prompt,`terminal-frame` 第二轮拿到清晰
的版本;`spotlight` 模型始终偏好 soft-focus,接受。

**集成到 App Store UI:**

- 新增 `PluginPreview` 组件:`<div className="as-card-preview">` +
  `<img src="previews/<id>.png">` + hidden fallback `<div>`(渐变背景
  + lucide icon,`onError` 时显示)。<img> 上挂 `loading="lazy"`,长列表
  只渲可视区域的图。
- 卡片结构从 `gap: 8px; padding: 14px` 改成上下两段:
  - 上:`PluginPreview`(全宽,`aspect-ratio: 1 / 1`,`object-fit: cover`,
    `overflow: hidden`,card `border-radius` 跟着 outer)
  - 下:`as-card-body`(原来的 icon/name/toggle/badges/perms/actions 全部
    移到这里,`padding: 14px`)
- 卡片 hover 时预览图轻微 `scale(1.02)` 过渡。
- 详情弹窗新增 `.as-detail-hero` —— 16:9 比例的横版 hero preview,
  在 modal 顶部占据完整宽度,把原来的小 icon 挪到 hero 下方的 header
  左侧,视觉层次更分明。
- 用户自装无 `previews/<id>.png` 的插件:不破图,直接走 fallback
  (lucide icon + radial gradient),跟整个暗色系一致。

### 验证(浏览器实测,localhost:8080)

- 启用 `app-store`, `panels.open("app-store")`。
- Grid 33 张卡,每张有完整预览图。Web Pet 实际跑出**真 3D 立体的
  Shiba Dog + podium**,Crush 跑出 phone 里的 ASCII heart,Rick Roll
  跑出 sunset + palm trees 的 80s 视频 thumbnail,Music 跑出
  music player UI。
- 滚动整个 catalog 33/33 图全部 lazy-load 成功。
- `perm:fs.*` 过滤后剩 3 张(files / notes / gearshell-docs),三张
  都有对应预览图。
- 详情弹窗:Music 的 hero 显示正方形 Music player UI,下方接 metadata
  header + PermissionPanel(分组 3 permissions / 2 groups)。
- 卡片预览缺失(用户自装未生成预览):fallback 显示 lucide icon,
  视觉节奏不破。
- ESM check 全清白;console 无 error。

### 文件清单

```
新增 scripts/gen-app-store-previews.mjs
新增 plugin/app-store/previews/*.png (33 张)
改动 plugin/app-store/index.html (PluginPreview 组件 + 卡片结构)
改动 plugin/app-store/app-store.css (preview/fallback/hero 样式)
```

### 用户体验

- 浏览 catalog 时一眼能看到每个插件"长什么样"——Music 是粉色音乐卡,
  Files 是青色文件夹图标,Runtime 是橙色脉冲,Wagi Dog 是立体
  Shiba Dog 站在台上。
- 自装插件的 fallback 让 grid 永远整齐,不会出现破图图标。
- Hero 在详情弹窗里给了一个杂志封面般的开场,PermissionPanel 接
  在下面,信息密度合理。

### 已知 / 下一步

- ⬜ **w9y / Spot Light 预览图抽象**:模型给出的版本偏 blurred,可
  能值得换 prompt 重跑,但 accent + 主体都识别得出,优先级低。
- ⬜ **可插拔来源**:目前预览是静态 PNG;以后可以扩展成"优先
  插件自带的 og:image / screenshot,缺失再走 AI 生成"。

## 五十四、App Store 预览图重做:真正的 app icons(2026-09-03)

### 反馈

第一轮"preview images"生成的是**装饰卡片**(device frame / panel UI /
placeholder objects),不是图标。要求修正:
- 必须**纯黑**(solid #000000),不是 navy 渐变
- **单一 subject**,不要设备边框 / 窗口 / 卡片外壳
- 不要中央小框包图标——要 subject 自己撑满画面
- 不要纯 placeholder,要"简约大气,突出应用特点"
- 生成**真正的 app icon**(让人一眼看出这 app 干嘛的)

### 4 轮迭代

**Pass 1**(初版)— 33 张卡片式 UI mockup,被否定。

**Pass 2**(重写 prompt)— 加更严的 STYLE 约束:
"pure flat black, no glow halo, no drop shadow, subject occupies ~60% of
frame, single accent color"。Music / Files / Wagi Dog 这一轮出来非常
好;但很多 subject 仍然太小(settings / runtime / home / group /
glmatrix),还有一些带 glow halo(notes / default-page / spotlight)。

**Pass 3**(13 张)— 把太小的 5 张 + 带 glow 的 4 张 + placeholder 的 4 张
重跑,prompt 更明确"F"填"fill the entire frame, edge to edge"。多数修
正到位,但 deck 被解读成 Discord 聊天气泡,widgetbot 渲染成 PlayStation
手柄,widgetbot 太小,lucide-icons 还是偏小。

**Pass 4**(10 张)— 修 deck / widgetbot / lucide-icons / bonsai / codigo /
browser / app-store / crush-playground / launcher / spotlight。

**Pass 5**(2 张)— 收尾:rv64 之前的 microchip 太小,terminal-frame 的 ">"
被解读成一个像素大的点,最后两轮精确 prompt 修掉。

最终 32 张(去掉无独立身份的 `iframe-template` 模板)全部可用。
脚本拆成 4 个文件:`gen-app-store-previews.mjs` (全量) +
`regen-weak-icons.mjs` / `-2.mjs` / `-3.mjs` (按 pass 增量修复)。

### 设计决策

- 每个图标 prompt **只换 subject + accent**,STYLE 段完全相同 —— 视觉
  节奏统一。
- 把 accent 颜色硬性写进 prompt(`#60a5fa` 等具体 hex),防止模型默认
  渲成白色(第一轮失败模式)。
- 加 "fill the entire frame" + "edge to edge" 防止 subject 太小。
- 加 "No glow halo, no drop shadow" 防止模型自加 card silhouette。
- iframe-template 故意没有生成——它只是模板,没有独立的图标身份,
  fallback 走 lucide icon。

### 最终图标清单(精选)

- **Music**: 粉色八分音符 ♪
- **Files**: 青色文件夹
- **Settings**: 大蓝色齿轮
- **Music / Files / Web Pet / W9y / Spotlight / Default-page / Playground
  / Notes**: 单色实心图标,完美 accent
- **Runtime**: 橙色同心圆 target
- **Wagi Dog**: 真 3D 立体的 Shiba Dog 头像
- **Crush**: 红粉 ASCII heart(像素方块组成)
- **Rick Roll**: 复古磁带
- **Terminal-frame**: 粗绿 ")"
- **V86**: 立体 CPU 芯片
- **Launcher**: 火箭
- **Browser**: 蓝色 wireframe 地球
- **Codigo**: 红色 "< >"
- **Glmatrix**: 绿色片假名字符雨(5 列)
- **Web Pet / Wagi Dog / Spotlight / Default-page**: 单主体,无 frame

### 验证

- 32/32 PNG 文件生成,平均 ~80 KB,1:1 比例
- App Store grid 嵌入后,33 张卡片 32 张有图(剩下 iframe-template 走
  fallback lucide 图标)
- 滚动整个 catalog 全部 lazy-load 成功
- 视觉对比第一版:卡片变图标,主体清晰,无设备边框,无中央 frame

### 文件清单

```
plugin/app-store/previews/*.png (32 张)
scripts/gen-app-store-previews.mjs
scripts/regen-weak-icons.mjs
scripts/regen-weak-icons-2.mjs
scripts/regen-weak-icons-3.mjs
```
