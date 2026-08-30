// playground-parts.js — presentational building blocks for the
// GearShell API Playground (Explorer sidebar, arg fields, JSON viewer,
// request history, tab bar). No state beyond what props carry; the
// stateful views live in playground-explorer.js / -providers.js /
// -events-view.js, the panel shell in playground-panel.js
// (500-line rule).

import React from "react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function TabBar({ tabs, active, onSelect }) {
  return html`
    <div className="playground-tabs" role="tablist">
      ${tabs.map(({ id, label }) =>
        html`<button
          key=${id}
          type="button"
          role="tab"
          className=${"playground-tab" + (id === active ? " active" : "")}
          onClick=${() => onSelect(id)}
          aria-selected=${id === active}
        >${label}</button>`,
      )}
    </div>
  `;
}

export function MethodList({ groups, filter, selected, onSelect }) {
  const needle = filter.trim().toLowerCase();
  return html`
    <div className="playground-method-list">
      ${groups.map((group) => {
        const methods = group.methods.filter((method) =>
          !needle ||
          (group.namespace ? `${group.namespace}.${method.name}` : method.name)
            .toLowerCase().includes(needle)
        );
        if (methods.length === 0) return null;
        return html`
          <div key=${group.title} className="playground-method-group">
            <h3 className="playground-method-group-title">${group.title}</h3>
            ${methods.map((method) => {
              const id = group.namespace
                ? `${group.namespace}.${method.name}`
                : method.name;
              return html`<button
                key=${id}
                type="button"
                className=${"playground-method" +
                  (id === selected ? " active" : "")}
                onClick=${() => onSelect(id)}
              >${id}</button>`;
            })}
          </div>
        `;
      })}
    </div>
  `;
}

export function JsonArgField({ arg, value, onChange }) {
  const rows = Math.min(
    8,
    1 + String(value ?? arg.default ?? "").split("\n").length,
  );
  return html`
    <label className="playground-arg">
      <span className="playground-arg-label">${arg.label}</span>
      <textarea
        className="playground-json-input"
        rows=${rows}
        value=${value ?? arg.default ?? ""}
        placeholder=${arg.placeholder}
        spellCheck=${false}
        onChange=${(event) => onChange(arg.key, event.target.value)}
      ></textarea>
    </label>
  `;
}

export function ArgField({ arg, value, onChange }) {
  if (arg.type === "handler") {
    return html`
      <div className="playground-arg playground-arg-handler">
        <span>${arg.label}</span>
        <code className="playground-hint-text">in-page function (no JSON representation)</code>
      </div>
    `;
  }
  if (arg.type === "boolean") {
    return html`
      <label className="playground-arg playground-arg-check">
        <input
          type="checkbox"
          checked=${value === true || value === "true"}
          onChange=${(event) => onChange(arg.key, event.target.checked)}
        />
        <span>${arg.label}</span>
      </label>
    `;
  }
  if (arg.type === "json") {
    return html`<${JsonArgField} arg=${arg} value=${value} onChange=${onChange}/>`;
  }
  return html`
    <label className="playground-arg">
      <span className="playground-arg-label">${arg.label + (arg.optional ? " (optional)" : "")}</span>
      <input
        type=${arg.type === "number" ? "number" : "text"}
        className="playground-text-input"
        value=${value ?? arg.default ?? ""}
        placeholder=${arg.placeholder}
        onChange=${(event) => onChange(arg.key, event.target.value)}
      />
    </label>
  `;
}

// Pretty-print a JSON value; redact nothing here (callers pass already
// redacted data from the API layer).
export function JsonBlock({ data, className }) {
  let text;
  try {
    text = JSON.stringify(data, null, 2);
  } catch {
    text = String(data);
  }
  return html`<pre className=${className || "playground-json"}>${text}</pre>`;
}

export function ResultView({ result }) {
  if (result == null) {
    return html`
      <p className="playground-hint">Run the method to see its JSON result here.</p>
    `;
  }
  const ok = result.ok !== false;
  return html`
    <div className="playground-result">
      <div className=${"playground-result-status " + (ok ? "ok" : "error")}>${ok ? "ok" : "error"}</div>
      <${JsonBlock} data=${result}/>
    </div>
  `;
}

export function HistoryList({ history, onPick }) {
  if (history.length === 0) {
    return html`
      <p className="playground-hint">No calls yet. Run a method and it shows up here.</p>
    `;
  }
  return html`
    <div className="playground-history">
      ${history.map((item, index) => {
        const ok = item.result?.ok !== false;
        return html`
          <button
            key=${`${item.ts}-${index}`}
            type="button"
            className=${"playground-history-row " + (ok ? "ok" : "error")}
            onClick=${() => onPick(item)}
            title=${item.method}
          >
            <span className="playground-history-method">${item.method}</span>
            <span className="playground-history-args">${item.argsJson}</span>
            <span className="playground-history-time">${new Date(item.ts).toLocaleTimeString()}</span>
          </button>
        `;
      })}
    </div>
  `;
}
