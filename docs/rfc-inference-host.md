# RFC: `GearShell.inference` — Shell-Native LLM Inference Host

**Status:** Draft
**Author:** Crush (round 66, follow-up to rounds 64/65 perf fixes)
**Target:** GearShell `main` branch

## Summary

Move Bonsai 27B (and future local models) out of `plugin/bonsai` and into
a long-lived inference host that exposes chat sessions through
`GearShell.inference.*`. The plugin shrinks to a markdown-rendering
client; the shell gains a CLI (`gear inference chat`), terminal piping,
and cross-panel model sharing — one model load, many consumers.

## Motivation

Today, every entry point that wants LLM inference bundles the whole
stack: the bitgpu engine, a 3.8 GB model download, the chat plumbing,
the tool-loop wiring, and the markdown renderer. `plugin/bonsai`
duplicates this; `plugin/playground`, `plugin/launcher`, and any future
"AI in panel X" idea would each have to do the same. Concrete problems:

1. **Per-tab model load.** Each tab that opens Bonsai triggers the
   3.8 GB Hugging Face download / cache lookup. The root `bonsai/` page
   and `plugin/bonsai` are independent — opening both loads twice.
2. **Per-tab GPU contention.** Each tab requests its own WebGPU
   adapter. Chrome returns the fallback adapter once the high-
   performance one is taken, halving token throughput (see round 65
   background memory).
3. **Tool wiring is plugin-local.** `tool-runner.js` "+" `tools.js`
   know about `GearShell.bash.run`, but the wiring lives in
   `plugin/bonsai`. Other plugins that want tools have to reinvent
   this loop.
4. **No shell-native AI.** `gear` (the CLI) can't drive inference
   because the engine only exists inside a browser tab. Terminal
   users can't pipe model output.
5. **Bonsai = the only model.** Adding a smaller Qwen, a code-tuned
   variant, or a remote endpoint means forking the plugin.

The root `bonsai/` page is the reference implementation; everything
described below can be lifted directly out of it into a host module.

## Goals

- **G1.** One model in VRAM, N consumers (any panel, any iframe, any
  CLI shell).
- **G2.** Streaming events with the same shape every GearShell
  surface uses (`{type, payload}` push or AsyncIterable).
- **G3.** Tool calls round-trip through `GearShell.*` without the
  consumer re-implementing the loop.
- **G4.** Hot-swap models (cache-resident + LRU + explicit unload).
- **G5.** Existing `plugin/bonsai` continues to work during migration
  by consuming the new API.

## Non-goals

- Multi-model parallelism (one model loaded at a time; switching
  evicts the previous one).
- Cross-tab shared adapter (each tab still owns its own WebGPU
  device; only the chat session abstraction is shared via `postMessage`).
- Server-side inference. Host is local WebGPU; remote endpoints are a
  separate RFC.

## Design

### Topology

```
┌──────────────── GearShell Shell (top frame) ────────────────┐
│                                                             │
│   ┌──────────────────────┐    ┌────────────────────────┐   │
│   │ inference-host.js    │    │ workspace-api.js       │   │
│   │ (long-lived Worker)  │◄──►│ GearShell.inference.*  │   │
│   │ holds bitgpu + KV    │    │ permission check       │   │
│   │ session registry     │    └────────────────────────┘   │
│   └──────────▲───────────┘              ▲                   │
│              │ postMessage              │                   │
│              │ (typed events)           │                   │
│   ┌──────────┴──────────────────────────┴──────────────┐   │
│   │ Clients (any number, any frame)                   │   │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐ │   │
│   │  │ plugin/  │ │ plugin/  │ │ /bin/    │ │ CLI │ │   │
│   │  │ bonsai   │ │ agentic  │ │ shell    │ │ xterm│  │   │
│   │  │ (UI)     │ │ workspace│ │ (pipe)   │ │     │ │   │
│   │  └──────────┘ └──────────┘ └──────────┘ └─────┘ │   │
│   └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

The host is a `Worker` (module type) that wraps the existing
`Bonsai27B` engine from `plugin/bonsai/src/model/adapter.js`. It
holds:

- The bitgpu engine and KV cache for the currently-loaded model.
- A registry of chat sessions (system prompt, messages, generation
  config, abort controller).
- The on-disk cache (`cache-manager.js` from the plugin) and the
  fetch pipeline (`fetch.js`).

The shell exposes `GearShell.inference.*` through `workspace-api.js`
(gated by `permissions.api` like every other namespace). Every method
is a `postMessage` round-trip with a request id; streaming responses
arrive as separate push events on a dedicated topic.

### Public API

The shape mirrors the existing namespaces (`fs`, `music`, `bash`):

```js
// Top-level
const models = await GearShell.inference.list();
//   [{ id: "bonsai-27b", size: 3.8e9, ctx: 4096, ... }]

