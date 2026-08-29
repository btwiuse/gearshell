// playground-api-catalog.js — the exhaustive GearShell API catalog that
// powers the Playground panel's Explorer tab.
//
// The catalog mirrors gctl-bind.js's method list 1:1: every bridged
// method of window.GearShell, with a per-argument schema (type, default,
// placeholder), a run hint, and the equivalent gctl invocation. The
// Explorer renders a real request form for every API surface from this
// data alone — no per-method UI hardcoding.
//
// Arg types:
//   string   -> text input
//   number   -> number input
//   boolean  -> checkbox
//   json     -> JSON textarea (parsed at run time; defaults are JSON)
//   handler  -> not user-editable; the Explorer passes a real function
//               (only meaningful for in-page events.on)

export const PLAYGROUND_CATALOG = [
  {
    namespace: null,
    title: "Root",
    methods: [
      {
        name: "version",
        args: [],
        hint: "The GearShell API version string.",
      },
      {
        name: "ping",
        args: [],
        hint: 'Round-trip probe; returns "pong".',
      },
    ],
  },
  {
    namespace: "config",
    title: "Config",
    methods: [
      {
        name: "getShell",
        args: [],
        hint: "The normalized shell config. Provider apiKeys are redacted.",
      },
      {
        name: "updateShell",
        args: [
          {
            key: "patch",
            label: "Patch",
            type: "json",
            default: "{}",
            placeholder: '{"launcherOrder":["home","files"]}',
          },
          {
            key: "agentOrOptions",
            label: "Agent / options",
            type: "json",
            default: "{}",
          },
        ],
        hint: "Merge a patch into the shell config; the write is audited.",
      },
      {
        name: "getWorkspace",
        args: [],
        hint: "The raw active workspace. Provider apiKeys are redacted.",
      },
      {
        name: "getSystem",
        args: [],
        hint: "Normalized system binds + runtime pin + shell config.",
      },
      {
        name: "getTaskBinds",
        args: [],
        hint: "Per-task binds (workspace.binds) applied to task namespaces.",
      },
      {
        name: "getBinds",
        args: [],
        hint: "The system namespace binds (shared filesystem).",
      },
      {
        name: "addBind",
        args: [
          {
            key: "bind",
            label: "Bind",
            type: "json",
            placeholder:
              '{"id":"tools","type":"ns","dst":"tools","src":"#ramfs/new"}',
          },
        ],
        hint: "Append a system bind (takes effect on reload).",
      },
      {
        name: "updateBind",
        args: [
          { key: "id", label: "Bind id", type: "string" },
          {
            key: "bind",
            label: "New bind",
            type: "json",
            placeholder:
              '{"type":"ns","dst":"tools","src":"#ramfs/new","mode":"0755"}',
          },
          { key: "agent", label: "Agent", type: "string", optional: true },
        ],
        hint: "Replace a system bind by id; validated and audited.",
      },
      {
        name: "removeBind",
        args: [
          { key: "id", label: "Bind id", type: "string" },
          { key: "agent", label: "Agent", type: "string", optional: true },
        ],
        hint: "Remove a system bind (the root (.) bind is protected).",
      },
      {
        name: "setBinds",
        args: [
          {
            key: "binds",
            label: "Binds",
            type: "json",
            placeholder:
              '[{"id":"root","type":"ns","dst":".","src":"#ramfs/new"}]',
          },
          { key: "agent", label: "Agent", type: "string", optional: true },
        ],
        hint:
          "Atomically replace all system binds; the root bind must survive.",
      },
      {
        name: "updateRuntime",
        args: [
          {
            key: "patch",
            label: "Patch",
            type: "json",
            default: "{}",
            placeholder: '{"allowOrigins":"https://example.com"}',
          },
        ],
        hint: "Patch the wanix runtime pin + allowOrigins (reload to apply).",
      },
      {
        name: "reload",
        args: [],
        hint: "Restart the workspace (kills all tasks, reloads the page).",
      },
      {
        name: "audit.list",
        args: [],
        hint: "Agent config-change audit ring (secrets redacted).",
      },
      {
        name: "audit.clear",
        args: [],
        hint: "Empty the audit ring.",
      },
      {
        name: "audit.undo",
        args: [{ key: "id", label: "Entry id", type: "string" }],
        hint: "Restore the config snapshot saved before that change.",
      },
      {
        name: "providers.list",
        args: [],
        hint: "Model providers; apiKey is returned empty with hasApiKey.",
      },
      {
        name: "providers.save",
        args: [
          {
            key: "provider",
            label: "Provider",
            type: "json",
            placeholder:
              '{"id":"openai","name":"OpenAI","baseURL":"https://api.openai.com/v1","apiKey":"sk-...","models":["gpt-4o"],"enabled":true}',
          },
        ],
        hint: "Upsert a provider; an empty apiKey keeps the stored key.",
      },
      {
        name: "providers.remove",
        args: [{ key: "id", label: "Provider id", type: "string" }],
        hint: "Delete a provider by id.",
      },
    ],
  },
  {
    namespace: "panels",
    title: "Panels",
    methods: [
      {
        name: "list",
        args: [],
        hint: "Every dockview panel: id, component, title, active, group.",
      },
      {
        name: "open",
        args: [
          {
            key: "component",
            label: "Component",
            type: "string",
            default: "home",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder:
              '{"group":null,"referencePanel":null,"direction":"right"}',
          },
        ],
        hint: "direction/group/referencePanel split the dock next to a panel.",
      },
      {
        name: "close",
        args: [{
          key: "id",
          label: "Panel id",
          type: "string",
          placeholder: "settings-1",
        }],
        hint: "Close a panel by id (panels.list shows ids).",
      },
      {
        name: "focus",
        args: [{
          key: "id",
          label: "Panel id",
          type: "string",
          placeholder: "home-1",
        }],
        hint: "Activate a panel by id.",
      },
    ],
  },
  {
    namespace: "browser",
    title: "Browser",
    methods: [
      {
        name: "open",
        args: [
          {
            key: "url",
            label: "URL",
            type: "string",
            placeholder: "https://example.com",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"direction":"right"}',
          },
        ],
        hint: "Open a http(s) URL in an iframe panel.",
      },
    ],
  },
  {
    namespace: "files",
    title: "Files",
    methods: [
      {
        name: "open",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/notes.md",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
          },
        ],
        hint: "Reveal a VFS path in the Files panel.",
      },
    ],
  },
  {
    namespace: "tasks",
    title: "Tasks",
    methods: [
      {
        name: "list",
        args: [],
        hint: "Live workspace-task sessions.",
      },
      {
        name: "create",
        args: [
          {
            key: "spec",
            label: "Spec",
            type: "json",
            default:
              '{"name":"probe","cmd":"echo hi","term":false,"background":true}',
            placeholder:
              '{"name":"probe","cmd":"echo hi","term":false,"background":true}',
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"background":true,"silent":false,"autoClose":true}',
          },
        ],
        hint:
          "background runs headless (no panel); persist:true survives reloads.",
      },
      {
        name: "cancel",
        args: [{ key: "id", label: "Task id", type: "string" }],
        hint: "Kill a task and close its panel.",
      },
      {
        name: "output",
        args: [{ key: "id", label: "Task id", type: "string" }],
        hint: "Captured output of a headless task (terminal tasks refuse).",
      },
    ],
  },
  {
    namespace: "agents",
    title: "Agents",
    methods: [
      {
        name: "list",
        args: [],
        hint: "Live terminal + task sessions (id prefix: terminal-/task-).",
      },
      {
        name: "prompt",
        args: [
          {
            key: "id",
            label: "Session id",
            type: "string",
            placeholder: "terminal-1",
          },
          { key: "text", label: "Text", type: "string", placeholder: "ls -la" },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"force":false}',
          },
        ],
        hint:
          "Inject a line into a live terminal; busy/human gates may refuse.",
      },
      {
        name: "read",
        args: [
          {
            key: "id",
            label: "Session id",
            type: "string",
            placeholder: "terminal-1",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: '{"rows":100}',
          },
        ],
        hint: "Snapshot the terminal scrollback as plain text.",
      },
      {
        name: "interrupt",
        args: [{
          key: "id",
          label: "Session id",
          type: "string",
          placeholder: "terminal-1",
        }],
        hint: "Send Ctrl+C to a live session.",
      },
    ],
  },
  {
    namespace: "music",
    title: "Music",
    methods: [
      {
        name: "play",
        args: [
          {
            key: "src",
            label: "URL / VFS path",
            type: "string",
            placeholder:
              "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          },
          { key: "title", label: "Title", type: "string", optional: true },
        ],
        hint: "Replace the queue with one track and play it.",
      },
      {
        name: "playQueue",
        args: [
          {
            key: "tracks",
            label: "Tracks",
            type: "json",
            default: "[]",
            placeholder: '[{"src":"/opfs/home/a.mp3","title":"A"}]',
          },
          {
            key: "startIndex",
            label: "Start index",
            type: "number",
            default: "0",
          },
        ],
        hint: "Queue a list of {src, title} and start at startIndex.",
      },
      {
        name: "enqueue",
        args: [
          { key: "tracks", label: "Tracks", type: "json", default: "[]" },
        ],
        hint: "Append tracks to the queue.",
      },
      { name: "next", args: [], hint: "Skip to the next track." },
      { name: "prev", args: [], hint: "Restart the track or go back." },
      {
        name: "setLoop",
        args: [
          {
            key: "mode",
            label: "Mode",
            type: "string",
            default: "off",
            placeholder: "off | all | one",
          },
        ],
        hint: "Loop mode: off / all / one.",
      },
      {
        name: "setShuffle",
        args: [{ key: "on", label: "On", type: "boolean", default: false }],
        hint: "Toggle random playback order.",
      },
      {
        name: "seek",
        args: [{
          key: "seconds",
          label: "Seconds",
          type: "number",
          default: "0",
        }],
        hint: "Seek the loaded track.",
      },
      {
        name: "reorderQueue",
        args: [
          { key: "from", label: "From", type: "number", default: "0" },
          { key: "to", label: "To", type: "number", default: "0" },
        ],
        hint: "Move a queue entry; the playing track stays pinned.",
      },
      {
        name: "removeFromQueue",
        args: [{ key: "index", label: "Index", type: "number", default: "0" }],
        hint: "Remove a queue entry by index.",
      },
      {
        name: "clearQueue",
        args: [],
        hint: "Empty the queue (keeps playing).",
      },
      { name: "listPlaylists", args: [], hint: "Named playlists." },
      {
        name: "savePlaylist",
        args: [
          { key: "name", label: "Name", type: "string" },
          { key: "tracks", label: "Tracks", type: "json", optional: true },
        ],
        hint: "Save the queue (or explicit tracks) under a name.",
      },
      {
        name: "renamePlaylist",
        args: [
          { key: "id", label: "Playlist id", type: "string" },
          { key: "name", label: "New name", type: "string" },
        ],
        hint: "Rename a playlist.",
      },
      {
        name: "deletePlaylist",
        args: [{ key: "id", label: "Playlist id", type: "string" }],
        hint: "Delete a playlist.",
      },
      {
        name: "loadPlaylist",
        args: [{ key: "id", label: "Playlist id", type: "string" }],
        hint: "Load a playlist into the queue.",
      },
      { name: "pause", args: [], hint: "Pause playback." },
      { name: "resume", args: [], hint: "Resume playback." },
      { name: "stop", args: [], hint: "Stop and unload the track." },
      { name: "nowPlaying", args: [], hint: "Full playback snapshot." },
    ],
  },
  {
    namespace: "events",
    title: "Events",
    methods: [
      {
        name: "on",
        args: [
          {
            key: "topic",
            label: "Topic",
            type: "string",
            placeholder: "task.status",
          },
          { key: "handler", label: "Handler", type: "handler" },
        ],
        hint: "Register an in-page handler; the Explorer passes a no-op.",
      },
      {
        name: "off",
        args: [{ key: "topic", label: "Topic", type: "string" }],
        hint: "Remove all handlers for a topic.",
      },
      {
        name: "emit",
        args: [
          {
            key: "topic",
            label: "Topic",
            type: "string",
            placeholder: "my.topic",
          },
          { key: "payload", label: "Payload", type: "json", default: "{}" },
        ],
        hint: "Publish an event (ring buffer + window CustomEvent mirror).",
      },
      {
        name: "drain",
        args: [],
        hint:
          "Splice the agent event ring buffer. Consumes it — agents rely on this.",
      },
      {
        name: "pending",
        args: [],
        hint: "How many events are buffered for agents.",
      },
    ],
  },
];

