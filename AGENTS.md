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
- **No cache-bust tokens**: modules are unversioned (no `?v=` — the old
  token cascade was retired). The URL is the module identity: browsers
  cache ES modules by full URL, so any URL divergence (even a stray token
  on one importer) loads the module twice, breaking DI/singleton state
  (e.g. `files-registry.js` "initFiles has not been called"). Keep every
  importer on the bare path. For iteration use the dev server's no-store
  headers or DevTools Network > "Disable cache"; for production bumps rely
  on revalidation (`Cache-Control` on the host). `scripts/verify-static.mjs`
  fails the build if a token reappears.
- **Verify ESM after editing modules**: `node --check file.js` uses CommonJS
  detection on .js files without a `package.json` type and misses strict-mode
  errors (duplicate declarations, top-level hooks). Use
  `node --input-type=module --check < file.js` and a full import/export
  resolution pass after rewriting any module; see
  `memory/verification-pitfalls.md` for the scripts and the heredoc/splice
  traps that caused the last regression.
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
