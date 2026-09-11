// playground-catalog-inference.js — the `inference.*` namespace for
// the Playground Explorer.
//
// The catalog exposes GearShell.inference calls as runnable entries
// in the Playground sidebar. Most are one-shot Promises; session
// lifecycle methods (abort/reset/close) belong on a Session object
// returned from createSession(), which the playground cannot hold
// across calls. The full streaming demo (session.send) lives in the
// browser console — see docs/inference-api.md.
//
// API status (round 70): the host is fully wired but inert — no
// consumer in the shell currently calls inference.*. The catalog
// is still useful for debugging the host itself: open the
// playground, run `inference.list()` and `inference.status()` to
// see the host's reaction. `status()` is read from a shell-side
// cache that mirrors the worker's PUSH.STATUS pushes, so it
// resolves immediately even while the worker is busy loading
// weights. Running `inference.bootstrap(...)` will spawn the
// Worker (if not already running) and start a background model
// load. Round 90 is the deadline for removing this whole API
// if it stays unused.

export const inferenceCatalog = [
  {
    namespace: "inference",
    title: "Inference",
    methods: [
      {
        name: "list",
        args: [],
        hint:
          "Catalog of models the inference host can load. Each entry is " +
          "{id, label, description, size, ctx} — populated from " +
          "inference/manifest.js.",
      },
      {
        name: "status",
        args: [],
        hint:
          "Current host state and resident model. Returns " +
          "{state: \"idle\"|\"loading\"|\"ready\"|\"error\", model: {id}|null, " +
          "sessions: [{id, model, messages, lastUsedAt}]}. " +
          "Resolved from a shell-side cache that mirrors the worker's " +
          "PUSH.STATUS pushes, so the call never queues behind a busy " +
          "worker (returns in well under a frame).",
      },
      {
        name: "bootstrap",
        args: [
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder:
              '{"defaultModel":"prism-ml/Bonsai-27B-gguf","accessToken":"(optional HF token)"}',
          },
        ],
        hint:
          "Spawn the host Worker (lazy) and pre-warm with the default " +
          "model. Returns the same shape as load(). Calling again with " +
          "a different defaultModel triggers a model swap. The shell's " +
          "app.js wires this from loadConfig().defaultInferenceModel at " +
          "boot — running it from the playground overrides that until " +
          "reload.",
      },
      {
        name: "load",
        args: [
          {
            key: "model",
            label: "Model id",
            type: "string",
            default: "prism-ml/Bonsai-27B-gguf",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            optional: true,
            placeholder:
              '{"accessToken":"(optional)","maxLength":4096,"cache":true}',
          },
        ],
        hint:
          "Explicitly load (or swap to) a model. Lazy: if the requested " +
          "model is already resident the call returns immediately. While " +
          "loading, inference.progress events fire on the event channel. " +
          "Returns {model, contextLength} when ready.",
      },
      {
        name: "unload",
        args: [],
        hint:
          "Drops the resident model and every active session. Frees VRAM. " +
          "Subsequent createSession() lazy-loads the default model again.",
      },
      {
        name: "createSession",
        args: [
          {
            key: "options",
            label: "Options",
            type: "json",
            optional: true,
            placeholder:
              '{"systemPrompt":"You are a helpful assistant."}',
          },
        ],
        hint:
          "Open a chat session against the resident model. Returns a " +
          "Session object with id/model/contextLength plus async methods " +
          "(send/abort/reset/close). If the requested model differs from " +
          "resident, the host lazy-loads it before admitting the session. " +
          "Max 4 concurrent. The Playground cannot hold the returned " +
          "Session across calls; for a real streaming demo, use the " +
          "console: const s = await GearShell.inference.createSession(); " +
          "for await (const ev of s.send(messages)) console.log(ev).",
      },
    ],
  },
];
