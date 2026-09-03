---
title: Bonsai 27B WebGPU Kernels
emoji: 🌳
colorFrom: gray
colorTo: indigo
sdk: static
pinned: false
short_description: Run a 1-bit 27B LLM locally in your browser on WebGPU
models:
- prism-ml/Bonsai-27B-gguf
thumbnail: https://cdn-uploads.huggingface.co/production/uploads/61b253b7ac5ecaae3d1efe0c/1-g5gJ_Dy0Bt0L8fK7NY7.png
---

Run a 1-bit 27B LLM locally in your browser on WebGPU. No server, no
install — open `buildless.html` and the page loads the GGUF straight
from Hugging Face, runs inference via `bitgpu`, and streams answers
into a chat panel.

Check out the configuration reference at
https://huggingface.co/docs/hub/spaces-config-reference

---

# Bonsai — buildless source map & architecture

`buildless.html` uses native browser modules. No bundler or local dependency
installation is required.

---

## Directory layout

```
src/
├── core/         framework-level: config, loader, app controller
├── scenes/       Three.js scenes
│   ├── background.js
│   ├── prism/    14 focused modules — utils → constants → optics → ...
│   └── garden/    8 focused modules — utils → assets → ...
├── chat/         chat surface — events, markdown renderer, region CSS
├── model/        model access + WebGPU kernel
│   └── kernel/   kernel sources + kernel inspector (UI + JS)
└── ui/           global / landing / access-gate stylesheets
```

