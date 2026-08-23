# AGENTS.md

This repository is **GearShell**: a Web Native Agent Sandbox ("浏览器即沙盒") —
a buildless static web app that runs CLI agents, tools, and SDKs in the
browser (VFS isolation, PTY, WASI runtimes). See `README.md` for the full
pitch and `memory/repo-layout.md` for the structure.

## Rules

- Source is vanilla JS/CSS with no build step; `index.html` is the entry.
- The five directories `browser/`, `isolation/`, `wanix-workbench/`, `bonsai/`,
  `web-pet/` are git submodules; update their pointers deliberately and commit
  the pointer change.
- `docs/` and the `神奇海螺队-第一轮评审/` materials are deliverables for the
  HKUST startup competition; changes there should keep the pitch documents in
  sync.
- Reusable research notes live in `memory/` (one Markdown file per topic,
  `Home.md` as the index, auto-loaded every session via `option
  context-path memory/Home.md` in `.crushrc`).
- `memory/` is a git submodule whose remote is the wiki repo
  `btwiuse/gearshell.wiki`; `scripts/sync-wiki.sh` publishes it (Home.md is
  the wiki front page).
- 适时地 document findings to `./memory`,每个主题一个文件,并维护
  `Home.md` 索引;consolidate 可复用信息供未来的会话参考。
- After editing `memory/`: run `scripts/sync-wiki.sh` to publish, then
  `git submodule update --remote memory` to advance the pointer, then commit
  the pointer in the main repo.
