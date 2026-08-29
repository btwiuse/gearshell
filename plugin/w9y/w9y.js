// w9y.js — the Packages (w9y) management panel.
//
// Renders the w9y install registry (the in-memory mirror of
// wanix/w9y-registry.json, owned by the w9y CLI) with install/remove/
// re-apply actions and a declared-version comparison: plugin manifests
// declare w9y dependencies (w9y: { mod, version }), so a package whose
// installed version differs from a declaration is flagged for update.
// Every write is fire-and-forget through the w9y API; results arrive as
// w9y.changed events, which refresh the list.

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpCircle,
  Boxes,
  Check,
  CloudDownload,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

// Curated install catalog (the full manifest list lives on w9y.io; the
// free-form name input covers anything not listed here).
const KNOWN_MODS = [
  { id: "bbtex", version: "v2.0.12", note: "63 Bubble Tea examples" },
  { id: "gear", version: null, note: "GearShell workspace CLI" },
  { id: "crush", version: null, note: "Crush agent runtime" },
  { id: "w9y", version: null, note: "w9y itself" },
  { id: "hush", version: null, note: "hush shell" },
  { id: "git", version: null, note: "git" },
  { id: "gitfs", version: null, note: "git as a file system" },
  { id: "vim", version: null, note: "vim" },
  { id: "go4js", version: null, note: "Go toolchain for the browser" },
  { id: "tar", version: null, note: "tar" },
];

// Versions plugin manifests declare via w9y deps (for the update hint).
function declaredDeps() {
  try {
    const plugins = window.GearShell?.config?.getShell?.()?.plugins || [];
    const deps = {};
    for (const plugin of plugins) {
      const dep = plugin?.w9y;
      if (dep && typeof dep.mod === "string" && dep.mod) {
        deps[dep.mod] = dep.version || null;
      }
    }
    return deps;
  } catch {
    return {};
  }
}

function useW9yState() {
  const [packages, setPackages] = useState([]);
  const [notice, setNotice] = useState(null); // {kind:"ok"|"error", text}
  const [installing, setInstalling] = useState(null); // mod id being applied
  const installingRef = useRef(null);
  const setBusy = (id) => {
    installingRef.current = id;
    setInstalling(id);
  };
  const clearBusy = () => {
    installingRef.current = null;
    setInstalling(null);
  };
  const refresh = () => {
    try {
      const result = window.GearShell?.w9y?.list?.();
      setPackages(result?.ok ? result.packages || [] : []);
    } catch (error) {
      setNotice({ kind: "error", text: error?.message || String(error) });
    }
  };
  useEffect(() => {
    refresh();
    const unsubscribe = window.GearShell?.events?.on?.("w9y.changed", (payload) => {
      const event = payload || {};
      if (event.id && installingRef.current === event.id) {
        clearBusy();
        setNotice(
          event.ok
            ? {
              kind: "ok",
              text: `${event.id} ${event.op === "remove" ? "removed" : "installed"}${event.version ? " " + event.version : ""}.`,
            }
            : {
              kind: "error",
              text: `${event.op} ${event.id} failed: ${event.error || "unknown error"}.`,
            },
        );
      }
      refresh();
    });
    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    packages,
    notice,
    setNotice,
    installing,
    setBusy,
    clearBusy,
    refresh,
  };
}

function W9yNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const ok = notice.kind === "ok";
  return React.createElement(
    "div",
    {
      className: "w9y-notice " + (ok ? "ok" : "error"),
      role: "status",
      onClick: onDismiss,
    },
    ok
      ? React.createElement(Check, { size: 14, "aria-hidden": true })
      : React.createElement(TriangleAlert, { size: 14, "aria-hidden": true }),
    React.createElement("span", null, notice.text),
  );
}

function W9yHeader({ count, onRefresh }) {
  return React.createElement(
    "div",
    { className: "w9y-header" },
    React.createElement(
      "div",
      { className: "w9y-header-title" },
      React.createElement(Boxes, { size: 18, "aria-hidden": true }),
      React.createElement("h2", null, "Packages"),
      React.createElement(
        "span",
        { className: "w9y-header-note" },
        `${count} installed · registry: wanix/w9y-registry.json`,
      ),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "w9y-btn",
        title: "Re-read the registry file",
        onClick: onRefresh,
      },
      React.createElement(RefreshCw, { size: 14, "aria-hidden": true }),
      "Refresh",
    ),
  );
}

// The install row: free-form "name[@version]" plus quick-install chips.
function W9yInstallBar({ onInstall, installing }) {
  const [spec, setSpec] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const trimmed = spec.trim();
    if (!trimmed) return;
    onInstall(trimmed);
    setSpec("");
  };
  const quick = (mod) =>
    onInstall(mod.version ? `${mod.id}@${mod.version}` : mod.id);
  return React.createElement(
    "div",
    { className: "w9y-install" },
    React.createElement(
      "form",
      { className: "w9y-install-form", onSubmit: submit },
      React.createElement(
        "input",
        {
          className: "w9y-install-input",
          placeholder: "mod[@version]  e.g. bbtex@v2.0.12",
          value: spec,
          onChange: (event) => setSpec(event.target.value),
        },
      ),
      React.createElement(
        "button",
        {
          type: "submit",
          className: "w9y-btn primary",
          disabled: installing !== null,
        },
        React.createElement(CloudDownload, { size: 14, "aria-hidden": true }),
        installing !== null ? `Installing ${installing}…` : "Install",
      ),
    ),
    React.createElement(
      "div",
      { className: "w9y-known" },
      KNOWN_MODS.map((mod) =>
        React.createElement(
          "button",
          {
            key: mod.id,
            type: "button",
            className: "w9y-chip",
            title: mod.note,
            disabled: installing !== null,
            onClick: () => quick(mod),
          },
          mod.id,
        )
      ),
    ),
  );
}

