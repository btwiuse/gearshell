// playground-explorer.js — the Explorer tab of the GearShell API
// Playground: a searchable method catalog on the left, a generated
// argument form + Run / copy-gear / JSON result on the right, and a
// per-method request log. All calls go through window.GearShell — the
// same synchronous bridge the gear CLI wraps — so what you exercise
// here is exactly what an agent can call.
//
// The method catalog (playground-api-catalog.js) is pure data; this
// module only holds the Explorer's local state (useExplorerState) and
// the presentational split of the detail pane (50-line rule).

import React, { useState } from "react";
import {
  buildMethodArgs,
  findCatalogMethod,
  gearInvocation,
  PLAYGROUND_CATALOG,
  serializeArgs,
} from "./playground-api-catalog.js?v=20260829.17";
import {
  ArgField,
  HistoryList,
  MethodList,
  ResultView,
} from "./playground-parts.js?v=20260829.15";

// Resolve a dotted method name (config.providers.save) against a
// namespace (config) inside the GearShell api object.
function resolveApiPath(root, namespace, dottedName) {
  let target = namespace ? root[namespace] : root;
  for (const segment of dottedName.split(".")) {
    target = target?.[segment];
  }
  return target;
}

// Invoke a cataloged method on window.GearShell (safe()-wrapped in the
// api object, so thrown errors come back as {ok:false}; a second
// try/catch here guards the catalog itself).
export function callApiEntry(group, method, args) {
  const root = window.GearShell;
  if (!root) return { ok: false, error: "window.GearShell is not ready" };
  const target = resolveApiPath(root, group.namespace, method.name);
  if (typeof target !== "function") {
    return {
      ok: false,
      error: `GearShell.${
        group.namespace ? `${group.namespace}.${method.name}` : method.name
      } is not a function`,
    };
  }
  try {
    return target(...args);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function apiReady() {
  return typeof window.GearShell === "object" && window.GearShell !== null;
}

// Build + parse the positional args for a method; returns the error
// message instead of throwing so the UI can show it inline.
function parseRunArgs(method, values) {
  try {
    return { ok: true, args: buildMethodArgs(method, values) };
  } catch (error) {
    const message = `Invalid JSON: ${error?.message || error}`;
    return { ok: false, message };
  }
}

// The gear CLI line equivalent of the current form values.
function gearLineFor(group, method, values) {
  return gearInvocation(group, method, serializeArgs(method, values));
}

// Run a method against window.GearShell and push the outcome into the
// response/history/notice state (extracted so the hook stays under the
// 50-line budget).
function pushRunResult({
  method,
  group,
  selectedId,
  values,
  setResponse,
  setNotice,
  setHistory,
}) {
  const parsed = parseRunArgs(method, values[selectedId]);
  if (!parsed.ok) {
    setNotice(parsed.message);
    setResponse({ ok: false, error: parsed.message });
    return;
  }
  const result = method.kind === "value"
    ? {
      ok: true,
      value: resolveApiPath(window.GearShell, group.namespace, method.name),
    }
    : callApiEntry(group, method, parsed.args);
  let argsJson = "[]";
  try {
    argsJson = serializeArgs(method, values[selectedId]);
  } catch {
    argsJson = JSON.stringify(parsed.args); // display fallback
  }
  setHistory((prev) =>
    [{
      ts: Date.now(),
      method: selectedId,
      argsJson,
      result,
    }, ...prev].slice(0, 100)
  );
  setResponse(result);
  setNotice("");
}

function copyGctlLine({ group, method, selectedId, values, setNotice }) {
  if (!method) return;
  try {
    const line = gearLineFor(group, method, values[selectedId]);
    navigator.clipboard?.writeText(line);
    setNotice(`Copied: ${line}`);
  } catch (error) {
    setNotice(`Invalid JSON: ${error?.message || error}`);
  }
}

function pickHistoryItem(item, setSelectedId, setResponse, setNotice) {
  setSelectedId(item.method);
  setResponse(item.result);
  setNotice("");
}

function selectMethod(id, setSelectedId, setResponse, setNotice) {
  setSelectedId(id);
  setResponse(null);
  setNotice("");
}

// The Explorer's callbacks, kept outside the hook so useExplorerState
// stays under the 50-line budget.
function makeExplorerActions({
  method,
  group,
  selectedId,
  values,
  setValues,
  setSelectedId,
  setResponse,
  setHistory,
  setNotice,
}) {
  const setArg = (key, raw) => {
    setValues((prev) => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] || {}), [key]: raw },
    }));
  };
  const run = () =>
    pushRunResult({
      method,
      group,
      selectedId,
      values,
      setResponse,
      setNotice,
      setHistory,
    });
  const copyGctl = () =>
    copyGctlLine({ group, method, selectedId, values, setNotice });
  const pickHistory = (item) =>
    pickHistoryItem(item, setSelectedId, setResponse, setNotice);
  const select = (id) =>
    selectMethod(id, setSelectedId, setResponse, setNotice);
  return { setArg, run, copyGctl, pickHistory, select };
}

