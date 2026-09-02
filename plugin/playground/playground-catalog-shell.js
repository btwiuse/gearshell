// playground-catalog-shell.js — shell-control methods for the Playground
// Explorer (500-line split of playground-api-catalog.js).

export const shellCatalog = [
  {
    namespace: null,
    title: "Root",
    methods: [
      {
        name: "version",
        kind: "value",
        args: [],
        hint:
          "The GearShell API version string — a constant, not a callable. " +
          "Run reads the value; gear version aliases to ping.",
      },
      {
        name: "ping",
        args: [],
        hint: 'Round-trip probe; returns "pong".',
      },
    ],
  },
  {
    namespace: "hotkeys",
    title: "Hotkeys",
    methods: [
      { name: "list", args: [], hint: "List registered shell and plugin hotkeys." },
      {
        name: "register",
        args: [{ key: "spec", label: "Spec", type: "json", default: "{}", placeholder: '{"key":"ctrl+shift+p","action":{"method":"panels.open","args":["launcher"]}}' }],
        hint: "Register a controlled panels.open hotkey from a trusted caller.",
      },
      { name: "unregister", args: [{ key: "id", label: "Hotkey id", type: "string" }], hint: "Remove a hotkey owned by the API caller." },
    ],
  },
  {
    namespace: "w9y",
    title: "W9y",
    methods: [
      { name: "list", args: [], hint: "List installed w9y packages." },
      { name: "status", args: [{ key: "id", label: "Package id", type: "string" }], hint: "Read one installed package status." },
      { name: "refresh", args: [], hint: "Refresh the installed package registry." },
      { name: "apply", args: [{ key: "id", label: "Package id", type: "string" }, { key: "version", label: "Version", type: "string", optional: true }], hint: "Start installing a w9y package." },
      { name: "remove", args: [{ key: "id", label: "Package id", type: "string" }], hint: "Start removing a w9y package." },
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
        name: "crushRunner.get",
        args: [],
        hint: "Read the Crush Playground snapshot — presets, active id, display order. Backed by the generic config.kv store (`crush-playground:state` + `:builtins`).",
      },
      {
        name: "crushRunner.list",
        args: [],
        hint: "List the merged built-in and custom Crush Playground presets.",
      },
      {
        name: "crushRunner.save",
        args: [
          {
            key: "preset",
            label: "Preset",
            type: "json",
            placeholder:
              '{"id":"custom","name":"Custom Crush","program":"/opfs/wanix/crush","type":"gojs","env":"","wd":"/opfs/home","crushrc":""}',
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"active":true,"agent":"playground"}',
          },
        ],
        hint: "Save or replace one custom preset; optionally make it active.",
      },
      {
        name: "crushRunner.remove",
        args: [
          { key: "id", label: "Preset id", type: "string" },
          { key: "agent", label: "Agent", type: "string", optional: true },
        ],
        hint: "Remove a custom preset; built-in presets are protected.",
      },
      {
        name: "crushRunner.setActive",
        args: [
          { key: "id", label: "Preset id", type: "string" },
          { key: "agent", label: "Agent", type: "string", optional: true },
        ],
        hint: "Set the active Crush Playground preset.",
      },
      {
        name: "kv.get",
        args: [{ key: "key", label: "Key", type: "string" }],
        hint: "Read any per-workspace JSON value by key. Returns undefined when absent. Plugins opt in via `config.kv.*` permission.",
      },
      {
        name: "kv.set",
        args: [
          { key: "key", label: "Key", type: "string" },
          { key: "value", label: "Value", type: "json" },
          {
            key: "options",
            label: "Options",
            type: "json",
            optional: true,
            placeholder: '{"agent":"playground"}',
          },
        ],
        hint: "Upsert a JSON value. Writes are audited (kind:\"system\") and emit `config.changed`.",
      },
      {
        name: "kv.delete",
        args: [
          { key: "key", label: "Key", type: "string" },
          {
            key: "options",
            label: "Options",
            type: "json",
            optional: true,
            placeholder: '{"agent":"playground"}',
          },
        ],
        hint: "Remove a key. Returns `{deleted:false}` when absent.",
      },
      {
        name: "kv.list",
        args: [
          {
            key: "prefix",
            label: "Prefix filter",
            type: "string",
            optional: true,
          },
        ],
        hint: "List all kv keys (optionally filtered by prefix), sorted.",
      },
      {
        name: "providers.list",
        args: [],
        hint: "Model providers; apiKey is returned empty with hasApiKey.",
      },
      {
        name: "models.list",
        args: [],
        hint: "List configured models across providers.",
      },
      {
        name: "models.save",
        args: [{ key: "model", label: "Model", type: "json", placeholder: '{"providerId":"deepseek","id":"deepseek-v4-flash","name":"DeepSeek V4 Flash","contextWindow":1000000,"defaultMaxTokens":163840,"canReason":true,"supportsImages":false}' }],
        hint: "Add or update a model under an existing provider.",
      },
      {
        name: "models.remove",
        args: [{ key: "providerId", label: "Provider id", type: "string" }, { key: "modelId", label: "Model id", type: "string" }],
        hint: "Remove a model from a provider.",
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
];
