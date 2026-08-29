// Settings "Agent activity" section wiring (A1): renders the audit ring
// recorded by config.updateShell and offers per-entry undo. The section
// is lazily mounted with the rest of the Settings panel, so it always
// reads the ring fresh; the AGENT_AUDIT_CHANGED_EVENT listener keeps it
// live while the panel stays open.

import { settingsDep } from "./settings-deps.js?v=20260826.2";
import { AGENT_AUDIT_CHANGED_EVENT } from "./workspace-audit.js?v=20260829.38";

function queryElements(settingsContent) {
  return {
    list: settingsContent.querySelector("[data-agent-activity-list]"),
    status: settingsContent.querySelector('[data-agent-activity="status"]'),
    clearButton: settingsContent.querySelector(
      '[data-agent-activity-action="clear"]',
    ),
  };
}

function formatTime(ts) {
  const date = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
    pad(
      date.getDate(),
    )
  } ${pad(date.getHours())}:${pad(date.getMinutes())}:${
    pad(
      date.getSeconds(),
    )
  }`;
}

function changedKeys(entry) {
  const keys = new Set([
    ...Object.keys(entry.prev || {}),
    ...Object.keys(entry.next || {}),
  ]);
  return [...keys].filter(
    (key) =>
      JSON.stringify(entry.prev?.[key]) !== JSON.stringify(entry.next?.[key]),
  );
}

function renderEntry(entry, undo) {
  const row = document.createElement("div");
  row.className = "agent-activity-entry" + (entry.undone ? " undone" : "");
  const head = document.createElement("div");
  head.className = "agent-activity-head";
  const label = document.createElement("span");
  label.textContent = `${formatTime(entry.ts)} · ${entry.agent}`;
  const keys = document.createElement("span");
  keys.className = "agent-activity-keys";
  keys.textContent = changedKeys(entry).join(", ") || "(no key changes)";
  head.append(label, keys);
  if (!entry.undone) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Undo";
    button.addEventListener("click", () => undo(entry.id));
    head.append(button);
  }
  const body = document.createElement("details");
  body.className = "agent-activity-diff";
  const summary = document.createElement("summary");
  summary.textContent = "before / after";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(entry.prev, null, 2) +
    "\n\n\u2192\n\n" +
    JSON.stringify(entry.next, null, 2);
  body.append(summary, pre);
  row.append(head, body);
  return row;
}

export function setupAgentActivity(settingsContent) {
  const els = queryElements(settingsContent);
  if (!els.list || !els.clearButton || !els.status) return;
  const setStatus = (message, isError = false) => {
    els.status.textContent = message;
    els.status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const undo = (id) => {
    const result = settingsDep("auditUndo")(id);
    if (result.ok) setStatus("Restored the previous config.");
    else setStatus(result.error || "Unable to undo.", true);
    render();
  };
  const render = () => {
    els.list.replaceChildren();
    const all = settingsDep("auditList")();
    if (all.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No agent config changes recorded yet.";
      els.list.append(empty);
      return;
    }
    for (const entry of all) els.list.append(renderEntry(entry, undo));
  };
  els.clearButton.addEventListener("click", () => {
    if (!window.confirm("Clear the agent activity history?")) return;
    settingsDep("auditClear")();
    setStatus("Agent activity history cleared.");
  });
  window.addEventListener(AGENT_AUDIT_CHANGED_EVENT, render);
  render();
  return () => window.removeEventListener(AGENT_AUDIT_CHANGED_EVENT, render);
}