export function catalogGroups() {
  return PLAYGROUND_CATALOG;
}

export function methodId(group, method) {
  return group.namespace ? `${group.namespace}.${method.name}` : method.name;
}

export function findCatalogMethod(id) {
  for (const group of PLAYGROUND_CATALOG) {
    for (const method of group.methods) {
      if (methodId(group, method) === id) return { group, method };
    }
  }
  return null;
}

// The gctl CLI line equivalent of a call (for the copy button).
export function gctlInvocation(group, method, argsJson) {
  const path = group.namespace
    ? `${group.namespace}.${method.name}`
    : method.name;
  return argsJson === "[]" ? `gctl ${path}` : `gctl ${path} '${argsJson}'`;
}

// Coerce one raw form value into the JS argument the API expects.
function buildArgValue(arg, raw) {
  if (arg.type === "handler") return () => {};
  if (arg.type === "json") {
    if (typeof raw === "string" && raw.trim()) return JSON.parse(raw);
    if (raw == null && arg.default != null) return JSON.parse(arg.default);
    return {};
  }
  if (arg.type === "number") {
    if (raw == null || raw === "") {
      return arg.default != null && arg.default !== ""
        ? Number(arg.default)
        : 0;
    }
    return Number(raw);
  }
  if (arg.type === "boolean") {
    return raw === true || raw === "true" || raw === "on";
  }
  if (arg.type === "string") {
    if (typeof raw === "string" && raw) return raw;
    return arg.default ?? "";
  }
  return raw;
}

// Build the positional args array from the Explorer's raw form values.
// Throws on malformed JSON so the caller can surface a friendly error.
export function buildMethodArgs(method, values) {
  return method.args.map((arg) => buildArgValue(arg, values?.[arg.key]));
}

// Serialized args array for display + the gctl copy button. Same parse
// rules as buildMethodArgs; throws on malformed JSON.
export function serializeArgs(method, values) {
  const built = method.args.map((arg) => {
    if (arg.type === "handler") return "[handler]";
    return buildArgValue(arg, values?.[arg.key]);
  });
  return JSON.stringify(built);
}
