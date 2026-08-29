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
];
