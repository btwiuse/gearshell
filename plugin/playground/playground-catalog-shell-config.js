// playground-catalog-shell-config.js — the `config.*` namespace
// methods for the Playground Explorer. Split out of
// playground-catalog-shell.js for the 500-line rule — the config
// namespace alone is hundreds of lines of method schemas (shell,
// binds, runtime, audit, kv, providers, models, workspaces,
// presets, binds.filament).

export const configCatalog = [
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
          },
        ],
        hint: "Patch shell-level fields. The patch is merged at the top level.",
      },
      {
        name: "getWorkspace",
        args: [],
        hint: "Full active workspace snapshot.",
      },
      {
        name: "getSystem",
        args: [],
        hint: "Normalized system + runtime pin + redacted shell config.",
      },
      {
        name: "getTaskBinds",
        args: [],
        hint: "Per-task binds (the tools available to a task namespace).",
      },
      {
        name: "getBinds",
        args: [],
        hint: "List the system binds (file-system bindings the workspace declares).",
      },
      {
        name: "addBind",
        args: [{ key: "bind", label: "Bind", type: "json" }],
        hint: "Append a new bind to the system binds list.",
      },
      {
        name: "updateBind",
        args: [
          { key: "id", label: "Bind id", type: "string" },
          { key: "bind", label: "Bind", type: "json" },
        ],
        hint: "Replace one bind by id. Takes effect after workspace reload.",
      },
      {
        name: "removeBind",
        args: [{ key: "id", label: "Bind id", type: "string" }],
        hint: "Remove a bind. The root (.) bind cannot be removed.",
      },
      {
        name: "setBinds",
        args: [{ key: "binds", label: "Binds", type: "json" }],
        hint: "Atomically replace the entire system binds list.",
      },
      {
        name: "updateRuntime",
        args: [{ key: "patch", label: "Patch", type: "json" }],
        hint: "Patch the wanix runtime pin + allowOrigins.",
      },
      {
        name: "reload",
        args: [],
        hint: "Reload the active workspace, picking up bind / runtime changes.",
      },
      {
        name: "audit.list",
        args: [],
        hint: "List entries in the workspace audit ring (system / shell changes).",
      },
      {
        name: "audit.clear",
        args: [],
        hint: "Clear the audit ring.",
      },
      {
        name: "audit.undo",
        args: [{ key: "entryId", label: "Entry id", type: "string" }],
        hint: "Undo a single audit entry by id (system binds, runtime, shell).",
      },
      {
        name: "kv.get",
        args: [{ key: "key", label: "Key", type: "string" }],
        hint:
          "Read any per-workspace JSON value by key. Returns undefined when " +
          "absent. Plugins opt in via `config.kv.*` permission. The Crush " +
          "Playground iframe merges the `crush-playground:state` and " +
          "`crush-playground:builtins` keys itself.",
      },
      {
        name: "kv.set",
        args: [
          { key: "key", label: "Key", type: "string" },
          { key: "value", label: "Value (JSON)", type: "json" },
        ],
        hint:
          "Write any JSON-serialisable value to a workspace key. Writes " +
          "emit `config.changed` so other plugins / panels live-update.",
      },
      {
        name: "kv.delete",
        args: [{ key: "key", label: "Key", type: "string" }],
        hint: "Delete a per-workspace key.",
      },
      {
        name: "kv.list",
        args: [{ key: "prefix", label: "Prefix", type: "string", optional: true }],
        hint: "List per-workspace keys, optionally filtered by a prefix.",
      },
      {
        name: "reset",
        args: [],
        hint: "Reset the entire shell config to factory defaults.",
      },
      {
        name: "workspace.list",
        args: [],
        hint: "List every workspace in the index.",
      },
      {
        name: "workspace.getActive",
        args: [],
        hint: "Get the currently active workspace.",
      },
      {
        name: "workspace.getActiveId",
        args: [],
        hint: "Get just the id of the active workspace.",
      },
      {
        name: "workspace.ensure",
        args: [{ key: "name", label: "Name", type: "string" }],
        hint: "Ensure a workspace exists by name; creates it if absent.",
      },
      {
        name: "workspace.select",
        args: [{ key: "id", label: "Workspace id", type: "string" }],
        hint: "Switch the active workspace by id.",
      },
      {
        name: "workspace.rename",
        args: [
          { key: "id", label: "Workspace id", type: "string" },
          { key: "name", label: "New name", type: "string" },
        ],
        hint: "Rename a workspace.",
      },
      {
        name: "workspace.createFromPreset",
        args: [
          { key: "presetId", label: "Preset id", type: "string" },
          { key: "name", label: "Name", type: "string" },
        ],
        hint: "Create a new workspace from a registered preset.",
      },
      {
        name: "workspace.duplicate",
        args: [
          { key: "id", label: "Source id", type: "string" },
          { key: "name", label: "New name", type: "string" },
        ],
        hint: "Duplicate an existing workspace.",
      },
      {
        name: "workspace.delete",
        args: [{ key: "id", label: "Workspace id", type: "string" }],
        hint: "Delete a workspace by id.",
      },
      {
        name: "workspace.parse",
        args: [{ key: "raw", label: "Raw config", type: "json" }],
        hint: "Validate a raw workspace JSON payload without saving it.",
      },
      {
        name: "workspace.import",
        args: [{ key: "raw", label: "Raw config", type: "json" }],
        hint: "Import a workspace from a raw JSON payload.",
      },
      {
        name: "workspace.replaceActive",
        args: [{ key: "raw", label: "Raw config", type: "json" }],
        hint: "Replace the active workspace entirely from a raw JSON payload.",
      },
      {
        name: "workspace.uniqueName",
        args: [{ key: "base", label: "Base name", type: "string" }],
        hint: "Generate a non-clashing workspace name from a base.",
      },
      {
        name: "presets.list",
        args: [],
        hint: "List registered workspace presets.",
      },
      {
        name: "presets.getCustom",
        args: [{ key: "id", label: "Preset id", type: "string" }],
        hint: "Get a custom preset by id.",
      },
      {
        name: "presets.saveCustom",
        args: [{ key: "preset", label: "Preset", type: "json" }],
        hint: "Save or update a custom preset.",
      },
      {
        name: "presets.removeCustom",
        args: [{ key: "id", label: "Preset id", type: "string" }],
        hint: "Delete a custom preset by id.",
      },
      {
        name: "presets.uniqueName",
        args: [{ key: "base", label: "Base name", type: "string" }],
        hint: "Generate a non-clashing preset name from a base.",
      },
      {
        name: "binds.list",
        args: [],
        hint: "List filament-style binds (independent of the system binds list).",
      },
      {
        name: "binds.add",
        args: [{ key: "bind", label: "Bind", type: "json" }],
        hint: "Append a filament bind.",
      },
      {
        name: "binds.update",
        args: [
          { key: "id", label: "Bind id", type: "string" },
          { key: "bind", label: "Bind", type: "json" },
        ],
        hint: "Update a filament bind by id.",
      },
      {
        name: "binds.remove",
        args: [{ key: "id", label: "Bind id", type: "string" }],
        hint: "Remove a filament bind by id.",
      },
      {
        name: "binds.reorder",
        args: [{ key: "order", label: "New order (string[])", type: "json" }],
        hint: "Reorder the filament binds list by id.",
      },
      {
        name: "plugins.list",
        args: [],
        hint: "List every registered plugin (built-in + iframe + component).",
      },
      {
        name: "plugins.install",
        args: [{ key: "manifest", label: "Manifest", type: "json" }],
        hint: "Install a plugin from a manifest literal.",
      },
      {
        name: "plugins.remove",
        args: [{ key: "id", label: "Plugin id", type: "string" }],
        hint: "Remove an installed plugin.",
      },
      {
        name: "plugins.setEnabled",
        args: [
          { key: "id", label: "Plugin id", type: "string" },
          { key: "enabled", label: "Enabled", type: "boolean" },
        ],
        hint: "Toggle a plugin's enabled flag (reload required).",
      },
      {
        name: "providers.list",
        args: [],
        hint: "List configured model providers (apiKey redacted).",
      },
      {
        name: "providers.save",
        args: [
          { key: "provider", label: "Provider", type: "json" },
        ],
        hint: "Upsert a provider; an empty apiKey keeps the stored key.",
      },
      {
        name: "providers.remove",
        args: [{ key: "id", label: "Provider id", type: "string" }],
        hint: "Delete a provider by id.",
      },
      {
        name: "models.list",
        args: [],
        hint: "Flatten the providers' models list.",
      },
      {
        name: "models.save",
        args: [
          { key: "model", label: "Model", type: "json", placeholder: '{"providerId":"deepseek","id":"deepseek-v4-flash","name":"DeepSeek V4 Flash","contextWindow":1000000,"defaultMaxTokens":163840,"canReason":true,"supportsImages":false}' },
        ],
        hint: "Save / upsert a model under a provider.",
      },
      {
        name: "models.remove",
        args: [
          { key: "providerId", label: "Provider id", type: "string" },
          { key: "id", label: "Model id", type: "string" },
        ],
        hint: "Delete a model by providerId + model id.",
      },
    ],
  },
];