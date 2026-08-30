// Settings "Agent activity" section wiring (A1): renders the audit ring
// recorded by config.updateShell and offers per-entry undo. The section
// is lazily mounted with the rest of the Settings panel, so it always
// reads the ring fresh; the AGENT_AUDIT_CHANGED_EVENT listener keeps it
// live while the panel stays open.

import { settingsDep } from "./settings-deps.js?v=20260826.3";
import { AGENT_AUDIT_CHANGED_EVENT } from "../../workspace-audit.js?v=20260829.143";
import { html } from "../../dom-html.js?v=20260830.4";

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
  const button = entry.undone ? null : html`<button
    type="button"
    onclick=${() => undo(entry.id)}
  >Undo</button>`;
  return html`<div
    className=${"agent-activity-entry" + (entry.undone ? " undone" : "")}
  >
    <div className="agent-activity-head">
      <span>${`${formatTime(entry.ts)} · ${entry.agent}`}</span>
      <span className="agent-activity-keys">${
        changedKeys(entry).join(", ") || "(no key changes)"
      }</span>
      ${button}
    </div>
    <details className="agent-activity-diff">
      <summary>before / after</summary>
      <pre>${
        JSON.stringify(entry.prev, null, 2) +
        "\n\n→\n\n" +
        JSON.stringify(entry.next, null, 2)
      }</pre>
    </details>
  </div>`;
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
      els.list.append(
        html`<p className="hint">No agent config changes recorded yet.</p>`,
      );
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
