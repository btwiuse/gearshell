// scripts/build-docs-content.mjs
// Build all per-API markdown files for the GearShell API Documentation
// plugin. The files live under plugin/gearshell-docs/content/.
//
// This script is the canonical "source of truth" generator: each API's
// description, args schema, examples, and notes are defined as a single
// record here and written to disk as a single markdown file. Re-run
// after editing the records below; the script is idempotent and writes
// the same shape on every run.
//
// The shape is intentional: one record per file keeps the prose close
// to the API it documents (so a doc edit is a single-file diff), and
// makes the records trivially diffable in code review.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "plugin", "gearshell-docs", "content");

// Helpers ------------------------------------------------------------------

function frontmatter(meta) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(", ")}]`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function render(record) {
  const parts = [];
  parts.push(frontmatter({
    id: record.id,
    title: record.title,
    namespace: record.namespace,
    kind: record.kind || "method",
    returns: record.returns,
    sync: record.sync ?? true,
    permissions: record.permissions || [],
  }));
  parts.push(`# ${record.title}`);
  parts.push("");
  if (record.summary) {
    parts.push(record.summary);
    parts.push("");
  }
  parts.push("## Signature");
  parts.push("");
  parts.push("```js");
  parts.push(record.signature);
  parts.push("```");
  parts.push("");
  if (record.args?.length) {
    parts.push("## Arguments");
    parts.push("");
    parts.push("| Name | Type | Required | Description |");
    parts.push("|------|------|----------|-------------|");
    for (const arg of record.args) {
      parts.push(
        `| \`${arg.name}\` | \`${arg.type}\` | ${arg.required ? "yes" : "no"} | ${arg.description.replace(/\|/g, "\\|")} |`
      );
    }
    parts.push("");
  }
  parts.push("## Returns");
  parts.push("");
  parts.push(record.returnsDescription || `\`${record.returns || "unknown"}\``);
  parts.push("");
  if (record.notes?.length) {
    parts.push("## Notes");
    parts.push("");
    for (const note of record.notes) {
      parts.push(`- ${note}`);
    }
    parts.push("");
  }
  if (record.examples?.length) {
    parts.push("## Examples");
    parts.push("");
    for (const ex of record.examples) {
      parts.push(`### ${ex.title}`);
      parts.push("");
      if (ex.description) {
        parts.push(ex.description);
        parts.push("");
      }
      parts.push("```js");
      parts.push(ex.code);
      parts.push("```");
      parts.push("");
    }
  }
  if (record.permissions?.length) {
    parts.push("## Required permissions");
    parts.push("");
    parts.push("Declare the matching API paths in the plugin manifest's `permissions.api` array:");
    parts.push("");
    parts.push("```json");
    parts.push(JSON.stringify({ api: record.permissions }, null, 2));
    parts.push("```");
    parts.push("");
  }
  return parts.join("\n");
}