function useExplorerState() {
  const [selectedId, setSelectedId] = useState("panels.list");
  const [filter, setFilter] = useState("");
  const [values, setValues] = useState({}); // { [methodId]: { [argKey]: raw } }
  const [response, setResponse] = useState(null);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState("");

  const entry = findCatalogMethod(selectedId);
  const method = entry?.method ?? null;
  const group = entry?.group ?? null;

  const actions = makeExplorerActions({
    method,
    group,
    selectedId,
    values,
    setValues,
    setSelectedId,
    setResponse,
    setHistory,
    setNotice,
  });

  return {
    selectedId,
    select: actions.select,
    filter,
    setFilter,
    method,
    group,
    argValues: method ? values[selectedId] || {} : {},
    setArg: actions.setArg,
    run: actions.run,
    copyGctl: actions.copyGctl,
    notice,
    response,
    history,
    pickHistory: actions.pickHistory,
  };
}

function ExplorerSidebar({ filter, setFilter, selected, onSelect }) {
  return React.createElement(
    "aside",
    { className: "playground-sidebar" },
    React.createElement("input", {
      type: "search",
      className: "playground-search",
      placeholder: "Filter methods…",
      value: filter,
      onChange: (event) => setFilter(event.target.value),
    }),
    React.createElement(MethodList, {
      groups: PLAYGROUND_CATALOG,
      filter,
      selected,
      onSelect,
    }),
  );
}

function DetailHeader({ id, hint }) {
  return React.createElement(
    "header",
    { className: "playground-detail-head" },
    React.createElement("h3", null, `GearShell.${id}`),
    hint &&
      React.createElement("p", { className: "playground-hint" }, hint),
  );
}

function DetailArgs({ args, values, onChange }) {
  return React.createElement(
    "div",
    { className: "playground-args" },
    args.map((arg) =>
      React.createElement(ArgField, {
        key: arg.key,
        arg,
        value: values[arg.key],
        onChange,
      })
    ),
    args.length === 0 &&
      React.createElement(
        "p",
        { className: "playground-hint" },
        "No arguments.",
      ),
  );
}

function DetailActions({ onRun, onCopy }) {
  return React.createElement(
    "div",
    { className: "playground-actions" },
    React.createElement(
      "button",
      { type: "button", className: "playground-run", onClick: onRun },
      "Run",
    ),
    React.createElement(
      "button",
      { type: "button", className: "playground-copy", onClick: onCopy },
      "Copy gear line",
    ),
  );
}

function ExplorerDetail({ state }) {
  const { method } = state;
  return React.createElement(
    "section",
    { className: "playground-detail" },
    !apiReady() &&
      React.createElement(
        "div",
        { className: "playground-banner" },
        "window.GearShell is not ready yet — the workspace API boots with the shell.",
      ),
    method
      ? React.createElement(
        React.Fragment,
        null,
        React.createElement(DetailHeader, {
          id: state.selectedId,
          hint: method.hint,
        }),
        React.createElement(DetailArgs, {
          args: method.args,
          values: state.argValues,
          onChange: state.setArg,
        }),
        React.createElement(DetailActions, {
          onRun: state.run,
          onCopy: state.copyGctl,
        }),
        state.notice &&
          React.createElement(
            "p",
            { className: "playground-notice" },
            state.notice,
          ),
        React.createElement(ResultView, { result: state.response }),
        React.createElement(
          "h4",
          { className: "playground-section-title" },
          "Request log",
        ),
        React.createElement(HistoryList, {
          history: state.history,
          onPick: state.pickHistory,
        }),
      )
      : React.createElement(
        "p",
        { className: "playground-hint" },
        "Pick a method from the catalog.",
      ),
  );
}

export function ExplorerView() {
  const state = useExplorerState();
  return React.createElement(
    "div",
    { className: "playground-explorer" },
    React.createElement(ExplorerSidebar, {
      filter: state.filter,
      setFilter: state.setFilter,
      selected: state.selectedId,
      onSelect: state.select,
    }),
    React.createElement(ExplorerDetail, { state }),
  );
}