function W9yDeclaredHint({ id, installed, declared }) {
  if (!declared) return null;
  if (declared === installed) {
    return React.createElement(
      "span",
      { className: "w9y-declared ok", title: "Matches a plugin declaration" },
      React.createElement(Check, { size: 11, "aria-hidden": true }),
      "declared ",
      declared,
    );
  }
  return React.createElement(
    "span",
    {
      className: "w9y-declared stale",
      title: "Installed version differs from a plugin declaration",
    },
    React.createElement(TriangleAlert, { size: 11, "aria-hidden": true }),
    "declared ",
    declared,
    " · update available",
  );
}

function W9yPackageRow({ pkg, declared, onRemove, onReapply, busy }) {
  const installedAt = pkg.installedAt
    ? new Date(pkg.installedAt).toLocaleString()
    : "unknown";
  return React.createElement(
    "div",
    { className: "w9y-row" },
    React.createElement(
      "div",
      { className: "w9y-row-main" },
      React.createElement(
        "div",
        { className: "w9y-row-name" },
        React.createElement("strong", null, pkg.id),
        React.createElement("span", { className: "w9y-version" }, pkg.version || "latest"),
      ),
      React.createElement(
        "div",
        { className: "w9y-row-meta" },
        `${pkg.entryCount} entries · installed ${installedAt}`,
      ),
      React.createElement(W9yDeclaredHint, {
        id: pkg.id,
        installed: pkg.version,
        declared: declared[pkg.id] || null,
      }),
    ),
    React.createElement(
      "div",
      { className: "w9y-row-actions" },
      React.createElement(
        "button",
        {
          type: "button",
          className: "w9y-btn",
          title: "Re-apply (refresh to the declared version)",
          disabled: busy,
          onClick: () => onReapply(pkg.id, declared[pkg.id] || null),
        },
        React.createElement(ArrowUpCircle, { size: 14, "aria-hidden": true }),
        "Re-apply",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "w9y-btn danger",
          title: "Remove files + registry record",
          disabled: busy,
          onClick: () => onRemove(pkg.id),
        },
        React.createElement(Trash2, { size: 14, "aria-hidden": true }),
        "Remove",
      ),
    ),
  );
}

function W9yEmpty() {
  return React.createElement(
    "div",
    { className: "w9y-empty" },
    React.createElement(Boxes, { size: 28, "aria-hidden": true }),
    React.createElement("p", null, "No w9y packages installed."),
    React.createElement("p", null, "Install one from the field above — binaries land in /opfs/wanix and every task reads them through the /opfs projection."),
  );
}

export function W9yPackages() {
  const state = useW9yState();
  const declared = declaredDeps();
  const busy = state.installing !== null;
  const flash = (result, okText) => {
    state.setNotice(
      result?.ok
        ? { kind: "ok", text: okText }
        : { kind: "error", text: result?.error || "Failed." },
    );
  };
  const install = (spec) => {
    const at = spec.indexOf("@");
    const name = (at > 0 ? spec.slice(0, at) : spec).trim();
    const version = at > 0 ? spec.slice(at + 1).trim() : undefined;
    if (!name) return;
    state.setBusy(name);
    try {
      const result = window.GearShell.w9y.apply(name, version);
      flash(result, `${name} apply started.`);
    } catch (error) {
      flash({ error: error?.message || String(error) });
      state.clearBusy();
    }
  };
  const remove = (id) => {
    if (!window.confirm(`Remove w9y package "${id}" (files + registry record)?`)) {
      return;
    }
    state.setBusy(id);
    try {
      const result = window.GearShell.w9y.remove(id);
      flash(result, `${id} remove started.`);
    } catch (error) {
      flash({ error: error?.message || String(error) });
      state.clearBusy();
    }
  };
  const reapply = (id, version) => {
    state.setBusy(id);
    try {
      const result = window.GearShell.w9y.apply(id, version);
      flash(result, `${id} re-apply started.`);
    } catch (error) {
      flash({ error: error?.message || String(error) });
      state.clearBusy();
    }
  };
  return React.createElement(
    "div",
    { className: "w9y-page" },
    React.createElement(W9yHeader, {
      count: state.packages.length,
      onRefresh: state.refresh,
    }),
    React.createElement(W9yNotice, {
      notice: state.notice,
      onDismiss: () => state.setNotice(null),
    }),
    React.createElement(W9yInstallBar, { onInstall: install, installing: state.installing }),
    React.createElement(
      "div",
      { className: "w9y-list" },
      state.packages.map((pkg) =>
        React.createElement(W9yPackageRow, {
          key: pkg.id,
          pkg,
          declared,
          busy,
          onRemove: remove,
          onReapply: reapply,
        })
      ),
    ),
    state.packages.length === 0
      ? React.createElement(W9yEmpty, null)
      : null,
  );
}