| Path                                     | Responsibility                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/core/config.js`                     | Runtime access-gate configuration                                                                                     |
| `src/core/loader.js`                     | Landing-stage state and model loading progress UI                                                                     |
| `src/core/app.js`                        | Chat session state and UI orchestration                                                                               |
| `src/scenes/background.js`               | Ambient Three.js backdrop                                                                                             |
| `src/scenes/prism/*.js`                  | Landing prism Three.js scene and handoff cleanup (14 modules)                                                         |
| `src/scenes/garden/*.js`                 | Post-load garden Three.js scene (8 modules)                                                                           |
| `src/chat/events.js`                     | Typed UI events over bitgpu's chat stream                                                                             |
| `src/chat/markdown.js`                   | Incremental Markdown and KaTeX answer rendering                                                                       |
| `src/model/access.js`                    | Access gate, WebGPU availability checks, and model load lifecycle                                                     |
| `src/model/catalog.js`                   | Model weights, tokenizer, and generation metadata                                                                     |
| `src/model/fetch.js`                     | Authenticated GGUF requests and optional Cache Storage integration                                                    |
| `src/model/worker.js`                    | Module Worker hosting the bitgpu runtime                                                                              |
| `src/model/bonsai-client.js`             | Main-thread facade for the Worker                                                                                     |
| `src/model/adapter.js`                   | Model URL resolution, Hugging Face access-token requests, loading progress, and the UI-facing streaming chat contract |
| `src/model/kernel/sources.js`            | WGSL kernel-source catalogue                                                                                          |
| `src/model/kernel/inspector.js`          | Kernel-source dialog and search UI                                                                                    |
| `src/ui/landing.css`                     | Landing composition and transition styles                                                                             |
| `src/ui/access-gate.css`                 | Hugging Face access-gate styles                                                                                       |
| `src/ui/app.css`                         | Shared overrides and final responsive rules                                                                           |
| `src/chat/*.css`                         | Chat layout, messages, composer, and Markdown styles (one file per region)                                            |
| `src/model/kernel/inspector.css`         | Kernel-source dialog styles                                                                                           |

---

## Boot order

`buildless.html` is the single entry. Script and link tags must load in
this exact order — each later script assumes the earlier ones have
already attached their globals.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. src/core/config.js              (plain script, runs synchronously)    │
│    → reads URL params, sets App / __BONSAI_HOLD_LANDING / etc.           │
│                                                                          │
│ 2. three.min.js                    (CDN, plain script)                    │
│    → defines global `THREE`                                            │
│                                                                          │
│ 3. src/core/loader.js              (plain script, runs synchronously)    │
│    → exposes window.{SEED, FREEZE, REDUCED, AZ_FIX, START_STAGE,         │
│                     QS, state, byId, simulate, stepProgress,             │
│                     updateDom, SPEED, App, BonsaiLoader}                  │
│                                                                          │
│ 4. src/scenes/background.js        (ES module)                           │
│    → paints the always-on sceneBG canvas                                 │
│                                                                          │
│ 5. src/scenes/prism/index.js       (ES module)                           │
│    → on landing stage: instantiates PrismScene                          │
│    → always: assigns App.bootLanding so model-access can fire it         │
│                                                                          │
│ 6. src/scenes/garden/index.js      (ES module)                           │
│    → always: constructs GardenScene (wired into App.startGarden)        │
│    → on loading stage: flips body class and starts the grow animation   │
│                                                                          │
│ 7. src/core/app.js                 (ES module)                           │
│    → boots chat events, kernel inspector, model access, mode toggles    │
└──────────────────────────────────────────────────────────────────────────┘
```

Style sheets (`src/ui/landing.css`, `src/ui/access-gate.css`,
`src/chat/*.css`, `src/model/kernel/inspector.css`, `src/ui/app.css`)
load in parallel with the scripts; order between CSS files does not
matter, but they must precede any module that touches relevant DOM
nodes.

---

## Module dependency graph

Three.js scene modules are organized around **classes that compose
mixins by topic** (`Object.assign(prototype, MethodMixins)`), with
single-purpose helper modules feeding pure-math primitives up the
chain.

### Prism scene — `src/scenes/prism/`

```
utils.js                    ─── pure numeric helpers (clamp, hermite, SPD)
        ▲
        │
constants.js                ─── scene-wide counts and geometry numbers
        ▲
        │
optics.js                   ─── Cauchy dispersion + spectral color
        ▲
        │                          ┌──────────────────────────────┐
textures.js                 ──┐  │ trace.js                     │
shaders.js                  ──┼──│   2D ray-trace primitives    │
geometry.js                 ──┘  └──────────────────────────────┘
        ▲                              ▲            ▲
        │                              │            │
        │              ┌───────────────┘            │
        │              │                            │
trace-methods.js        ── trace / castRay / column writers
update.js                ── per-column updates + optics
pulse.js                 ── pulse palette helper
        ▲
        │
init.js                   ── constructor + 14 init*() methods
frame.js                  ── drag / resize / animate
        ▲
        │
class.js                  ── composes PrismScene + bootPrismScene
        ▲
        │
index.js                  ── entry: wires App.bootLanding, decides
                              whether to boot immediately
```

### Garden scene — `src/scenes/garden/`

```
utils.js                   ─── TAU / Vector3 / clamp / lerp / Mulberry32
        ▲
        │
assets.js                  ─── canvas textures, palette, shared mat
        ▲
        │
blossom.js                 ─── blossom cloud packing (one tpl)
tree.js                    ─── TreeBuilder algorithm
        ▲
        │
init.js                    ─── renderer / lights / props / tree / petals
update.js                  ── per-frame updates + animate
        ▲
        │
class.js                   ─── composes GardenScene
        ▲
        │
index.js                   ─── entry: constructs scene, wires startGarden
```

### Background

`src/scenes/background.js` is self-contained — the always-on glow + word
layer. No mixins; one file because the whole behaviour is one canvas.

---

## Naming conventions

| Kind            | Pattern              | Example                       |
| --------------- | -------------------- | ----------------------------- |
| Three.js scene  | `scenes/<name>/*.js` | `scenes/prism/init.js`        |
| Top-level mod.  | `<dir>/<role>.js`    | `core/loader.js`, `chat/events.js` |
| Worker          | `model/<role>.js`    | `model/worker.js`             |
| Stylesheet      | `<dir>/<part>.css`   | `chat/message.css`            |
| Class export    | `<Role>`             | `PrismScene`, `GardenScene`   |
| Method group    | `<Role><Topic>Methods` | `PrismInitMethods`          |
| Boot helper     | `boot<Scene>`        | `bootPrismScene`              |
| Module entry    | `index.js`           | `scenes/prism/index.js`       |

The directory already says `scenes/` and `prism/`, so the file name
stays short — `scenes/prism/utils.js`, not
`scenes/prism/scene-prism-utils.js`.

---

## The "50-line rule" — spirit, not letter

Each file should tell one story, readable end-to-end in ~30 seconds.
A handful of files legitimately exceed because they hold *one* cohesive
artefact that cannot be cleanly cut without inventing fake seams:

| File                                | Lines | Reason it stays whole                                 |
| ----------------------------------- | ----- | ----------------------------------------------------- |
| `scenes/prism/shaders.js`           | ~122  | GLSL strings must be contiguous to read               |
| `scenes/prism/init.js`              | ~393  | 14 publicly-named `init*` methods, IDE-foldable       |
| `scenes/garden/tree.js`             | ~457  | TreeBuilder is a single recursive algorithm           |
| `core/app.js`                       | ~419  | Top-level app controller; one user-visible surface    |
| `scenes/prism/trace-methods.js`     | ~280  | The `trace()` family is one computation graph         |
| `scenes/garden/init.js`             | ~289  | Same init-cluster rationale as the prism scene        |
| `scenes/prism/geometry.js`          | ~180  | One geometry/material factory                         |
| `scenes/prism/update.js`            | ~218  | Per-frame update cluster                              |
| `scenes/garden/update.js`           | ~261  | Per-frame update cluster                              |
| `scenes/background.js`              | ~242  | One canvas, two passes                                |

Everything else is under 200 lines and most under 100.

When adding new code: prefer a new file over padding an existing one.
If the new code is "another method on an existing class", put it in
the right `init.js` / `update.js` / `frame.js` mixin rather than
inflating the class file.

---

## Globals contract

Only `src/core/loader.js` writes to `window`. Scene modules are
readers. The full surface that ES modules may read off `window`:

| Name             | Set by        | Meaning                                      |
| ---------------- | ------------- | -------------------------------------------- |
| `THREE`          | `three.min.js`| The library                                  |
| `App`            | `loader.js`   | `{ bootLanding, startGarden, flatMode, ... }`|
| `BonsaiLoader`   | `loader.js`   | Loading stage façade                         |
| `SEED`           | `loader.js`   | RNG seed (from URL or default)               |
| `FREEZE`         | `loader.js`   | `null` or timestamp — pause animation        |
| `REDUCED`        | `loader.js`   | `true` if the user wants reduced motion      |
| `AZ_FIX`         | `loader.js`   | Pin to azimuth 0 (deterministic first frame) |
| `START_STAGE`    | `loader.js`   | `"landing"` or `"loading"`                   |
| `QS`             | `loader.js`   | Parsed URLSearchParams                       |
| `state`          | `loader.js`   | `{ reduced, ... }` runtime flags             |
| `byId`, `simulate`, `stepProgress`, `updateDom`, `SPEED` | `loader.js` | helpers used by the loading stage |

`__BONSAI_HOLD_LANDING` is set by `src/core/config.js` and read by
`src/scenes/prism/index.js`; nothing else should touch it.

---

## CSS layout

Chat CSS is split by **region**, not by feature, so a new class can be
added next to its peers:

| File                                  | Region                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `src/chat/shell.css`                  | overlay shell + scroll track + `.kx` shared rule         |
| `src/chat/header.css`                 | top bar (header, status, buttons)                        |
| `src/chat/thread.css`                 | scroll column + welcome card                            |
| `src/chat/message.css`                | per-message row (msg, bubble, caret, meta)               |
| `src/chat/markdown.css`               | assistant body (thinking block + markdown)               |
| `src/chat/composer.css`               | input row (field, send/stop, bulb, tip)                  |

Keyframe definitions live in the file that **owns** the animated
selector (`cPulse` in `chat/header.css`, `cRise` in `chat/message.css`
because every message uses it, `tShimmer` and `aBlink` next to their
respective selectors).

Other stylesheets:

| File                                  | Purpose                                |
| ------------------------------------- | -------------------------------------- |
| `src/ui/landing.css`                  | Landing page chrome (canvas overlays)   |
| `src/ui/access-gate.css`              | Token gate dialog                      |
| `src/ui/app.css`                      | Global resets / typography / utilities |
| `src/model/kernel/inspector.css`      | Kernel inspector overlay               |

---

## Tasks

`src/deno.json` pins the formatter:

```
deno task fmt         # format everything in src/
deno task fmt-check   # dry-run, exit 1 if anything's off
deno task lint        # deno lint (advisory; hints, not a gate)
```

---

## Larger stateful pieces

- `ModelAccess` in `model/access.js` owns the access gate, token
  validation, and the load lifecycle; `setupModelAccess()` wires
  events and boots the page.
- `KernelInspector` in `model/kernel/inspector.js` owns the
  kernel-source dialog; the WGSL highlighter and its keyword/type
  tables live at module scope.
- `TreeBuilder` in `scenes/garden/tree.js` grows the seeded bonsai
  tree; each build step (roots, moss, branches, canopy, pad
  scheduling) is one method.
- `GardenScene` in `scenes/garden/class.js` owns the post-load
  bonsai animation (growth, petals, wind, and camera);
  `BackgroundScene` in `scenes/background.js` and `PrismScene` in
  `scenes/prism/class.js` own their respective scenes.

The chat turn in `core/app.js` is driven by a small state object:
`createTurnState()` builds the message, `consumeTurnEvent()` applies
stream events, and `finishTurn()` finalizes meta, history, and
context-full handling. Scene classes are composed from per-topic
method mixins via `Object.assign(prototype, …)` so each topic lives
in its own focused file.

---

## Pinned runtime

The GPU implementation is loaded as pinned browser ESM from jsDelivr:

- `bitgpu@0.19.1/dist/index.js`: WebGPU inference engine
- `bitgpu@0.19.1/dist/gguf.js`: GGUF parser and Bonsai-27B model
  manifest adapter
- `bitgpu@0.19.1/dist/chat.js`: tokenizer, Jinja chat template, and
  streaming chat layer

For its default model, the page also reads bitgpu's pinned,
GPU-validated `models/bonsai-27b-gguf/manifest.json` and auxiliary
lookup table from jsDelivr. The 3.8 GB GGUF still streams directly
from Hugging Face. A custom `?src=` GGUF continues to use bitgpu's
browser-side GGUF parser.

The answer renderer also loads pinned browser ESM from esm.sh:
`marked@17`, `katex@0.16`, and `dompurify@3.2.6`. DOMPurify sanitizes
generated Markdown before it is inserted into the page.

`Bonsai-27B` requests bitgpu's `q8` KV cache and `f16` activation
path. The runtime falls back safely when `shader-f16` is
unavailable. Its pinned Qwen3.5 hybrid backbone does not support
bitgpu's `overflow: "sinks"` policy, so this page retains strict
context-window errors rather than exposing an invalid fixed-memory
option.

For the default Bonsai-27B model, each turn uses bitgpu's upstream
recommended sampling settings: `temperature: 0.5`, `topP: 0.85`, and
`topK: 20`. Custom `?src=` GGUF URLs retain bitgpu's own defaults
unless their caller supplies turn options.

Thinking is opt-in per turn (the composer bulb). Two query
parameters add optional bounds without changing default behavior:

- `?thinkBudget=N` forces bitgpu to close `</think>` after N
  reasoning tokens.
- `?thinkEarlyStop` enables bitgpu's logit-confidence early stop
  for thinking (`?thinkEarlyStop=off` explicitly disables it).

Both are candidate-filter features in bitgpu@0.19.1 and work on the
pinned Qwen3.5 hybrid backbone. They are deliberately not part of
the default page: the original page never bounded reasoning, so
default turns stay equivalent.

Evaluated and not integrated: `chat.save/restore` snapshots are full
KV-cache serializations (heavy for a 4096-token q8 cache on a 27B
hybrid), and delta snapshots (`prewarm` + `save({ delta: true })`)
are explicitly rejected by the engine for the qwen3_5 hybrid
backbone; `prewarm` alone only serves that checkpointing pattern;
`countTokens` has no original-page UI equivalent that would not
change existing behavior. `promptLookup` is left disabled because
the hybrid backbone rejects it and the page never forwards it.

Add `?runtime=worker` to host bitgpu in a module Worker, following
bitgpu's worker example. This is opt-in because Worker WebGPU
availability differs by browser; the default keeps the broadly
compatible main-thread runtime.

The Kernels panel reads static WGSL files lazily from the same
pinned `bitgpu` source tag on jsDelivr. Public `bitgpu` does not
expose browser-specific compiled-pipeline variants, so the displayed
code is the pinned source catalogue rather than a serialization of
live pipelines.

The source for the pinned runtime is available at
<https://github.com/stfurkan/bitgpu/tree/v0.19.1/src>. The prior
self-contained bundle is preserved in commit `b7eac7e` and is no
longer loaded by the page.