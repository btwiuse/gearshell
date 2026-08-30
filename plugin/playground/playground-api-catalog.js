// playground-api-catalog.js — the exhaustive GearShell API catalog that
// powers the Playground panel's Explorer tab.
//
// The catalog mirrors gear-bind.js's method list 1:1: every bridged
// method of window.GearShell, with a per-argument schema (type, default,
// placeholder), a run hint, and the equivalent gear invocation. The
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

import { shellCatalog } from "./playground-catalog-shell.js";
import { agentCatalog } from "./playground-catalog-agent.js";

// The full catalog is composed from the two data halves
// (playground-catalog-shell.js / playground-catalog-agent.js).
export const PLAYGROUND_CATALOG = [...shellCatalog, ...agentCatalog];


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

// The gear CLI line equivalent of a call (for the copy button).
export function gearInvocation(group, method, argsJson) {
  const path = group.namespace
    ? `${group.namespace}.${method.name}`
    : method.name;
  return argsJson === "[]" ? `gear ${path}` : `gear ${path} '${argsJson}'`;
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

// Serialized args array for display + the gear copy button. Same parse
// rules as buildMethodArgs; throws on malformed JSON.
export function serializeArgs(method, values) {
  const built = method.args.map((arg) => {
    if (arg.type === "handler") return "[handler]";
    return buildArgValue(arg, values?.[arg.key]);
  });
  return JSON.stringify(built);
}
