// playground-parts.js — presentational building blocks for the
// GearShell API Playground (Explorer sidebar, arg fields, JSON viewer,
// request history, tab bar). No state beyond what props carry; the
// stateful views live in playground-explorer.js / -providers.js /
// -events-view.js, the panel shell in playground-panel.js
// (500-line rule).

import React from "react";

export function TabBar({ tabs, active, onSelect }) {
  return React.createElement(
    "div",
    { className: "playground-tabs", role: "tablist" },
    tabs.map(({ id, label }) =>
      React.createElement(
        "button",
        {
          key: id,
          type: "button",
          role: "tab",
          className: "playground-tab" + (id === active ? " active" : ""),
          onClick: () => onSelect(id),
          "aria-selected": id === active,
        },
        label,
      )
    ),
  );
}

export function MethodList({ groups, filter, selected, onSelect }) {
  const needle = filter.trim().toLowerCase();
  return React.createElement(
    "div",
    { className: "playground-method-list" },
    groups.map((group) => {
      const methods = group.methods.filter((method) =>
        !needle ||
        (group.namespace ? `${group.namespace}.${method.name}` : method.name)
          .toLowerCase().includes(needle)
      );
      if (methods.length === 0) return null;
      return React.createElement(
        "div",
        { key: group.title, className: "playground-method-group" },
        React.createElement(
          "h3",
          { className: "playground-method-group-title" },
          group.title,
        ),
        methods.map((method) => {
          const id = group.namespace
            ? `${group.namespace}.${method.name}`
            : method.name;
          return React.createElement(
            "button",
            {
              key: id,
              type: "button",
              className: "playground-method" +
                (id === selected ? " active" : ""),
              onClick: () => onSelect(id),
            },
            id,
          );
        }),
      );
    }),
  );
}

export function JsonArgField({ arg, value, onChange }) {
  const rows = Math.min(
    8,
    1 + String(value ?? arg.default ?? "").split("\n").length,
  );
  return React.createElement(
    "label",
    { className: "playground-arg" },
    React.createElement(
      "span",
      { className: "playground-arg-label" },
      arg.label,
    ),
    React.createElement("textarea", {
      className: "playground-json-input",
      rows,
      value: value ?? arg.default ?? "",
      placeholder: arg.placeholder,
      spellCheck: false,
      onChange: (event) => onChange(arg.key, event.target.value),
    }),
  );
}

export function ArgField({ arg, value, onChange }) {
  if (arg.type === "handler") {
    return React.createElement(
      "div",
      { className: "playground-arg playground-arg-handler" },
      React.createElement("span", null, arg.label),
      React.createElement(
        "code",
        { className: "playground-hint-text" },
        "in-page function (no JSON representation)",
      ),
    );
  }
  if (arg.type === "boolean") {
    return React.createElement(
      "label",
      { className: "playground-arg playground-arg-check" },
      React.createElement("input", {
        type: "checkbox",
        checked: value === true || value === "true",
        onChange: (event) => onChange(arg.key, event.target.checked),
      }),
      React.createElement("span", null, arg.label),
    );
  }
  if (arg.type === "json") {
    return React.createElement(JsonArgField, { arg, value, onChange });
  }
  return React.createElement(
    "label",
    { className: "playground-arg" },
    React.createElement(
      "span",
      { className: "playground-arg-label" },
      arg.label + (arg.optional ? " (optional)" : ""),
    ),
    React.createElement("input", {
      type: arg.type === "number" ? "number" : "text",
      className: "playground-text-input",
      value: value ?? arg.default ?? "",
      placeholder: arg.placeholder,
      onChange: (event) => onChange(arg.key, event.target.value),
    }),
  );
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
  return React.createElement("pre", {
    className: className || "playground-json",
  }, text);
}

export function ResultView({ result }) {
  if (result == null) {
    return React.createElement(
      "p",
      { className: "playground-hint" },
      "Run the method to see its JSON result here.",
    );
  }
  const ok = result.ok !== false;
  return React.createElement(
    "div",
    { className: "playground-result" },
    React.createElement(
      "div",
      {
        className: "playground-result-status " +
          (ok ? "ok" : "error"),
      },
      ok ? "ok" : "error",
    ),
    React.createElement(JsonBlock, { data: result }),
  );
}

export function HistoryList({ history, onPick }) {
  if (history.length === 0) {
    return React.createElement(
      "p",
      { className: "playground-hint" },
      "No calls yet. Run a method and it shows up here.",
    );
  }
  return React.createElement(
    "div",
    { className: "playground-history" },
    history.map((item, index) => {
      const ok = item.result?.ok !== false;
      return React.createElement(
        "button",
        {
          key: `${item.ts}-${index}`,
          type: "button",
          className: "playground-history-row " + (ok ? "ok" : "error"),
          onClick: () => onPick(item),
          title: item.method,
        },
        React.createElement(
          "span",
          { className: "playground-history-method" },
          item.method,
        ),
        React.createElement(
          "span",
          { className: "playground-history-args" },
          item.argsJson,
        ),
        React.createElement(
          "span",
          { className: "playground-history-time" },
          new Date(item.ts).toLocaleTimeString(),
        ),
      );
    }),
  );
}
