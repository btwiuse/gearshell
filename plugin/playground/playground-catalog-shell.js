// playground-catalog-shell.js — the lightweight shell-control namespaces
// for the Playground Explorer (root constants, hotkeys, w9y), plus
// the spreads that compose the larger namespaces from their
// per-domain files.
//
// shellCatalog is the data-only slice that defines the catalog rows
// for the methods the GearShell surface exposes in the shell context.
// The larger `config.*` namespace (hundreds of lines of method schemas:
// shell, binds, runtime, audit, kv, providers, models, workspaces,
// presets, binds.filament) lives in playground-catalog-shell-config.js;
// the panel-opening namespaces (panels, browser, files, fs) live in
// playground-catalog-shell-panels.js. Both are re-exported here so
// the importer in playground-api-catalog.js keeps one entry point.

import { configCatalog } from "./playground-catalog-shell-config.js";
import { panelsCatalog } from "./playground-catalog-shell-panels.js";

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
        args: [{ key: "spec", label: "Spec", type: "json", default: "{}" }],
        hint: "Register a hotkey via {id, combo, action} spec.",
      },
      {
        name: "unregister",
        args: [{ key: "id", label: "Hotkey id", type: "string" }],
        hint: "Remove a hotkey by id.",
      },
    ],
  },
  {
    namespace: "w9y",
    title: "W9y",
    methods: [
      { name: "list", args: [], hint: "List installed w9y mods." },
      {
        name: "status",
        args: [{ key: "id", label: "Package id", type: "string" }],
        hint: "Status of a single installed mod.",
      },
      {
        name: "refresh",
        args: [],
        hint: "Re-read the w9y registry from disk.",
      },
      {
        name: "apply",
        args: [
          { key: "id", label: "Package id", type: "string" },
          { key: "version", label: "Version", type: "string", optional: true },
        ],
        hint: "Start installing a w9y package.",
      },
      { name: "remove", args: [{ key: "id", label: "Package id", type: "string" }], hint: "Start removing a w9y package." },
    ],
  },
  ...configCatalog,
  ...panelsCatalog,
];