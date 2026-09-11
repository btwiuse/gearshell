# `GearShell.inference.*` API Reference

The shell exposes inference through the standard GearShell namespace.
The implementation lives in `workspace-inference-api.js` and is wired
into `window.GearShell.inference` by `workspace-api.js` after
`initWorkspaceApi()`. Behind the scenes, the shell spawns a single
long-lived Web Worker (`inference/host-worker.js`) that owns a bitgpu
engine (Bonsai 27B today; webllm's classic-script runtime is
vendored into `inference/runtime.js` and re-exported as an ES
module so module workers can consume it).

**Status as of round 70:** the API is fully wired and inert —
nothing in the shell currently calls it because `plugin/webllm` is
self-contained and loads its own runtime via `<script>`. The API
exists as a forward-facing primitive for any non-webllm panel that
wants inference. Remove it if no consumer materialises by round 90.

## Surface

```ts
interface InferenceApi {
  // Catalog
  list(): Promise<ModelSummary[]>;

  // Lifecycle
  bootstrap(options?: { defaultModel?: string; accessToken?: string }): Promise<{ model: string; contextLength: number }>;
  load(model: string, options?: LoadOptions): Promise<{ model: string; contextLength: number }>;
  unload(): Promise<{ ok: true }>;
  status(): Promise<{ state: "idle" | "loading" | "ready" | "error"; model: ModelSummary | null; sessions: SessionInfo[] }>;

  // Sessions (one model in VRAM, up to 4 concurrent chat sessions)
  createSession(options?: CreateSessionOptions): Promise<Session>;

  // Events (best-effort, browser-only; iframe plugin subscribers go
  // through the postMessage bridge)
  inference.status   // {state, model, sessions} on every state transition
  inference.progress // {modelId, progress} during a background load
}

interface ModelSummary {
  id: string;            // "prism-ml/Bonsai-27B-gguf"
  label: string;          // "Bonsai 27B"
  description: string;
  size: number;            // bytes
  ctx: number;             // tokens
}

interface Session {
  id: number;              // host-side session id
  model: string;           // current resident model
  contextLength: number;   // maxSeqLen from the runtime

  // AsyncIterable of typed events. Closes when the host pushes
  // {_end} (stream complete) or throws on {_error}.
  send(messages: ChatMessage[], options?: GenerateOptions): AsyncIterable<InferenceEvent>;

  abort(): void;           // cancels the in-flight generation
  reset(): void;           // clears the chat's KV cache
  close(): void;           // drops the session slot
}

type InferenceEvent =
  | { type: "text";      delta: string }
  | { type: "thinking";  delta: string }
  | { type: "complete";  result: { tokens: unknown[]; text: string } };

type GenerateOptions = {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  think?: boolean;        // mapped to chatTemplateArgs.enable_thinking
  chatTemplateArgs?: Record<string, unknown>;
  signal?: AbortSignal;
};
```

## Lifecycle

```
   shell boot
       │
       ▼
   initWorkspaceApi()           ← registers GearShell.inference.*
       │
       ▼
   inference.bootstrap({        ← app.js wires this from
     defaultModel:              ←   loadConfig().defaultInferenceModel
       "prism-ml/Bonsai-27B-gguf"
   })
       │
       ▼
   host worker spawns (lazy on first call)
       │
       ▼
   host fires init → load(model)  ← background, ~30s first time
       │
       ├─ inference.progress events fire during download
       │  (host pushes modelId + progress; shell renders loader)
       │
       ▼
   status(): state === "ready", model = {id:"prism-ml/Bonsai-27B-gguf"}
       │
       ▼
   createSession()              ← near-instant (engine is resident)
       │
       ▼
   session.send(messages, options)   ← AsyncIterable<InferenceEvent>
       │
       ▼
   session.close()              ← session slot freed, engine stays resident
```

A second `bootstrap()` with a different `defaultModel` triggers a
model swap: host evicts the previous engine only after the new one
is resident, so active sessions never see an empty engine.

## Capabilities and limits

- **One model in VRAM at a time.** Calling `load(B)` while `A` is
  resident waits for `B` to finish loading, then swaps.
- **Up to 4 concurrent chat sessions.** The 5th `createSession()`
  LRU-evicts the oldest session; the engine stays put. Configurable
  via `MAX_SESSIONS` in `inference/protocol.js`.
- **10-minute idle sweep.** Sessions with no `send`/`pushToolResult`
  for 10 minutes are dropped. Configurable via `SESSION_IDLE_MS`.
- **No tool orchestration.** The host emits `text`/`thinking`/
  `complete` events; tool calls are the consumer's responsibility
  (round 67 docs the rationale). The next round may add an
  `inference.tools.register(...)` API if a non-webllm consumer needs it.
- **No OPFS caching.** The vendored runtime's `an.open(...)` owns
  the GGUF fetch + cache protocol. An OPFS override is queued
  (see `inference/opfs-cache.js`); not active yet.