const session = await GearShell.inference.create({
  model: "bonsai-27b",
  systemPrompt: "You are GearShell...",
  ctx: 4096,
  temperature: 0.5,
  topP: 0.85,
  topK: 20,
});
//   { id, model, contextLength, ... }

const stream = await session.send(messages, { signal });
for await (const event of stream) {
  switch (event.type) {
    case "thinking": console.error("[think]", event.delta); break;
    case "text":     process.stdout.write(event.delta); break;
    case "tool_call": await handle(event.call); break;
    case "complete": return;
  }
}

// Tool round-trip (host is stateless about tools; consumer drives)
await session.pushToolResult(callId, content);

// Lifecycle
await session.abort();
await session.reset();      // clear context
await session.close();      // free the session slot

// Host control
await GearShell.inference.loadModel("bonsai-27b");
await GearShell.inference.unload();     // free VRAM
await GearShell.inference.status();     // { model, sessions, vram }
```

The streaming return value is an `AsyncIterable` so consumers can
`for await` naturally. For non-async contexts (legacy plugin
callbacks) the host also pushes events onto the standard GearShell
event channel:

```js
GearShell.on("inference.text",     ({sessionId, delta}) => {...});
GearShell.on("inference.thinking", ({sessionId, delta}) => {...});
GearShell.on("inference.tool_call",({sessionId, call}) => {...});
GearShell.on("inference.complete", ({sessionId, tokens}) => {...});
```

A consumer picks one — `for await` is preferred; the event channel
exists for the `plugin/bonsai` markdown renderer which uses callback
plumbing today.

### Tool execution

The host does **not** know about specific tools. It announces
`tool_call` events with `{name, arguments, id}` and waits for the
consumer to push a result. The consumer can either:

1. Execute the tool itself by calling `GearShell.bash.run(...)`,
   `GearShell.fs.read(...)`, etc., then `session.pushToolResult(...)`.
2. Defer to a higher-level orchestrator (an agent loop) that
   dispatches tools.

This keeps the host generic — adding a new tool (`fs.search`,
`net.fetch`, etc.) doesn't touch the host at all.

For the 80% case (the bash tool that `plugin/bonsai/tools.js` already
defines), `GearShell.inference` ships a default tool resolver:

```js
const session = await GearShell.inference.create({
  model: "bonsai-27b",
  tools: ["bash_run"],          // built-in tool names
  systemPrompt: "...",
});
```

The host resolves `bash_run` → `GearShell.bash.run` internally,
executes the call, and pushes the result back into the model. The
consumer still sees `tool_call` events if it wants to render them,
but the loop is closed inside the host.

### Permission gating

`permissions.api` (already in `workspace-api.js`) is extended with:

```json
{
  "inference": {
    "create": true,        // session creation
    "send": true,          // stream turns
    "loadModel": false,    // load/unload cost VRAM
    "subscribe": true      // event channel
  }
}
```

A plugin that only wants to *consume* an existing session (e.g. a
rendering panel) gets `create: false, send: false, subscribe: true`
plus a session id. This is how the iframe bridge gets a narrow
capability.

### Session lifecycle and resource limits

- **Max concurrent sessions:** 4. A 5th `create` waits on the
  registry; this prevents one agent from monopolising the host.
- **Idle eviction:** sessions with no `send`/`pushToolResult` for
  10 minutes get closed; their messages are persisted if
  `persist: true` was passed at create time.
- **Model LRU:** Only one model in VRAM at a time. `loadModel` evicts
  the previous model (with a confirmation prompt if there are active
  sessions). On-disk cache hit is fast (~seconds); cold load is the
  3.8 GB download.

### Migration path

Three phases, each shippable independently:

**Phase 1 — Host extraction.** Move the bitgpu engine, model fetch,
cache, and chat session loop from `plugin/bonsai/src/model/` into a
top-level `inference/` directory (`inference/host.js`,
`inference/bonzai27b.js`, `inference/cache.js`,
`inference/manifest.js`). The plugin now talks to the host via
`GearShell.inference.*` shimmed through `workspace-api.js`. The
root `bonsai/` page also gets refactored to use the same API (its
`worker.js` becomes a thin wrapper around the host's primitives).
No UI changes yet.

**Phase 2 — Client rewrite.** `plugin/bonsai/src/chat/turn.js`,
`tool-runner.js`, `markdown.js` keep their rendering logic but
switch their source from `chat.streamTurn` to
`GearShell.inference.create({...}).send(...)`. The plugin's HTML
stops loading the bundled bitgpu (~600 KB of JS) and the worker
shim. Boot time drops by ~1s and the plugin's tab stops requesting
its own WebGPU adapter.

**Phase 3 — Surface expansion.** Wire `gear inference chat` in the
CLI, add `bin/shell` integration (the terminal panel can spawn a
chat as a sub-pipe), expose inference sessions through
`plugin/playground` and `plugin/agentic-workspace`. Each new
consumer inherits tool support and streaming for free.

### Open questions

- **Q1.** Should the host survive a model unload while sessions are
  active? Option (a) reject unload with active sessions; option (b)
  serialise state to OPFS and reload on next send. Memory says
  `wanix-localdir-mount.md` covers similar OPFS tradeoffs.
- **Q2.** Multi-tab shared session: when two tabs hold the same
  `sessionId`, who renders text? Today's iframe migration memory
  (Notes plugin) hit the same question; lean on the existing
  `bridgeOn` lazy-subscribe pattern.
- **Q3.** Remote endpoints (OpenAI, Anthropic) — same `inference.*`
  surface, different host implementation. Defer to a separate RFC
  but design the API so the host is pluggable.
- **Q4.** Backpressure: how does the host behave when a slow
  consumer (an iframe in a background tab) can't keep up with
  token events? Drop oldest, drop newest, or buffer?

### Out of scope

- Fine-tuning / LoRA on the local model.
- Multi-GPU (the model fits in one device's VRAM).
- Speculative decoding.
- Token-level cancellation (already supported via `AbortSignal`).

## Drawbacks

- **More moving parts.** One Worker, one shell-side bridge, one
  consumer API. Debugging crosses a `postMessage` boundary.
- **One extra round-trip per request.** Inline inference is faster by
  one tick; for high-frequency agent loops this might matter. The
  fallback `?runtime=inline` keeps the old path.
- **Permission surface grows.** `inference.*` joins `bash`, `fs`,
  `net`, etc. Users need to understand the capability.

## Alternatives considered

- **A. Leave inference inside plugins.** Status quo. Each plugin
  pays the model-load cost; tool wiring is duplicated; no CLI access.
- **B. Service-worker host.** Background fetch + WebGPU. Rejected
  because service workers can't access WebGPU reliably across browsers.
- **C. SharedWorker host.** Closer to a real cross-tab singleton, but
  SharedWorker + WebGPU has the same adapter-per-context problem and
  adds lifecycle complexity (workers die on last tab close).

## Success criteria

- Opening `plugin/bonsai` in 5 tabs loads the model exactly once;
  subsequent tabs are ready in <2s.
- `gear inference chat "hello"` from xterm streams tokens within
  3s of the page boot.
- Token throughput in `plugin/bonsai` matches the root `bonsai/`
  page (today they differ; rounds 64/65 closed the gap, this RFC
  should make them identical).
- `plugin/agentic-workspace` can drive a chat session through the
  same API as the plugin's existing markdown renderer.

## References

- `memory/pluginization-lessons.md` rounds 64, 65 (per-token
  allocation, WebGL context leak, worker runtime default).
- `memory/wanix-routfs-device-namespaces.md` (resource isolation
  patterns applicable to session/host isolation).
- `memory/crush-runner-mounts.md` (cross-frame bridge patterns).
- `plugin/bonsai/src/model/adapter.js` — the bitgpu wrapper this
  RFC generalises.
- `plugin/bonsai/src/model/worker.js` — today's worker shim,
  becomes the host.
- `plugin/bonsai/src/chat/tool-runner.js` — the tool loop this
  RFC lifts into the host's default tool resolver.
