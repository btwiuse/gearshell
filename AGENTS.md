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
- **500-line rule**: any JS file over 500 lines must be split into multiple
  files. Each module stays cohesive (one concern per file); split files when
  the limit is hit rather than growing them.
- **50-line function rule**: any function over 50 lines is unacceptable and
  must be refactored into smaller helpers (one responsibility each). This
  applies to arrow callbacks (e.g. `useEffect`), named functions, and methods
  alike; break them up as soon as the limit is approached, not after.
  Generated code is exempt: minified bundles and build artifacts (e.g.
  `browser/*.sw.js`, which are webpack output of the `browser.js` submodule)
  must not be hand-refactored, only regenerated from their source.
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