async function writeDoc(relPath, content) {
  const full = resolve(ROOT, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

const RECORDS = [];

// Root
RECORDS.push({
  id: "version",
  title: "GearShell.version",
  namespace: null,
  kind: "value",
  returns: "string",
  sync: true,
  permissions: ["version"],
  summary: "The GearShell API version constant exposed at the root of the namespace. This is a static string (currently `\"0.1.0\"`), not a callable — read it as a property. The `gear version` CLI alias maps to `GearShell.ping`, not to this property.",
  signature: `// value (string)
GearShell.version`,
  returnsDescription: "A version string literal (`\"0.1.0\"` today). Treat it as informational; semantic versioning is not yet promised across releases.",
  examples: [
    { title: "Read the version from the shell page", code: `console.log(GearShell.version); // "0.1.0"` },
  ],
});

RECORDS.push({
  id: "ping",
  title: "GearShell.ping",
  namespace: null,
  kind: "method",
  returns: "string",
  sync: true,
  permissions: ["ping"],
  summary: "Round-trip probe that returns `\"pong\"`. Use it to verify the GearShell bridge is reachable from an iframe plugin, to test postMessage wiring, or as a no-op health check from the `gear` CLI.",
  signature: `GearShell.ping()`,
  args: [],
  returnsDescription: "The literal string `\"pong\"`.",
  examples: [
    { title: "From the shell page", code: `const reply = GearShell.ping();\n// "pong"` },
    { title: "From an iframe plugin", description: "Same call, but the bridge postMessage round-trips asynchronously:", code: `const reply = await GearShell.ping();\n// "pong"` },
    { title: "From the gear CLI", code: `gear ping\n# pong` },
  ],
  notes: [
    "Always synchronous on the shell page (no `await` needed).",
    "Always asynchronous across the iframe bridge — the bridge resolves the promise after the parent replies.",
  ],
});

// Hotkeys
RECORDS.push({
  id: "hotkeys.list",
  title: "GearShell.hotkeys.list",
  namespace: "hotkeys",
  returns: "Array<HotkeyRecord>",
  sync: true,
  permissions: ["hotkeys.*"],
  summary: "List every registered shell hotkey, including the source that registered it (`shell`, `plugin:<id>`, or `api`). Hotkeys are keyboard shortcuts that drive shell actions (`panels.open`, `overlay.toggle`, etc).",
  signature: `GearShell.hotkeys.list()`,
  returnsDescription: "An array of hotkey records. Each record carries the chord, the action it triggers, and the registration source.",
  examples: [{ title: "Inspect the registered hotkeys", code: `const hotkeys = GearShell.hotkeys.list();\nconsole.table(hotkeys);` }],
});

RECORDS.push({
  id: "hotkeys.register",
  title: "GearShell.hotkeys.register",
  namespace: "hotkeys",
  returns: "{ ok: true, id }",
  sync: true,
  permissions: ["hotkeys.register"],
  summary: "Register a new hotkey from a trusted caller. The action must be one of the shell's recognised action shapes (e.g. `{ method: \"panels.open\", args: [\"launcher\"] }` or `{ method: \"overlay.toggle\", args: [\"spotlight\"] }`).",
  signature: `GearShell.hotkeys.register(spec)`,
  args: [
    { name: "spec", type: "{ key: string, action: ActionSpec, label?: string }", required: true, description: "Hotkey descriptor. `key` is a chord like `\"ctrl+shift+p\"` (modifier names: `ctrl`/`shift`/`alt`/`meta`). `action` is an object with `method` and `args`." },
  ],
  returnsDescription: "`{ ok: true, id }` on success. The `id` is derived from the chord so re-registering the same key overwrites the previous action.",
  examples: [
    { title: "Open Spotlight on Ctrl+Shift+P", code: `GearShell.hotkeys.register({
  key: "ctrl+shift+p",
  action: { method: "overlay.toggle", args: ["spotlight"] },
  label: "Open Spotlight",
});` },
  ],
  notes: [
    "Only `panels.open` and `overlay.toggle` actions are accepted by the API gate. To trigger a custom action, drive it from a plugin entry module instead.",
    "Use the `gear` CLI's `agents.prompt` to drive an interactive prompt without registering a hotkey.",
  ],
});

RECORDS.push({
  id: "hotkeys.unregister",
  title: "GearShell.hotkeys.unregister",
  namespace: "hotkeys",
  returns: "{ ok: true }",
  sync: true,
  permissions: ["hotkeys.unregister"],
  summary: "Remove a previously registered hotkey by id. Plugin-owned hotkeys can only be removed by their registering plugin (or by the shell).",
  signature: `GearShell.hotkeys.unregister(id)`,
  args: [{ name: "id", type: "string", required: true, description: "The hotkey id returned by `register`." }],
  examples: [{ title: "Remove a hotkey", code: `GearShell.hotkeys.unregister("ctrl+shift+p");` }],
});

// Config — table-driven for the bulk of records (one row per file).
// Each row: [name, summary, argsSchema, returnsShape, returnsDescription, exampleCode, permissions].
const CONFIG_TABLE = [
  ["getShell", "Read the normalized shell config", [], "{ ok, shell }", "Returns the active shell config with `apiKeys` redacted for every provider. Use this from a plugin to inspect the current shell state without touching storage directly.", "const cfg = GearShell.config.getShell();\nconsole.log(cfg.shell.providers);", ["config.getShell"]],
  ["updateShell", "Merge a patch into the shell config", [{ name: "patch", type: "Partial<ShellConfig>", required: true, description: "Object whose keys are shallow-merged into the shell config." }], "{ ok, shell }", "Shallow-merges the patch into the shell config. Every write is audited (`kind: \"system\"`) and emits a `config.changed` event with the same shape as the patch.", "GearShell.config.updateShell({ launcherOrder: [\"home\", \"files\"] });", ["config.updateShell"]],
  ["getWorkspace", "Read the raw active workspace", [], "{ ok, workspace }", "Returns the active workspace object verbatim, including `ui.dockviewLayout`. Provider apiKeys are redacted from embedded provider records.", "const ws = GearShell.config.getWorkspace();\nif (ws.workspace) console.log(ws.workspace.name);", ["config.getWorkspace"]],
  ["getSystem", "Read normalized system binds + runtime pin + shell config", [], "{ ok, system }", "The merged view of the system binds (the `bin/gear` mount, the runtime pin, and any custom mounts) plus the wanix runtime pin.", "const sys = GearShell.config.getSystem();\nconsole.table(sys.system.binds);", ["config.getSystem"]],
  ["getTaskBinds", "Per-task binds (workspace.binds)", [], "{ ok, binds }", "The binds applied only to workspace task namespaces.", "GearShell.config.getTaskBinds().binds.forEach(console.log);", ["config.getTaskBinds"]],
  ["getBinds", "The system namespace binds (shared filesystem)", [], "{ ok, binds }", "The binds that compose the shared system namespace.", "const root = GearShell.config.getBinds().binds.find(b => b.dst === \".\");", ["config.getBinds"]],
  ["addBind", "Append a system bind (takes effect on reload)", [{ name: "bind", type: "BindRecord", required: true, description: "The bind to add." }], "{ ok, bind }", "Adds a bind to the system namespace. Reload the workspace with `config.reload` to materialise the new mount.", "GearShell.config.addBind({ id: \"tools\", type: \"ns\", dst: \"tools\", src: \"#ramfs/new\" });", ["config.addBind"]],
  ["updateBind", "Replace a system bind by id", [{ name: "id", type: "string", required: true, description: "Bind id." }, { name: "bind", type: "BindRecord", required: true, description: "The new bind." }], "{ ok, bind }", "Replaces a bind in place.", "GearShell.config.updateBind(\"tools\", { id: \"tools\", type: \"ns\", dst: \"tools\", src: \"#ramfs/new\", mode: \"0755\" });", ["config.updateBind"]],
  ["removeBind", "Remove a system bind", [{ name: "id", type: "string", required: true, description: "Bind id." }], "{ ok, id }", "Removes a bind by id. The root bind (`dst: \".\"`) is protected.", "GearShell.config.removeBind(\"tools\");", ["config.removeBind"]],
  ["setBinds", "Atomically replace all system binds", [{ name: "binds", type: "BindRecord[]", required: true, description: "The new bind list. Must include the root bind." }], "{ ok, binds }", "Replaces the entire bind list atomically. The root bind must survive in the replacement list or the call rejects.", "GearShell.config.setBinds([\n  { id: \"root\", type: \"ns\", dst: \".\", src: \"#ramfs/new\" },\n  { id: \"bin\", type: \"ns\", dst: \"bin\", src: \"#js/binds/bin\" },\n]);", ["config.setBinds"]],
  ["updateRuntime", "Patch the wanix runtime pin + allowOrigins", [{ name: "patch", type: "Partial<RuntimeRecord>", required: true, description: "Patch object." }], "{ ok, runtime }", "Shallow-merges a patch into the runtime pin. Pass `{ allowOrigins: \"https://example.com\" }` to widen (or narrow) the iframe `allow-same-origin` set. Reload to apply.", "GearShell.config.updateRuntime({ allowOrigins: \"https://example.com\" });\nGearShell.config.reload();", ["config.updateRuntime"]],
  ["reload", "Restart the workspace", [], "{ ok, started }", "Kills every workspace task and reloads the page. The new shell picks up any bind, runtime, or workspace changes that were queued.", "GearShell.config.reload();", ["config.reload"]],
  ["audit.list", "List the config-change audit ring", [], "{ ok, entries }", "Returns the most recent audited shell changes.", "GearShell.config.audit.list().entries.forEach(e => console.log(e.id, e.kind));", ["config.audit.list"]],
  ["audit.clear", "Empty the audit ring", [], "{ ok, cleared }", "Clears the in-memory audit ring.", "GearShell.config.audit.clear();", ["config.audit.clear"]],
  ["audit.undo", "Restore the config snapshot saved before that change", [{ name: "id", type: "string", required: true, description: "Audit entry id." }], "{ ok, restored }", "Restores the snapshot saved before the audit entry with the given id.", "GearShell.config.audit.undo(\"audit-12345\");", ["config.audit.undo"]],
  ["kv.get", "Read a per-workspace JSON value by key", [{ name: "key", type: "string", required: true, description: "The kv key." }], "{ ok, value? }", "Reads any JSON value stored in the active workspace's kv store. Returns `{ ok: true, value: undefined }` when the key is absent.", "const state = GearShell.config.kv.get(\"my-plugin:state\");", ["config.kv.get"]],
  ["kv.set", "Upsert a JSON value", [{ name: "key", type: "string", required: true, description: "The kv key." }, { name: "value", type: "any", required: true, description: "Any JSON-serialisable value." }], "{ ok, key }", "Writes a JSON value at the given key. The write is audited and emits a `config.changed` event.", "GearShell.config.kv.set(\"my-plugin:state\", { foo: 1 });", ["config.kv.set"]],
  ["kv.delete", "Remove a key", [{ name: "key", type: "string", required: true, description: "The kv key." }], "{ ok, deleted }", "Removes the value at the given key. Returns `{ deleted: false }` when absent.", "GearShell.config.kv.delete(\"my-plugin:state\");", ["config.kv.delete"]],
  ["kv.list", "List kv keys (optionally filtered by prefix)", [{ name: "prefix", type: "string", required: false, description: "Prefix filter." }], "{ ok, keys }", "Returns every key in the active workspace's kv store, sorted.", "GearShell.config.kv.list(\"my-plugin:\").keys.forEach(console.log);", ["config.kv.list"]],
  ["reset", "Reset the active workspace shell config to defaults", [], "{ ok }", "Replaces the entire shell config with the built-in defaults.", "GearShell.config.reset();\nGearShell.config.reload();", ["config.reset"]],
  ["workspace.list", "List workspaces", [], "{ ok, workspaces }", "Returns every workspace summary (id + name + active flag).", "GearShell.config.workspace.list().workspaces.forEach(console.log);", ["config.workspace.list"]],
  ["workspace.getActive", "Read the active workspace", [], "{ ok, workspace }", "Returns the full active workspace.", "const ws = GearShell.config.workspace.getActive().workspace;", ["config.workspace.getActive"]],
  ["workspace.getActiveId", "Read the active workspace id", [], "{ ok, id }", "Cheap accessor for just the active workspace's id.", "const id = GearShell.config.workspace.getActiveId().id;", ["config.workspace.getActiveId"]],
  ["workspace.ensure", "Ensure the workspace store exists", [], "{ ok }", "Bootstraps the workspace store if it isn't already initialised.", "GearShell.config.workspace.ensure();", ["config.workspace.ensure"]],
  ["workspace.select", "Select the active workspace", [{ name: "id", type: "string", required: true, description: "Workspace id." }], "{ ok, id }", "Switches the active workspace.", "GearShell.config.workspace.select(\"ws-2\");", ["config.workspace.select"]],
  ["workspace.rename", "Rename a workspace", [{ name: "id", type: "string", required: true, description: "Workspace id." }, { name: "name", type: "string", required: true, description: "New display name." }], "{ ok, id, name }", "Sets a new display name. The id stays the same.", "GearShell.config.workspace.rename(\"ws-2\", \"Research\");", ["config.workspace.rename"]],
  ["workspace.createFromPreset", "Create a workspace from a preset", [{ name: "presetId", type: "string", required: true, description: "Preset id." }], "{ ok, id }", "Creates a new workspace initialised with the given preset.", "GearShell.config.workspace.createFromPreset(\"blank\");", ["config.workspace.createFromPreset"]],
  ["workspace.duplicate", "Duplicate a workspace", [{ name: "id", type: "string", required: true, description: "Workspace id." }], "{ ok, id }", "Clones the workspace's tasks, binds, and ui.", "GearShell.config.workspace.duplicate(\"ws-1\");", ["config.workspace.duplicate"]],
  ["workspace.delete", "Delete a workspace", [{ name: "id", type: "string", required: true, description: "Workspace id." }], "{ ok }", "Removes the workspace. The active workspace cannot be deleted.", "GearShell.config.workspace.delete(\"ws-2\");", ["config.workspace.delete"]],
  ["workspace.parse", "Parse and normalize workspace JSON", [{ name: "serialized", type: "string", required: true, description: "Workspace JSON." }], "{ ok, workspace } | { ok, error }", "Validates a serialized workspace string. Does not import.", "GearShell.config.workspace.parse(jsonString);", ["config.workspace.parse"]],
  ["workspace.import", "Import workspace JSON as a new workspace", [{ name: "serialized", type: "string", required: true, description: "Workspace JSON." }], "{ ok, id }", "Parses, validates, and stores a new workspace from the given JSON string.", "GearShell.config.workspace.import(jsonString);", ["config.workspace.import"]],
  ["workspace.replaceActive", "Replace the active workspace with workspace JSON", [{ name: "serialized", type: "string", required: true, description: "Workspace JSON." }], "{ ok }", "Replaces the active workspace in place. The page reloads to apply the change.", "GearShell.config.workspace.replaceActive(jsonString);\nGearShell.config.reload();", ["config.workspace.replaceActive"]],
  ["workspace.uniqueName", "Find an unused workspace name", [{ name: "name", type: "string", required: true, description: "Desired name." }, { name: "excludedId", type: "string", required: false, description: "Skip this id when checking uniqueness (useful for renames)." }], "{ ok, name }", "Returns a workspace name that doesn't collide.", "const { name } = GearShell.config.workspace.uniqueName(\"My Workspace\");", ["config.workspace.uniqueName"]],
  ["presets.list", "List workspace presets", [], "{ ok, presets }", "Returns every built-in and custom preset.", "GearShell.config.presets.list().presets.forEach(console.log);", ["config.presets.list"]],
  ["presets.getCustom", "Read a custom workspace preset", [{ name: "id", type: "string", required: true, description: "Preset id." }], "{ ok, preset }", "Returns the full preset definition. Built-in presets are not exposed here.", "GearShell.config.presets.getCustom(\"blank\");", ["config.presets.getCustom"]],
  ["presets.saveCustom", "Save a custom workspace preset", [{ name: "preset", type: "PresetRecord", required: true, description: "Preset record." }], "{ ok, id }", "Persists a preset record.", "GearShell.config.presets.saveCustom({ id: \"research\", name: \"Research\", tasks: [] });", ["config.presets.saveCustom"]],
  ["presets.removeCustom", "Remove a custom workspace preset", [{ name: "id", type: "string", required: true, description: "Preset id." }], "{ ok }", "Removes the preset by id. Built-in presets cannot be removed.", "GearShell.config.presets.removeCustom(\"research\");", ["config.presets.removeCustom"]],
  ["presets.uniqueName", "Find an unused preset name", [{ name: "name", type: "string", required: true, description: "Desired name." }], "{ ok, name }", "Returns a preset name that doesn't collide.", "const { name } = GearShell.config.presets.uniqueName(\"My Preset\");", ["config.presets.uniqueName"]],
  ["binds.list", "List workspace task binds", [], "{ ok, binds }", "The workspace-level binds applied to task namespaces.", "GearShell.config.binds.list().binds.forEach(console.log);", ["config.binds.list"]],
  ["binds.add", "Add a workspace task bind", [{ name: "bind", type: "BindRecord", required: true, description: "Bind to add." }], "{ ok, bind }", "Adds a bind; reload to materialise it.", "GearShell.config.binds.add({ id: \"data\", type: \"ns\", dst: \"data\", src: \"#opfs/home/data\" });", ["config.binds.add"]],
  ["binds.update", "Update a workspace task bind", [{ name: "id", type: "string", required: true, description: "Bind id." }, { name: "bind", type: "BindRecord", required: true, description: "Replacement bind." }], "{ ok, bind }", "Replaces the bind by id.", "GearShell.config.binds.update(\"data\", { id: \"data\", type: \"ns\", dst: \"data\", src: \"#opfs/home/data\", mode: \"0755\" });", ["config.binds.update"]],
  ["binds.remove", "Remove a workspace task bind", [{ name: "id", type: "string", required: true, description: "Bind id." }], "{ ok }", "Removes the bind by id.", "GearShell.config.binds.remove(\"data\");", ["config.binds.remove"]],
  ["binds.reorder", "Reorder workspace task binds", [{ name: "ids", type: "string[]", required: true, description: "New id order." }], "{ ok }", "Sets the bind order to match the supplied id array.", "GearShell.config.binds.reorder([\"data\", \"tools\", \"scratch\"]);", ["config.binds.reorder"]],
  ["binds.set", "Replace workspace task binds", [{ name: "binds", type: "BindRecord[]", required: true, description: "New bind list." }], "{ ok }", "Replaces the bind list atomically.", "GearShell.config.binds.set([{ id: \"data\", type: \"ns\", dst: \"data\", src: \"#opfs/home/data\" }]);", ["config.binds.set"]],
  ["binds.systemList", "List shared system binds", [], "{ ok, binds }", "Same as `config.getBinds().binds` — exposed for symmetry.", "GearShell.config.binds.systemList().binds.forEach(console.log);", ["config.binds.systemList"]],
  ["binds.systemAdd", "Add a shared system bind", [{ name: "bind", type: "BindRecord", required: true, description: "Bind to add." }], "{ ok, bind }", "Append a bind to the system namespace. Reload to apply.", "GearShell.config.binds.systemAdd({ id: \"tools\", type: \"ns\", dst: \"tools\", src: \"#ramfs/new\" });", ["config.binds.systemAdd"]],
  ["binds.systemUpdate", "Update a shared system bind", [{ name: "id", type: "string", required: true, description: "Bind id." }, { name: "bind", type: "BindRecord", required: true, description: "Replacement bind." }], "{ ok, bind }", "Replace a system bind by id.", "GearShell.config.binds.systemUpdate(\"tools\", { id: \"tools\", type: \"ns\", dst: \"tools\", src: \"#ramfs/new\", mode: \"0755\" });", ["config.binds.systemUpdate"]],
  ["binds.systemRemove", "Remove a shared system bind", [{ name: "id", type: "string", required: true, description: "Bind id." }], "{ ok }", "Remove a system bind by id. The root bind is protected.", "GearShell.config.binds.systemRemove(\"tools\");", ["config.binds.systemRemove"]],
  ["binds.systemReorder", "Reorder shared system binds", [{ name: "ids", type: "string[]", required: true, description: "New id order." }], "{ ok }", "Sets the bind order.", "GearShell.config.binds.systemReorder([\"tools\", \"data\"]);", ["config.binds.systemReorder"]],
  ["binds.systemSet", "Replace shared system binds", [{ name: "binds", type: "BindRecord[]", required: true, description: "New bind list." }], "{ ok }", "Replace the entire system bind list.", "GearShell.config.binds.systemSet([{ id: \"root\", type: \"ns\", dst: \".\", src: \"#ramfs/new\" }]);", ["config.binds.systemSet"]],
  ["tasks.list", "List saved workspace tasks", [], "{ ok, tasks }", "Returns every saved task.", "GearShell.config.tasks.list().tasks.forEach(console.log);", ["config.tasks.list"]],
  ["tasks.add", "Add a saved workspace task", [{ name: "task", type: "TaskRecord", required: true, description: "Task record." }], "{ ok, task }", "Persists a task so it auto-restarts on workspace reload.", "GearShell.config.tasks.add({ id: \"scratch\", name: \"scratch\", cmd: \"/bin/bash\", term: true });", ["config.tasks.add"]],
  ["tasks.update", "Update a saved workspace task", [{ name: "id", type: "string", required: true, description: "Task id." }, { name: "task", type: "TaskRecord", required: true, description: "Replacement task." }], "{ ok, task }", "Replace the task record by id.", "GearShell.config.tasks.update(\"scratch\", { id: \"scratch\", name: \"scratch\", cmd: \"/bin/zsh\" });", ["config.tasks.update"]],
  ["tasks.remove", "Remove a saved workspace task", [{ name: "id", type: "string", required: true, description: "Task id." }], "{ ok }", "Removes the task from the saved catalog.", "GearShell.config.tasks.remove(\"scratch\");", ["config.tasks.remove"]],
  ["tasks.set", "Replace saved workspace tasks", [{ name: "tasks", type: "TaskRecord[]", required: true, description: "Replacement tasks." }], "{ ok }", "Replace the entire saved-task list atomically.", "GearShell.config.tasks.set([\n  { id: \"build\", name: \"build\", cmd: \"npm run build\", term: false, background: true },\n]);", ["config.tasks.set"]],
  ["terminalIcons.list", "List icons available for Console profiles", [], "{ ok, icons }", "Returns every icon record (lucide name + label).", "GearShell.config.terminalIcons.list().icons.slice(0, 5);", ["config.terminalIcons.list"]],
  ["terminalProfiles.list", "List normalized Console profiles", [], "{ ok, profiles }", "Returns every profile after normalization.", "GearShell.config.terminalProfiles.list().profiles.forEach(console.log);", ["config.terminalProfiles.list"]],
  ["terminalProfiles.save", "Save Console profiles", [{ name: "profiles", type: "ProfileRecord[]", required: true, description: "Profiles to save." }], "{ ok }", "Persist the full profile array.", "GearShell.config.terminalProfiles.save([\n  { id: \"default\", name: \"Default\", cmd: \"/bin/bash\" },\n]);", ["config.terminalProfiles.save"]],
  ["terminalProfiles.normalize", "Normalize a Console profile without saving it", [{ name: "profile", type: "ProfileRecord", required: true, description: "Profile to normalize." }], "{ ok, profile }", "Useful in plugin UIs that let the user edit a profile and want to preview the normalized shape.", "GearShell.config.terminalProfiles.normalize({ id: \"default\", name: \"Default\", cmd: \"/bin/bash\" });", ["config.terminalProfiles.normalize"]],
  ["terminalProfiles.normalizeOrder", "Normalize Console profile ordering", [{ name: "order", type: "string[]", required: true, description: "Profile ids." }], "{ ok, order }", "Returns the profile order after deduplication and defaulting.", "GearShell.config.terminalProfiles.normalizeOrder([\"default\", \"ssh\"]);", ["config.terminalProfiles.normalizeOrder"]],
  ["terminalProfiles.command", "Build the command specification for a Console profile", [{ name: "profile", type: "ProfileRecord", required: true, description: "Profile to resolve." }], "{ ok, command }", "Returns the resolved `{ cmd, args, env }` triple that the terminal layer would actually exec.", "GearShell.config.terminalProfiles.command({ id: \"default\", name: \"Default\", cmd: \"/bin/bash\" });", ["config.terminalProfiles.command"]],
  ["launcher.normalizeOrder", "Normalize launcher ordering", [{ name: "order", type: "string[]", required: true, description: "Component ids in desired order." }], "{ ok, order }", "Returns the launcher order after validation.", "GearShell.config.launcher.normalizeOrder([\"home\", \"files\", \"terminal\"]);", ["config.launcher.normalizeOrder"]],
  ["runtimeDefaults", "Read the built-in Wanix runtime defaults", [], "{ ok, defaults }", "The runtime defaults the shell would apply if the runtime pin were empty.", "GearShell.config.runtimeDefaults().defaults;", ["config.runtimeDefaults"]],
  ["plugins.list", "List installed plugins and enabled state", [], "{ ok, plugins }", "Returns every installed plugin manifest plus its `enabled` flag.", "GearShell.config.plugins.list().plugins.forEach(p => console.log(p.id, p.enabled));", ["config.plugins.list"]],
  ["plugins.install", "Install a plugin from a manifest", [{ name: "manifest", type: "PluginManifest", required: true, description: "Plugin manifest." }], "{ ok, id }", "Validates and stores the manifest. The plugin boots on next reload.", "GearShell.config.plugins.install({ id: \"x\", name: \"X\", iframe: { src: \"/plugin/x/\" } });", ["config.plugins.install"]],
  ["plugins.remove", "Remove an installed plugin", [{ name: "id", type: "string", required: true, description: "Plugin id." }], "{ ok }", "Removes the plugin from storage.", "GearShell.config.plugins.remove(\"x\");", ["config.plugins.remove"]],
  ["plugins.setEnabled", "Enable or disable an installed plugin", [{ name: "id", type: "string", required: true, description: "Plugin id." }, { name: "enabled", type: "boolean", required: true, description: "Enabled flag." }], "{ ok }", "Toggles the plugin's enabled flag.", "GearShell.config.plugins.setEnabled({ id: \"x\", enabled: false });", ["config.plugins.setEnabled"]],
  ["providers.list", "List model providers", [], "{ ok, providers }", "Returns every provider. `apiKey` is replaced with `hasApiKey: boolean` to avoid leaking secrets.", "GearShell.config.providers.list().providers.forEach(console.log);", ["config.providers.list"]],
  ["models.list", "List configured models across providers", [], "{ ok, models }", "Returns every configured model.", "GearShell.config.models.list().models.forEach(console.log);", ["config.models.list"]],
  ["models.save", "Add or update a model under an existing provider", [{ name: "model", type: "ModelRecord", required: true, description: "Model record." }], "{ ok }", "Adds or updates a model entry.", "GearShell.config.models.save({ providerId: \"deepseek\", id: \"deepseek-v4-flash\", name: \"DeepSeek V4 Flash\", contextWindow: 1000000, defaultMaxTokens: 163840, canReason: true, supportsImages: false });", ["config.models.save"]],
  ["models.remove", "Remove a model from a provider", [{ name: "providerId", type: "string", required: true, description: "Provider id." }, { name: "modelId", type: "string", required: true, description: "Model id." }], "{ ok }", "Removes the model entry.", "GearShell.config.models.remove({ providerId: \"deepseek\", modelId: \"deepseek-v4-flash\" });", ["config.models.remove"]],
  ["providers.save", "Upsert a provider", [{ name: "provider", type: "ProviderRecord", required: true, description: "Provider record." }], "{ ok, id }", "Adds or updates a provider. Pass an empty `apiKey` to keep the stored key.", "GearShell.config.providers.save({ id: \"openai\", name: \"OpenAI\", baseURL: \"https://api.openai.com/v1\", apiKey: \"sk-...\", models: [\"gpt-4o\"], enabled: true });", ["config.providers.save"]],
  ["providers.remove", "Delete a provider by id", [{ name: "id", type: "string", required: true, description: "Provider id." }], "{ ok }", "Removes the provider and its model entries.", "GearShell.config.providers.remove(\"openai\");", ["config.providers.remove"]],
];

for (const [name, summary, args, retSig, retDesc, exampleCode, perms] of CONFIG_TABLE) {
  RECORDS.push({
    id: `config.${name}`,
    title: `GearShell.config.${name}`,
    namespace: "config",
    returns: retSig,
    sync: true,
    permissions: perms,
    summary,
    signature: `GearShell.config.${name}(${args.map((a) => a.name).join(", ")})`,
    args,
    returnsDescription: retDesc,
    examples: [
      { title: "From the shell page", code: exampleCode },
      {
        title: "From the gear CLI",
        code: `gear config.${name} '${JSON.stringify(
          args.map((a) => {
            if (a.type === "string") return "x";
            if (a.type === "boolean") return true;
            if (a.type === "number") return 0;
            if (a.type?.endsWith("[]")) return [];
            return {};
          })
        )}'`,
      },
    ],
  });
}

// Panels
RECORDS.push({
  id: "panels.list", title: "GearShell.panels.list", namespace: "panels",
  returns: "{ ok, panels }", sync: true, permissions: ["panels.list"],
  summary: "List every open dockview panel: id, component, title, active, group. Use this to find a panel id before closing or focusing it.",
  signature: "GearShell.panels.list()",
  returnsDescription: "`{ ok: true, panels: PanelSummary[] }`. Each summary has `id`, `component`, `title`, `active`, and `group`.",
  examples: [{ title: "From the shell page", code: `const { panels } = GearShell.panels.list();\npanels.forEach(p => console.log(p.id, p.component, p.title));` }],
});
RECORDS.push({
  id: "panels.open", title: "GearShell.panels.open", namespace: "panels",
  returns: "{ ok, id }", sync: true, permissions: ["panels.open"],
  summary: "Open a panel by component name (or an iframe URL via `browser.open`). The `options` argument controls where the panel docks: `direction`, `group`, `referencePanel`.",
  signature: `GearShell.panels.open(component, options)`,
  args: [
    { name: "component", type: "string", required: true, description: "Panel component name (e.g. `\"home\"`, `\"files\"`, `\"terminal\"`, or a custom iframe component)." },
    { name: "options", type: "{ group?, referencePanel?, direction? }", required: false, description: "Docking options. `direction` is `\"left\" | \"right\" | \"above\" | \"below\"`; `group` is an existing dockview group id; `referencePanel` is a panel id to split next to." },
  ],
  returnsDescription: "`{ ok: true, id }` — the new panel's id.",
  examples: [
    { title: "Open Files in a new tab", code: `GearShell.panels.open("files");` },
    { title: "Dock Files to the right of the active panel", code: `GearShell.panels.open("files", { direction: "right" });` },
    { title: "Open a custom iframe plugin", code: `GearShell.panels.open("iframe:my-plugin", { direction: "below" });` },
  ],
});
RECORDS.push({
  id: "panels.close", title: "GearShell.panels.close", namespace: "panels",
  returns: "{ ok, id }", sync: true, permissions: ["panels.close"],
  summary: "Close a panel by id. Use `panels.list` to find ids.",
  signature: `GearShell.panels.close(id)`,
  args: [{ name: "id", type: "string", required: true, description: "Panel id." }],
  examples: [{ title: "Close a panel", code: `GearShell.panels.close("settings-1");` }],
});
RECORDS.push({
  id: "panels.focus", title: "GearShell.panels.focus", namespace: "panels",
  returns: "{ ok, id }", sync: true, permissions: ["panels.focus"],
  summary: "Activate a panel by id. The panel becomes the focused tab.",
  signature: `GearShell.panels.focus(id)`,
  args: [{ name: "id", type: "string", required: true, description: "Panel id." }],
  examples: [{ title: "Focus the home panel", code: `GearShell.panels.focus("home-1");` }],
});

// Browser
RECORDS.push({
  id: "browser.open", title: "GearShell.browser.open", namespace: "browser",
  returns: "{ ok, id }", sync: true, permissions: ["browser.open"],
  summary: "Open an http(s) URL in an iframe panel. The shell enforces the wanix runtime's `allowOrigins` list; cross-origin requests outside that list are blocked.",
  signature: `GearShell.browser.open(url, options)`,
  args: [
    { name: "url", type: "string", required: true, description: "URL. Must start with `http://` or `https://`." },
    { name: "options", type: "{ direction? }", required: false, description: "Docking options (same shape as `panels.open`)." },
  ],
  returnsDescription: "`{ ok: true, id }` — the new browser panel's id.",
  examples: [
    { title: "Open example.com in a new tab", code: `GearShell.browser.open("https://example.com");` },
    { title: "Open it to the right of the active panel", code: `GearShell.browser.open("https://example.com", { direction: "right" });` },
  ],
});

// Files
RECORDS.push({
  id: "files.open", title: "GearShell.files.open", namespace: "files",
  returns: "{ ok, id }", sync: true, permissions: ["files.open"],
  summary: "Reveal a VFS path in the Files panel. If the panel isn't open yet, it opens; if it is, it navigates to the path.",
  signature: `GearShell.files.open(path, options)`,
  args: [
    { name: "path", type: "string", required: true, description: "VFS path, e.g. `\"/opfs/home/notes.md\"`." },
    { name: "options", type: "{ direction? }", required: false, description: "Docking options." },
  ],
  examples: [{ title: "Open notes.md in Files", code: `GearShell.files.open("/opfs/home/notes.md");` }],
});

// Tasks
RECORDS.push({
  id: "tasks.list", title: "GearShell.tasks.list", namespace: "tasks",
  returns: "{ ok, tasks }", sync: true, permissions: ["tasks.list"],
  summary: "List live workspace-task sessions. Each entry has `id`, `name`, `cmd`, `status`, and a `pid` if the task is running.",
  signature: `GearShell.tasks.list()`,
  returnsDescription: "`{ ok: true, tasks: TaskSummary[] }`.",
  examples: [{ title: "List running tasks", code: `const { tasks } = GearShell.tasks.list();\nconsole.table(tasks);` }],
});
RECORDS.push({
  id: "tasks.create", title: "GearShell.tasks.create", namespace: "tasks",
  returns: "{ ok, id }", sync: true, permissions: ["tasks.create"],
  summary: "Create a new workspace task. With `background: true` the task runs headless (no panel); otherwise it opens a terminal panel.",
  signature: `GearShell.tasks.create(spec, options)`,
  args: [
    { name: "spec", type: "{ name, cmd, term?, background?, persist? }", required: true, description: "Task spec. `term` selects between terminal-mode (`true`) and headless (`false` or `background: true`). `persist: true` survives reloads." },
    { name: "options", type: "{ silent?, autoClose? }", required: false, description: "Run options." },
  ],
  examples: [
    { title: "Start a headless background task", code: `const { id } = GearShell.tasks.create({\n  name: "scratch",\n  cmd: "while true; do date; sleep 1; done",\n  background: true,\n});` },
    { title: "Open an interactive terminal", code: `GearShell.tasks.create({ name: "scratch", cmd: "/bin/bash", term: true });` },
  ],
});
RECORDS.push({
  id: "tasks.cancel", title: "GearShell.tasks.cancel", namespace: "tasks",
  returns: "{ ok, id }", sync: true, permissions: ["tasks.cancel"],
  summary: "Kill a running task and close its panel.",
  signature: `GearShell.tasks.cancel(id)`,
  args: [{ name: "id", type: "string", required: true, description: "Task id." }],
  examples: [{ title: "Cancel a running task", code: `GearShell.tasks.cancel("task-1");` }],
});
RECORDS.push({
  id: "tasks.output", title: "GearShell.tasks.output", namespace: "tasks",
  returns: "{ ok, output }", sync: true, permissions: ["tasks.output"],
  summary: "Read the captured output of a headless task. Terminal tasks (interactive) refuse this call.",
  signature: `GearShell.tasks.output(id)`,
  args: [{ name: "id", type: "string", required: true, description: "Task id." }],
  examples: [{ title: "Read headless task output", code: `const { output } = GearShell.tasks.output("task-1");\nconsole.log(output);` }],
});

// Agents
RECORDS.push({
  id: "agents.list", title: "GearShell.agents.list", namespace: "agents",
  returns: "{ ok, sessions }", sync: true, permissions: ["agents.list"],
  summary: "List live terminal + task sessions (id prefix: `terminal-` / `task-`).",
  signature: `GearShell.agents.list()`,
  examples: [{ title: "List agent sessions", code: `const { sessions } = GearShell.agents.list();\nsessions.forEach(s => console.log(s.id, s.kind));` }],
});
RECORDS.push({
  id: "agents.prompt", title: "GearShell.agents.prompt", namespace: "agents",
  returns: "{ ok, busy?, retryAfterMs? }", sync: true, permissions: ["agents.prompt"],
  summary: "Inject a line into a live terminal session. The terminal may be busy running a previous command and the call may refuse with `{ ok: true, busy: true, retryAfterMs: N }`. Wait and retry, or use `gear agents.prompt-wait` from the CLI.",
  signature: `GearShell.agents.prompt(id, text, options)`,
  args: [
    { name: "id", type: "string", required: true, description: "Session id (e.g. `\"terminal-1\"`)." },
    { name: "text", type: "string", required: true, description: "Text to inject (a trailing newline is usually expected)." },
    { name: "options", type: "{ force? }", required: false, description: "Pass `{ force: true }` to bypass the busy check." },
  ],
  examples: [
    { title: "Inject a command", code: `const reply = GearShell.agents.prompt("terminal-1", "ls -la\\n");\nif (reply.busy) {\n  // retry after reply.retryAfterMs\n}` },
    { title: "Bypass the busy gate", code: `GearShell.agents.prompt("terminal-1", "Ctrl+C", { force: true });` },
  ],
});
RECORDS.push({
  id: "agents.read", title: "GearShell.agents.read", namespace: "agents",
  returns: "{ ok, text }", sync: true, permissions: ["agents.read"],
  summary: "Snapshot the terminal scrollback as plain text. Pass `{ rows: N }` to limit the snapshot to the last N lines.",
  signature: `GearShell.agents.read(id, options)`,
  args: [
    { name: "id", type: "string", required: true, description: "Session id." },
    { name: "options", type: "{ rows? }", required: false, description: "Limit to the last N rows." },
  ],
  examples: [{ title: "Read last 100 lines", code: `const { text } = GearShell.agents.read("terminal-1", { rows: 100 });\nconsole.log(text);` }],
});
RECORDS.push({
  id: "agents.interrupt", title: "GearShell.agents.interrupt", namespace: "agents",
  returns: "{ ok }", sync: true, permissions: ["agents.interrupt"],
  summary: "Send Ctrl+C to a live session.",
  signature: `GearShell.agents.interrupt(id)`,
  args: [{ name: "id", type: "string", required: true, description: "Session id." }],
  examples: [{ title: "Interrupt a session", code: `GearShell.agents.interrupt("terminal-1");` }],
});

// Music — table-driven.
const MUSIC_TABLE = [
  ["play", "Replace the queue with one track and play it", [{ name: "src", type: "string", required: true, description: "URL or VFS path." }, { name: "title", type: "string", required: false, description: "Display title." }], "GearShell.music.play(\"https://example.com/song.mp3\", \"Song\");", "music.play"],
  ["playQueue", "Queue a list of tracks and start at startIndex", [{ name: "tracks", type: "Track[]", required: true, description: "List of `{ src, title }`." }, { name: "startIndex", type: "number", required: false, description: "Index to start at." }], "GearShell.music.playQueue([{ src: \"/opfs/home/a.mp3\", title: \"A\" }, { src: \"/opfs/home/b.mp3\", title: \"B\" }]);", "music.playQueue"],
  ["enqueue", "Append tracks to the queue", [{ name: "tracks", type: "Track[]", required: true, description: "Tracks to append." }], "GearShell.music.enqueue([{ src: \"/opfs/home/c.mp3\", title: \"C\" }]);", "music.enqueue"],
  ["next", "Skip to the next track", [], "GearShell.music.next();", "music.next"],
  ["prev", "Restart the track or go back", [], "GearShell.music.prev();", "music.prev"],
  ["setLoop", "Loop mode: off / all / one", [{ name: "mode", type: "\"off\" | \"all\" | \"one\"", required: true, description: "Loop mode." }], "GearShell.music.setLoop(\"all\");", "music.setLoop"],
  ["setShuffle", "Toggle random playback order", [{ name: "on", type: "boolean", required: true, description: "Enable shuffle." }], "GearShell.music.setShuffle(true);", "music.setShuffle"],
  ["seek", "Seek the loaded track", [{ name: "seconds", type: "number", required: true, description: "Position in seconds." }], "GearShell.music.seek(42);", "music.seek"],
  ["reorderQueue", "Move a queue entry; the playing track stays pinned", [{ name: "from", type: "number", required: true, description: "Source index." }, { name: "to", type: "number", required: true, description: "Target index." }], "GearShell.music.reorderQueue(0, 3);", "music.reorderQueue"],
  ["removeFromQueue", "Remove a queue entry by index", [{ name: "index", type: "number", required: true, description: "Index to remove." }], "GearShell.music.removeFromQueue(2);", "music.removeFromQueue"],
  ["clearQueue", "Empty the queue (keeps playing)", [], "GearShell.music.clearQueue();", "music.clearQueue"],
  ["listPlaylists", "List named playlists", [], "GearShell.music.listPlaylists();", "music.listPlaylists"],
  ["savePlaylist", "Save the queue (or explicit tracks) under a name", [{ name: "name", type: "string", required: true, description: "Playlist name." }, { name: "tracks", type: "Track[]", required: false, description: "Optional explicit tracks; defaults to the current queue." }], "GearShell.music.savePlaylist(\"Focus\");", "music.savePlaylist"],
  ["renamePlaylist", "Rename a playlist", [{ name: "id", type: "string", required: true, description: "Playlist id." }, { name: "name", type: "string", required: true, description: "New name." }], "GearShell.music.renamePlaylist(id, \"Deep Work\");", "music.renamePlaylist"],
  ["deletePlaylist", "Delete a playlist", [{ name: "id", type: "string", required: true, description: "Playlist id." }], "GearShell.music.deletePlaylist(id);", "music.deletePlaylist"],
  ["loadPlaylist", "Load a playlist into the queue", [{ name: "id", type: "string", required: true, description: "Playlist id." }], "GearShell.music.loadPlaylist(id);", "music.loadPlaylist"],
  ["pause", "Pause playback", [], "GearShell.music.pause();", "music.pause"],
  ["resume", "Resume playback", [], "GearShell.music.resume();", "music.resume"],
  ["stop", "Stop and unload the track", [], "GearShell.music.stop();", "music.stop"],
  ["nowPlaying", "Full playback snapshot", [], "GearShell.music.nowPlaying();", "music.nowPlaying"],
];

for (const [name, summary, args, exampleCode, perm] of MUSIC_TABLE) {
  RECORDS.push({
    id: `music.${name}`,
    title: `GearShell.music.${name}`,
    namespace: "music",
    returns: name === "nowPlaying" ? "{ ok, src, title, position, duration, loop, shuffle, playing, queue }" : "{ ok, ... }",
    sync: true,
    permissions: [perm],
    summary,
    signature: `GearShell.music.${name}(${args.map((a) => a.name).join(", ")})`,
    args,
    examples: [
      { title: "From the shell page", code: exampleCode },
      { title: "From the gear CLI", code: `gear music.${name} '${JSON.stringify(
        args.map((a) => a.name === "src" ? "https://example.com/song.mp3" : a.name === "title" ? "Song" : a.name === "mode" ? "all" : a.name === "on" ? true : ["from", "to", "index", "seconds"].includes(a.name) ? 0 : a.name === "tracks" ? [] : a.name === "name" ? "Focus" : a.name === "id" ? "playlist-id" : a.name === "startIndex" ? 0 : null)
      )}'` },
    ],
  });
}

// Terminal — table-driven.
const TERMINAL_TABLE = [
  ["list", "List live terminal and VM bridge sessions", [], "GearShell.terminal.list();", "terminal.list", "{ ok, sessions }"],
  ["create", "Create a terminal session for an iframe or same-page terminal client", [{ name: "profile", type: "ProfileSpec", required: true, description: "Terminal profile. Pass `{ cmd: \"/bin/bash\", term: true }` for an interactive shell." }], "GearShell.terminal.create({ cmd: \"/bin/bash\", term: true });", "terminal.create", "{ ok, id }"],
  ["write", "Write input data to a terminal session", [{ name: "id", type: "string", required: true, description: "Session id." }, { name: "data", type: "string | Uint8Array", required: true, description: "Data to write. Plain string is UTF-8 encoded." }], "const { id } = GearShell.terminal.create({ cmd: \"/bin/bash\", term: true });\nGearShell.terminal.write(id, \"ls\\n\");", "terminal.write", "{ ok }"],
  ["resize", "Update terminal dimensions", [{ name: "id", type: "string", required: true, description: "Session id." }, { name: "cols", type: "number", required: true, description: "Columns." }, { name: "rows", type: "number", required: true, description: "Rows." }], "GearShell.terminal.resize(id, 120, 32);", "terminal.resize", "{ ok }"],
  ["dispose", "Dispose a terminal session", [{ name: "id", type: "string", required: true, description: "Session id." }], "GearShell.terminal.dispose(id);", "terminal.dispose", "{ ok }"],
  ["onData", "Subscribe to terminal output", [{ name: "id", type: "string", required: true, description: "Session id." }, { name: "listener", type: "(data: string | Uint8Array) => void", required: true, description: "Listener function." }], "const { id } = GearShell.terminal.create({ cmd: \"/bin/bash\", term: true });\nGearShell.terminal.onData(id, (data) => console.log(\"output:\", data));", "terminal.onData", "{ ok, off }"],
  ["offData", "Unsubscribe a terminal output handler", [{ name: "id", type: "string", required: true, description: "Session id." }, { name: "listener", type: "function", required: true, description: "Listener to remove." }], "GearShell.terminal.offData(id, listener);", "terminal.offData", "{ ok }"],
  ["onExit", "Subscribe to terminal exit events", [{ name: "id", type: "string", required: true, description: "Session id." }, { name: "listener", type: "(code: number) => void", required: true, description: "Listener function." }], "GearShell.terminal.onExit(id, (code) => console.log(\"exit\", code));", "terminal.onExit", "{ ok, off }"],
  ["offExit", "Unsubscribe a terminal exit handler", [{ name: "id", type: "string", required: true, description: "Session id." }, { name: "listener", type: "function", required: true, description: "Listener to remove." }], "GearShell.terminal.offExit(id, listener);", "terminal.offExit", "{ ok }"],
];

for (const [name, summary, args, exampleCode, perm, retSig] of TERMINAL_TABLE) {
  RECORDS.push({
    id: `terminal.${name}`,
    title: `GearShell.terminal.${name}`,
    namespace: "terminal",
    returns: retSig,
    sync: true,
    permissions: [perm],
    summary,
    signature: `GearShell.terminal.${name}(${args.map((a) => a.name).join(", ")})`,
    args,
    examples: [
      { title: "From the shell page", code: exampleCode },
      { title: "From the gear CLI (write only)", code: `gear terminal.write '${JSON.stringify(["terminal-1", "ls\\n"])}'` },
    ],
    notes: name.startsWith("on") || name.startsWith("off") ? [
      "Subscribing via the bridge from an iframe requires the bridge's local channel (GearShell.subscribe('terminal.<id>.data')); the postMessage round-trip cannot carry function references.",
    ] : [],
  });
}

// VM
RECORDS.push({
  id: "vm.list", title: "GearShell.vm.list", namespace: "vm",
  returns: "{ ok, sessions }", sync: true, permissions: ["vm.*"],
  summary: "List VM sessions hosted by the shell.",
  signature: "GearShell.vm.list()",
  examples: [{ title: "List VMs", code: "GearShell.vm.list();" }],
});
RECORDS.push({
  id: "vm.create", title: "GearShell.vm.create", namespace: "vm",
  returns: "{ ok, id }", sync: true, permissions: ["vm.create"],
  summary: "Create an iframe VM session. VM plugins normally provide the backend and Linux assets; the host only brokers the iframe and the kernel handle.",
  signature: "GearShell.vm.create(config)",
  args: [{ name: "config", type: "VMConfig", required: true, description: "VM configuration (memory, disks, kernel, initrd, netdev, ...)." }],
  examples: [
    { title: "Create a 512MB VM", code: "GearShell.vm.create({ memory: \"512M\", netdev: \"\" });" },
    { title: "From the gear CLI", code: `gear vm.create '${JSON.stringify([{ memory: "512M" }])}'` },
  ],
  notes: ["The exact VM backend is provided by the iframe plugin you have installed (v86, rv64)."],
});

// W9y
RECORDS.push({
  id: "w9y.list", title: "GearShell.w9y.list", namespace: "w9y",
  returns: "{ ok, packages }", sync: true, permissions: ["w9y.list"],
  summary: "List installed w9y packages. The registry is mirrored in-memory from `/opfs/wanix/w9y-registry.json`.",
  signature: "GearShell.w9y.list()",
  examples: [{ title: "List installed mods", code: "const { packages } = GearShell.w9y.list();\nconsole.table(packages);" }],
});
RECORDS.push({
  id: "w9y.status", title: "GearShell.w9y.status", namespace: "w9y",
  returns: "{ ok, ...status }", sync: true, permissions: ["w9y.status"],
  summary: "Read one installed package's status (id, version, apply state).",
  signature: "GearShell.w9y.status(id)",
  args: [{ name: "id", type: "string", required: true, description: "Package id." }],
  examples: [{ title: "Read one mod's status", code: "GearShell.w9y.status(\"@crush/playground\");" }],
});
RECORDS.push({
  id: "w9y.refresh", title: "GearShell.w9y.refresh", namespace: "w9y",
  returns: "{ ok, note }", sync: true, permissions: ["w9y.refresh"],
  summary: "Re-read the on-disk registry from `w9y-registry.json`. Useful after a manual `w9y mod apply` from another tab.",
  signature: "GearShell.w9y.refresh()",
  examples: [{ title: "Refresh the registry", code: "GearShell.w9y.refresh();" }],
});
RECORDS.push({
  id: "w9y.apply", title: "GearShell.w9y.apply", namespace: "w9y",
  returns: "{ ok, id, note }", sync: true, permissions: ["w9y.apply"],
  summary: "Start installing a w9y package. The call returns immediately; results arrive as `w9y.changed` events (consume via `events.on` or `events.drain`).",
  signature: "GearShell.w9y.apply(id, version)",
  args: [
    { name: "id", type: "string", required: true, description: "Package id." },
    { name: "version", type: "string", required: false, description: "Specific version; defaults to latest." },
  ],
  examples: [
    { title: "Install latest", code: "GearShell.w9y.apply(\"@crush/playground\");" },
    { title: "Install pinned version", code: "GearShell.w9y.apply(\"@crush/playground\", \"1.2.3\");" },
  ],
});
RECORDS.push({
  id: "w9y.remove", title: "GearShell.w9y.remove", namespace: "w9y",
  returns: "{ ok, id, note }", sync: true, permissions: ["w9y.remove"],
  summary: "Start removing a w9y package.",
  signature: "GearShell.w9y.remove(id)",
  args: [{ name: "id", type: "string", required: true, description: "Package id." }],
  examples: [{ title: "Remove a mod", code: "GearShell.w9y.remove(\"@crush/playground\");" }],
});

// Events
RECORDS.push({
  id: "events.on", title: "GearShell.events.on", namespace: "events",
  returns: "{ ok, off }", sync: true, permissions: ["events.on"],
  summary: "Register an in-page event handler. Returns a token you can pass back to `events.off` to remove the handler.",
  signature: "GearShell.events.on(topic, handler)",
  args: [
    { name: "topic", type: "string", required: true, description: "Topic name (e.g. `\"task.status\"`, `\"config.changed\"`, `\"w9y.changed\"`)." },
    { name: "handler", type: "(payload: any) => void", required: true, description: "Handler function." },
  ],
  examples: [{ title: "Listen for task status changes", code: `const { off } = GearShell.events.on("task.status", (p) => console.log("status", p));\n// later: off();` }],
  notes: [
    "The bridge cannot carry function references across postMessage — iframe plugins must subscribe through the local bridge channel: GearShell.subscribe(topic); GearShell.on(topic, handler);",
  ],
});
RECORDS.push({
  id: "events.off", title: "GearShell.events.off", namespace: "events",
  returns: "{ ok, removed }", sync: true, permissions: ["events.off"],
  summary: "Remove all handlers for a topic.",
  signature: "GearShell.events.off(topic)",
  args: [{ name: "topic", type: "string", required: true, description: "Topic name." }],
  examples: [{ title: "Stop listening", code: "GearShell.events.off(\"task.status\");" }],
});
RECORDS.push({
  id: "events.emit", title: "GearShell.events.emit", namespace: "events",
  returns: "{ ok }", sync: true, permissions: ["events.emit"],
  summary: "Publish an event. The payload is mirrored to the event ring buffer and to `window.CustomEvent` listeners.",
  signature: "GearShell.events.emit(topic, payload)",
  args: [
    { name: "topic", type: "string", required: true, description: "Topic name." },
    { name: "payload", type: "any", required: true, description: "JSON-serialisable payload." },
  ],
  examples: [{ title: "Emit a custom event", code: `GearShell.events.emit("my-plugin.tick", { at: Date.now() });` }],
});
RECORDS.push({
  id: "events.drain", title: "GearShell.events.drain", namespace: "events",
  returns: "{ ok, events }", sync: true, permissions: ["events.drain"],
  summary: "Splice the agent event ring buffer. Consumes it — agents rely on this so they don't miss events. The high-water mark is persisted, so events survive reloads.",
  signature: "GearShell.events.drain()",
  examples: [{ title: "Drain buffered events", code: `const { events } = GearShell.events.drain();\nevents.forEach(e => console.log(e.topic, e.payload));` }],
});
RECORDS.push({
  id: "events.pending", title: "GearShell.events.pending", namespace: "events",
  returns: "{ ok, count }", sync: true, permissions: ["events.pending"],
  summary: "How many events are buffered for agents. Cheap read; use it to decide whether to `drain`.",
  signature: "GearShell.events.pending()",
  examples: [{ title: "Read the buffer size", code: `const { count } = GearShell.events.pending();\nif (count > 0) GearShell.events.drain();` }],
});

// FS — table-driven.
const FS_TABLE = [
  ["readFile", "Read a file as Uint8Array", [{ name: "path", type: "string", required: true, description: "VFS path (e.g. `/opfs/home/notes.md`)." }], "GearShell.fs.readFile(\"/opfs/home/notes.md\")", "The file's bytes as a `Uint8Array`. The iframe bridge carries Uint8Array unchanged across postMessage."],
  ["readFileText", "Read a file as a UTF-8 string", [{ name: "path", type: "string", required: true, description: "VFS path." }], "GearShell.fs.readFileText(\"/opfs/home/notes.md\")", "The decoded text content."],
  ["writeFile", "Write a Uint8Array (truncates)", [{ name: "path", type: "string", required: true, description: "VFS path." }, { name: "contents", type: "Uint8Array | number[] | ArrayBuffer", required: true, description: "Bytes to write." }], "GearShell.fs.writeFile(\"/opfs/home/notes.md\", new TextEncoder().encode(\"hello\\n\"));", "The byte count written."],
  ["writeFileText", "Write a UTF-8 string (truncates)", [{ name: "path", type: "string", required: true, description: "VFS path." }, { name: "text", type: "string", required: true, description: "Text to write." }], "GearShell.fs.writeFileText(\"/opfs/home/notes.md\", \"hello\\n\");", "The byte count written."],
  ["readDir", "List the immediate children of a path", [{ name: "path", type: "string", required: true, description: "Directory path." }], "GearShell.fs.readDir(\"/opfs/home\")", "An array of `{ name, isDirectory }`."],
  ["stat", "Read the metadata of a path", [{ name: "path", type: "string", required: true, description: "VFS path." }], "GearShell.fs.stat(\"/opfs/home/notes.md\")", "`{ path, size, mode, isDirectory, isFile, modTime, raw }` or `null` if the path doesn't exist."],
  ["exists", "Does the path exist?", [{ name: "path", type: "string", required: true, description: "VFS path." }], "GearShell.fs.exists(\"/opfs/home/notes.md\")", "`{ ok: true, path, exists }`. Returns `{ exists: false }` for ENOENT, throws for real I/O errors."],
  ["mkdir", "Create a directory", [{ name: "path", type: "string", required: true, description: "Directory path." }], "GearShell.fs.mkdir(\"/opfs/home/projects\")", "`{ ok: true, path }`."],
  ["rm", "Remove a path", [{ name: "path", type: "string", required: true, description: "VFS path." }], "GearShell.fs.rm(\"/opfs/home/scratch.txt\")", "`{ ok: true, path }`."],
  ["watch", "Watch a /opfs/... directory", [{ name: "path", type: "string", required: true, description: "A `/opfs/...` directory path (or `/opfs` for the root)." }, { name: "options", type: "{ recursive?: boolean }", required: false, description: "Pass `{ recursive: true }` to watch the whole subtree." }], "await GearShell.fs.watch(\"/opfs/home/notes\", { recursive: true });", "`{ ok: true, id, path, recursive }`. Mutations are delivered as `fs.changed` events (payload `{ path, type, root }`). Requires a Chromium-based runtime with `FileSystemObserver` support."],
  ["unwatch", "Dispose a watcher", [{ name: "handle", type: "object", required: true, description: "The full handle object returned by `fs.watch`." }], "await GearShell.fs.unwatch(handle);", "`{ ok: true, id, removed }`. Idempotent — calling twice returns `removed: false` on the second call."],
];

for (const [name, summary, args, exampleCode, retDesc] of FS_TABLE) {
  RECORDS.push({
    id: `fs.${name}`,
    title: `GearShell.fs.${name}`,
    namespace: "fs",
    returns: "{ ok: true, ... }",
    sync: true,
    permissions: ["fs.*"],
    summary,
    signature: `GearShell.fs.${name}(${args.map((a) => a.name).join(", ")})`,
    args,
    returnsDescription: retDesc,
    examples: [{ title: "From the shell page", code: exampleCode }],
    notes: [
      "Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.",
      "Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.",
    ],
  });
}

// Guides
const GUIDES = [
  ["overview", "GearShell API overview", `# GearShell API overview

GearShell exposes a single root object on the shell page: \`window.GearShell\`.
The same object is the bridge target for iframe plugins and the source of
the \`/js/GearShell/<method>:json\` jsfs mount agents use to drive the shell
from inside their namespaces.

## At a glance

| Surface | Used by | Shape |
|---------|---------|-------|
| \`window.GearShell\` | in-page JS, iframe bridge | nested object, sync (bridge is async) |
| \`/js/GearShell/*\` jsfs | agents inside a wanix task | file reads/writes; sync |
| \`gear <method> '<json-args>'\` | agents, humans in a terminal | wrapper over the jsfs mount |

The jsfs surface is the *source of truth* — every method on
\`window.GearShell\` is also callable from an agent via
\`exec 3<>/js/GearShell/<method>:json; echo '[...]' >&3; cat <&3\`. The
\`gear\` CLI is just sugar around that protocol.

## Synchrony

In-page calls are synchronous; calls across the iframe bridge are
\`async\` because the bridge proxies through \`postMessage\`. The jsfs
mount is synchronous by design — the kernel reads the result line
immediately after the write.

If you write code that runs both on the shell page and inside an iframe,
always \`await\` the result; on the shell page the promise resolves
synchronously, in the iframe it round-trips through the parent.

## Permissions

Iframe plugins opt in to API paths via the manifest's
\`permissions.api\` whitelist. The shell rejects calls to paths not in
the whitelist with \`{ ok: false, error: "permission denied: <path>" }\`.

The playground plugin manifest declares every permission path so the
Explorer tab can call any method. Most plugins should declare only what
they use.
`],
  ["iframe-bridge", "Calling the API from an iframe plugin", `# Calling the API from an iframe plugin

An iframe plugin's page is a separate browsing context. It loads
\`/plugin/gear-bridge.js\` as a classic script, which installs a
\`window.GearShell\` Proxy that turns every property access into a
\`postMessage\` to the parent shell. The parent validates the call
against the plugin's \`permissions.api\` whitelist and replies with the
result.

## The manifest

Every iframe plugin declares which API paths it can call:

\`\`\`json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "iframe": {
    "src": "/plugin/my-plugin/index.html",
    "allow": "clipboard-read; clipboard-write"
  },
  "permissions": {
    "api": [
      "panels.list",
      "panels.open",
      "music.nowPlaying",
      "music.play",
      "config.getShell"
    ]
  }
}
\`\`\`

## The bridge in code

\`\`\`html
<script src="/plugin/gear-bridge.js"></script>
<script type="module">
  // Every call is async — the bridge round-trips through postMessage.
  const { panels } = await GearShell.panels.list();
  console.log(panels);

  // Errors come back as { ok: false, error }.
  const reply = await GearShell.music.play("https://example.com/song.mp3");
  if (!reply.ok) console.error(reply.error);
</script>
\`\`\`

## Events

\`postMessage\` cannot carry function references, so subscribing to a
topic from an iframe uses a dedicated local channel:

\`\`\`js
// Open the channel for "task.status" once.
GearShell.subscribe("task.status");

// Add handlers with the local API.
GearShell.on("task.status", (payload) => {
  console.log("task status", payload);
});
\`\`\`

The shell mirrors every event the agent event ring buffer sees into
the local channel for each subscribed topic.

## Permissions denied

Calling a path not in your \`permissions.api\` returns:

\`\`\`js
const reply = await GearShell.config.reset();
// { ok: false, error: "permission denied: config.reset" }
\`\`\`

Update the manifest and reload the plugin to grant the path.
`],
  ["gear-cli", "Calling the API from the gear CLI", `# Calling the API from the gear CLI

The \`gear\` CLI is a thin bash wrapper over the \`/js/GearShell/*\` jsfs
mount. It lives at \`/bin/gear\` inside every agent task namespace, so
any agent (or human running \`hush\`/\`bash\` in a terminal) can call the
API without writing JavaScript.

## The protocol

\`\`\`bash
# exec a function file with fd 3, write the JSON args, read the JSON reply
exec 3<>/js/GearShell/<method>:json
echo '[<args-json>]' >&3
cat <&3
\`\`\`

\`gear\` does this in one line:

\`\`\`bash
gear <method.dotted.path> '<json-args-array>'
\`\`\`

## Examples

\`\`\`bash
# Probe
gear ping

# List open panels
gear panels.list

# Create a background task
gear tasks.create '[{"name":"probe","cmd":"echo hi","background":true}]'

# Patch the shell config
gear config.updateShell '[{"launcherOrder":["home","files"]}]'

# Read system binds
gear config.getSystem

# Add a bind
gear config.addBind '[{"id":"tools","type":"ns","dst":"tools","src":"#ramfs/new"}]'

# Patch the runtime pin
gear config.updateRuntime '[{"allowOrigins":"https://example.com"}]'

# Reload the workspace
gear config.reload

# Inject a prompt into a live terminal
gear agents.prompt '["terminal-1","ls -la"]'

# Snapshot terminal scrollback
gear agents.read '["terminal-1",{"rows":50}]'

# Open a URL in an iframe panel
gear open https://example.com
\`\`\`

## \`agents.prompt-wait\`

The jsfs bridge is synchronous, so \`agents.prompt\` returns
\`{ busy: true, retryAfterMs: N }\` while a previous command is still
running. The \`gear\` CLI wraps this with \`agents.prompt-wait\` that
retries until the prompt lands or a timeout elapses (default 30s):

\`\`\`bash
gear agents.prompt-wait terminal-1 "npm test" 60
\`\`\`

## Errors

The jsfs funcfile surfaces a thrown error as a failed read with no
message, so every bridged method catches and returns \`{ ok: false, error }\`.
\`gear\` surfaces the \`error\` field:

\`\`\`bash
$ gear tasks.cancel task-does-not-exist
{"ok":false,"error":"task not found"}
\`\`\`

## Reload-required changes

Binds, runtime, and workspace changes only take effect after a reload.
Pattern: \`gear config.updateX '...'\` followed by \`gear config.reload\`.
`],
  ["permissions", "Permissions & capability gating", `# Permissions & capability gating

The GearShell API is gated by a per-plugin permission list. The shell
rejects every call to a path not declared in the plugin's manifest.

## In manifests

\`\`\`json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "iframe": { "src": "/plugin/my-plugin/index.html" },
  "permissions": {
    "api": [
      "panels.list",
      "panels.open",
      "music.nowPlaying",
      "config.kv.get",
      "config.kv.set",
      "events.on",
      "events.off"
    ]
  }
}
\`\`\`

## Wildcards

You can grant an entire namespace with a trailing \`*\`:

\`\`\`json
"permissions": { "api": ["music.*", "panels.*"] }
\`\`\`

The shell expands the wildcard against the actual method list at call
time, so adding new methods to a namespace does not silently grant
them — only the explicitly listed paths work.

## Why no global root permission

There is intentionally no \`"*\` grant. The shell's audit log tracks
which plugin made each call, and a careless root grant would erase
that accountability.

## What the bridge rejects

A denied call returns:

\`\`\`js
{ ok: false, error: "permission denied: config.reset" }
\`\`\`

The shell's console also logs the rejection so a plugin developer can
see which path was blocked.

## Plugin-owned hotkeys

Hotkeys registered by an iframe plugin are owned by that plugin —
removing the plugin revokes the hotkey. \`hotkeys.unregister\` only
removes hotkeys owned by the calling plugin.
`],
  ["events", "Working with the event ring buffer", `# Working with the event ring buffer

GearShell has two event surfaces:

1. **In-page pub/sub** (\`GearShell.events.on/off/emit\`) — synchronous
   topic → handler dispatch, lives in the shell's memory.
2. **Agent ring buffer** (\`GearShell.events.drain\`) — fire-and-forget
   feed for agents running inside the wanix kernel. Persisted across
   reloads.

## In-page events

\`\`\`js
const token = GearShell.events.on("task.status", (p) => {
  console.log(p.taskId, p.status);
});

// later
GearShell.events.off("task.status");
\`\`\`

The same payload is mirrored to \`window.CustomEvent\` so DOM listeners
can react:

\`\`\`js
window.addEventListener("task.status", (e) => console.log(e.detail));
\`\`\`

## The agent ring buffer

The shell writes every task status into the ring buffer. Agents
running inside a wanix task poll it with \`gear events.drain\` (or read
the buffer count with \`gear events.pending\`):

\`\`\`bash
gear events.pending
# {"ok":true,"count":3}

gear events.drain
# {"ok":true,"events":[{"topic":"task.status","payload":{...}}, ...]}
\`\`\`

\`drain\` splices the buffer (consumes it). Persisted entries survive
reloads so an agent that restarts doesn't miss events that happened
while it was down.

## Common topics

| Topic | Payload |
|-------|---------|
| \`task.status\` | \`{ taskId, status }\` |
| \`task.output\` | \`{ taskId, chunk }\` |
| \`config.changed\` | the patch that was applied |
| \`w9y.changed\` | \`{ id, status }\` |
| \`panel.opened\` / \`panel.closed\` | \`{ id }\` |
`],
  ["fs", "Reading and writing the wanix filesystem", `# Reading and writing the wanix filesystem

The \`fs.*\` namespace is a thin wrapper over the wanix root's VFS calls.
The wanix kernel is the same one the Files panel uses, so an iframe
plugin reading \`GearShell.fs.readText("/opfs/home/foo.txt")\` reads the
same bytes the Files panel shows.

## Paths

Paths follow the wanix namespace syntax. Common examples:

| Path | What it points to |
|------|-------------------|
| \`/opfs/home\` | the user's home directory |
| \`/opfs/wanix\` | the wanix kernel assets |
| \`/js/binds/bin/gear\` | the \`gear\` CLI bind |
| \`#task/<task-id>/*\` | a live task's namespace |
| \`#ramfs/*\` | a ramfs mount |

## Examples

\`\`\`js
// Read text
const text = await GearShell.fs.readFileText("/opfs/home/notes.md");

// Write text (truncates)
await GearShell.fs.writeFileText("/opfs/home/notes.md", "hello\\n");

// Append: read + write
const current = await GearShell.fs.readFileText("/opfs/home/notes.md")
  .catch(() => "");
await GearShell.fs.writeFileText("/opfs/home/notes.md", current + "more\\n");

// List a directory
for (const { name, isDirectory } of await GearShell.fs.readDir("/opfs/home")) {
  console.log(name, isDirectory);
}

// Check existence without throwing
if ((await GearShell.fs.exists("/opfs/home/notes.md")).exists) { ... }
\`\`\`

## Caveats

- Bytes are \`Uint8Array\` across the bridge (structured-clone). Text
  helpers do the encoder/decoder for you.
- \`exists()\` only swallows ENOENT-class errors. Permission denied and
  other I/O failures still throw — use \`stat()\` if you need to
  distinguish.
- Path sandboxing is delegated to the wanix bind graph. The API itself
  does not add a second ACL.
`],
  ["tasks-agents", "Tasks vs Agents: when to use which", `# Tasks vs Agents: when to use which

GearShell exposes two related concepts that often get conflated:

- **Tasks** (\`GearShell.tasks.*\`) — long-running workspace processes
  that survive across plugin calls.
- **Agents** (\`GearShell.agents.*\`) — a thin layer that drives
  terminals (and, by extension, agents running in those terminals).

## Tasks

A task is a single process. It can be:

- \`term: true\` — runs in a terminal panel (interactive).
- \`term: false\` — runs headless (no panel).
- \`background: true\` — explicitly headless even if \`term\` defaults
  to true.
- \`persist: true\` — survives reloads.

Use \`tasks.create\` to start one. Use \`tasks.list\`, \`tasks.cancel\`,
\`tasks.output\` to manage it.

\`\`\`js
const { id } = GearShell.tasks.create({
  name: "scratch",
  cmd: "while true; do date; sleep 1; done",
  background: true,
});

// later
const { output } = GearShell.tasks.output(id);
GearShell.tasks.cancel(id);
\`\`\`

## Agents

An agent is a *view* of a task — typically a terminal that an LLM or
a human is driving. Use \`agents.list\` to enumerate them,
\`agents.prompt\` to inject text, \`agents.read\` to snapshot the
scrollback, \`agents.interrupt\` to send Ctrl+C.

\`\`\`js
const reply = GearShell.agents.prompt("terminal-1", "npm test\\n");
if (reply.busy) {
  // try again after reply.retryAfterMs
}
\`\`\`

## The connection

When you create a task with \`term: true\`, the shell auto-creates an
agent entry with the same id (prefixed \`task-\` or \`terminal-\`).
\`tasks.create\` and \`agents.list\` both see it.

The \`agents.*\` API is the right surface when you're driving a process
that's already running and you want to read or inject text. The
\`tasks.*\` API is the right surface when you're orchestrating the
process lifecycle.
`],
  ["config-audit", "Config changes, audit, and undo", `# Config changes, audit, and undo

Every write through the \`config.*\` API is recorded in the audit ring
buffer. The audit log lets you inspect who changed what and undo
specific entries.

## The audit shape

\`\`\`js
const { entries } = GearShell.config.audit.list();
entries.forEach((e) => {
  console.log(e.id, e.kind, e.agent);
});
\`\`\`

Each entry has:

| Field | Meaning |
|-------|---------|
| \`id\` | Audit entry id (use this for \`audit.undo\`) |
| \`kind\` | \`"shell"\`, \`"bind"\`, \`"runtime"\`, \`"kv"\`, \`"plugin"\`, \`"provider"\`, \`"model"\`, ... |
| \`agent\` | Plugin id that made the change (\`"shell"\` for shell-originated changes) |
| \`patch\` | The change itself |
| \`snapshot\` | The state before the change (used by \`audit.undo\`) |

## Undo a change

\`\`\`js
GearShell.config.audit.undo("audit-12345");
\`\`\`

The undo restores the \`snapshot\` field as the current state. After an
undo, the page may need a reload for bind/runtime changes to take
effect.

## Clear the ring

\`\`\`js
GearShell.config.audit.clear();
\`\`\`

Useful in plugin UIs that show the audit log and want to give the user
a clean slate.

## Reading via the gear CLI

\`\`\`bash
gear config.audit.list
gear config.audit.undo audit-12345
gear config.audit.clear
\`\`\`
`],
];

for (const [id, title, content] of GUIDES) {
  const out = `---\nid: ${id}\ntitle: ${JSON.stringify(title)}\nkind: guide\n---\n\n${content}\n`;
  await writeDoc(`guides/${id}.md`, out);
}

for (const record of RECORDS) {
  await writeDoc(record.id.replaceAll(".", "/") + ".md", render(record));
}

// Regenerate content/index.json from the record list so the path field
// stays in sync with the on-disk layout. The static file shipped in the
// repo (the hand-written one) is intentionally overwritten here — the
// script is the canonical source of truth for the catalog.
const catalogSections = [
  { id: "root", title: "Root", methods: RECORDS.filter((r) => r.namespace === null && r.kind !== "guide").map(recordToIndex) },
  { id: "hotkeys", title: "Hotkeys", methods: RECORDS.filter((r) => r.namespace === "hotkeys").map(recordToIndex) },
  { id: "config", title: "Config", methods: RECORDS.filter((r) => r.namespace === "config").map(recordToIndex) },
  { id: "panels", title: "Panels", methods: RECORDS.filter((r) => r.namespace === "panels").map(recordToIndex) },
  { id: "browser", title: "Browser", methods: RECORDS.filter((r) => r.namespace === "browser").map(recordToIndex) },
  { id: "files", title: "Files", methods: RECORDS.filter((r) => r.namespace === "files").map(recordToIndex) },
  { id: "tasks", title: "Tasks", methods: RECORDS.filter((r) => r.namespace === "tasks").map(recordToIndex) },
  { id: "agents", title: "Agents", methods: RECORDS.filter((r) => r.namespace === "agents").map(recordToIndex) },
  { id: "music", title: "Music", methods: RECORDS.filter((r) => r.namespace === "music").map(recordToIndex) },
  { id: "terminal", title: "Terminal", methods: RECORDS.filter((r) => r.namespace === "terminal").map(recordToIndex) },
  { id: "vm", title: "VM", methods: RECORDS.filter((r) => r.namespace === "vm").map(recordToIndex) },
  { id: "w9y", title: "W9y", methods: RECORDS.filter((r) => r.namespace === "w9y").map(recordToIndex) },
  { id: "events", title: "Events", methods: RECORDS.filter((r) => r.namespace === "events").map(recordToIndex) },
  { id: "fs", title: "FS", methods: RECORDS.filter((r) => r.namespace === "fs").map(recordToIndex) },
  {
    id: "guides",
    title: "Guides",
    kind: "guides",
    guides: GUIDES.map(([id, title]) => ({ id: `guide-${id.replace("guide-", "")}`, title, path: `guides/${id}.md` })),
  },
];

await writeFile(
  resolve(ROOT, "index.json"),
  JSON.stringify({ sections: catalogSections }, null, 2) + "\n",
  "utf8",
);

function recordToIndex(r) {
  return {
    id: r.id,
    title: r.title,
    path: r.id.replaceAll(".", "/") + ".md",
  };
}

console.log(`Wrote ${RECORDS.length} API docs, ${GUIDES.length} guides, and index.json under plugin/gearshell-docs/content/`);