## Streaming event shape

The host's `BitgpuChat.streamTurn(messages, options)` calls
`runtimeChat.generate(messages, options)` which yields
`{token: number | null, delta: string}` updates. The host's
`streamNativeEvents()` translates those into three typed events:

| Source update | Event emitted |
|---|---|
| `update.token === null` and `delta !== ""` | `{type: "text", delta}` |
| `update.token === thinkOpenTokenId` | (phase switch to "think", no event) |
| `update.token` in think phase | `{type: "thinking", delta}` |
| `update.token === thinkCloseTokenId` | `{type: "thinking", delta}` (flush buffer) then `{type: "text", delta: "\n"}` |
| `update.token` in answer phase (other) | `{type: "text", delta}` |

After the runtime completes, the host pushes internal sentinels
`{type: "_end"}` (success) or `{type: "_error", error}` (failure)
that close the consumer's `AsyncIterable`. They are not part of
the public surface — the consumer's `for await` loop simply ends.

## Worker protocol (postMessage, type: "module")

The host Worker is spawned by `inference/host-worker.js`. The
shell-to-host message shape is defined in `inference/protocol.js`:

```
shell → host (request):
  { id, type: "init",         defaultModel, accessToken }
  { id, type: "load",         model, options }
  { id, type: "unload" }
  { id, type: "createSession", model, options }
  { id, type: "closeSession",  sessionId }
  { id, type: "send",          sessionId, messages, options }
  { id, type: "abort",         sessionId }
  { id, type: "reset",         sessionId }
  // "status" request is unused — the shell mirrors PUSH.STATUS into
  // a local cache and reads from it (see `inference.status()` below).

host → shell (response / push):
  { id, type: "ok",    result }
  { id, type: "error", error }
  { type: "progress", requestId, progress }
  { type: "event",    sessionId, event }   // where event ∈ InferenceEvent
  // state is the full snapshot object {state, model, sessions:[...]}
  // — the shell replaces its local hostState cache with each push.
  { type: "status",   state }
```

The wire is `postMessage`-based (typed events on the `message`
channel). `requestId` correlates one request with one terminal
`ok`/`error` reply; streaming events carry `sessionId` so the
shell-side `RemoteSession` can multiplex across concurrent sessions.

### `inference.status()` is cached on the shell

`inference.status()` does NOT RPC the worker. The shell maintains
`hostState` (initialised to `{state:"idle", model:null, sessions:[]}`)
and overwrites it from every `PUSH.STATUS` payload it receives. The
worker pushes on every transition (load/unload/loading/ready/error
plus session create/drop/boot), so the cache is always within one
state change of being accurate. The call resolves in well under a
frame — critical for the playground's status probe, which would
otherwise queue behind the 3.8 GB model load and time out the
15s bridge timeout.

## Settings (round 68)

The default model lives under `workspace.shell.defaultInferenceModel`.
The Settings → Behavior panel edits it via a `<select>` rendered
from `inference.list()`. New entries in the manifest appear in
the dropdown automatically (see `populateInferenceModels` in
`plugin/settings/settings-config.js`).

## What's not implemented

- **Tools**: `session.send()` doesn't accept a `tools` field. The
  plugin-side adapter (round 67's `RemoteBonsai27B` shim) is
  dead code after the webllm cutover. If a non-webllm consumer
  needs tools, add `tools` to `InferenceEvent` (`{type:"tool_call", call}`)
  and `runToolResult` round-trip.
- **Cross-tab session sharing**: `session.id` is per-Worker. Two
  tabs opening the same `GearShell.inference` instance would
  spawn two Workers. SharedWorker would fix this but adds lifecycle
  complexity; defer until a real consumer needs it.
- **Remote endpoints**: the host owns one bitgpu engine. A
  different provider (OpenAI, Anthropic) would slot in as a
  separate `load(BonsaiRemote)` factory but is out of scope.
- **OPFS cache**: `inference/opfs-cache.js` is wired but the
  vendored runtime's `an.open(fetch, signal)` doesn't expose a
  File handle hook. Blocked until upstream surfaces it.

## Migration notes

- webllm is self-contained and does NOT use this API. Anything
  the user does through `plugin/webllm/index.html` runs in
  webllm's process; the shell's host Worker is untouched.
- The plugin-side shim `plugin/bonsai/src/model/remote-client.js`
  was the original consumer; it is dead code now that
  `plugin/bonsai` is gone. Remove it (and the `plugin/bonsai`
  manifest entry if any) when the dead-code window closes.
- `inference/runtime.js` is now a vendor copy of
  `plugin/webllm/bonsai-27b.js`. `scripts/extract-runtime.mjs`
  re-runs `node scripts/extract-runtime.mjs [--check]` after
  bumping webllm to verify the vendored copy stays in sync.
