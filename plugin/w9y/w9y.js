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
import htm from "htm";
import {
  ArrowUpCircle,
  Boxes,
  Check,
  CloudDownload,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

const html = htm.bind(React.createElement);

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

// Build the w9y.changed listener: when the finishing op matches the mod we
// started, clear the busy state and surface the outcome notice.
function makeW9yChangeHandler(installingRef, clearBusy, setNotice, refresh) {
  return (payload) => {
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
  };
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
    const unsubscribe = window.GearShell?.events?.on?.(
      "w9y.changed",
      makeW9yChangeHandler(installingRef, clearBusy, setNotice, refresh),
    );
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
  return html`
    <div className="w9y-notice ${ok ? "ok" : "error"}" role="status" onClick=${onDismiss}>
      ${ok
        ? html`<${Check} size=${14} aria-hidden=${true}/>`
        : html`<${TriangleAlert} size=${14} aria-hidden=${true}/>`}
      <span>${notice.text}</span>
    </div>
  `;
}

function W9yHeader({ count, onRefresh }) {
  return html`
    <div className="w9y-header">
      <div className="w9y-header-title">
        <${Boxes} size=${18} aria-hidden=${true}/>
        <h2>Packages</h2>
        <span className="w9y-header-note">${count} installed · registry: wanix/w9y-registry.json</span>
      </div>
      <button type="button" className="w9y-btn" title="Re-read the registry file" onClick=${onRefresh}>
        <${RefreshCw} size=${14} aria-hidden=${true}/>Refresh
      </button>
    </div>
  `;
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
  return html`
    <div className="w9y-install">
      <form className="w9y-install-form" onSubmit=${submit}>
        <input
          className="w9y-install-input"
          placeholder="mod[@version]  e.g. bbtex@v2.0.12"
          value=${spec}
          onChange=${(event) => setSpec(event.target.value)}
        />
        <button type="submit" className="w9y-btn primary" disabled=${installing !== null}>
          <${CloudDownload} size=${14} aria-hidden=${true}/>${installing !== null ? `Installing ${installing}…` : "Install"}
        </button>
      </form>
      <div className="w9y-known">
        ${KNOWN_MODS.map((mod) =>
          html`<button
            key=${mod.id}
            type="button"
            className="w9y-chip"
            title=${mod.note}
            disabled=${installing !== null}
            onClick=${() => quick(mod)}
          >${mod.id}</button>`,
        )}
      </div>
    </div>
  `;
}

function W9yDeclaredHint({ id, installed, declared }) {
  if (!declared) return null;
  if (declared === installed) {
    return html`
      <span className="w9y-declared ok" title="Matches a plugin declaration">
        <${Check} size=${11} aria-hidden=${true}/>declared ${declared}
      </span>
    `;
  }
  return html`
    <span className="w9y-declared stale" title="Installed version differs from a plugin declaration">
      <${TriangleAlert} size=${11} aria-hidden=${true}/>declared ${declared} · update available
    </span>
  `;
}

function W9yPackageRow({ pkg, declared, onRemove, onReapply, busy }) {
  const installedAt = pkg.installedAt
    ? new Date(pkg.installedAt).toLocaleString()
    : "unknown";
  return html`
    <div className="w9y-row">
      <div className="w9y-row-main">
        <div className="w9y-row-name">
          <strong>${pkg.id}</strong>
          <span className="w9y-version">${pkg.version || "latest"}</span>
        </div>
        <div className="w9y-row-meta">${pkg.entryCount} entries · installed ${installedAt}</div>
        <${W9yDeclaredHint} id=${pkg.id} installed=${pkg.version} declared=${declared[pkg.id] || null}/>
      </div>
      <div className="w9y-row-actions">
        <button
          type="button"
          className="w9y-btn"
          title="Re-apply (refresh to the declared version)"
          disabled=${busy}
          onClick=${() => onReapply(pkg.id, declared[pkg.id] || null)}
        >
          <${ArrowUpCircle} size=${14} aria-hidden=${true}/>Re-apply
        </button>
        <button
          type="button"
          className="w9y-btn danger"
          title="Remove files + registry record"
          disabled=${busy}
          onClick=${() => onRemove(pkg.id)}
        >
          <${Trash2} size=${14} aria-hidden=${true}/>Remove
        </button>
      </div>
    </div>
  `;
}

function W9yEmpty() {
  return html`
    <div className="w9y-empty">
      <${Boxes} size=${28} aria-hidden=${true}/>
      <p>No w9y packages installed.</p>
      <p>Install one from the field above — binaries land in /opfs/wanix and every task reads them through the /opfs projection.</p>
    </div>
  `;
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
  // Every action shares the same setBusy -> call -> flash/clearBusy shape.
  const runAction = (name, call, okText) => {
    state.setBusy(name);
    try {
      flash(call(), okText);
    } catch (error) {
      flash({ error: error?.message || String(error) });
      state.clearBusy();
    }
  };
  const install = (spec) => {
    const at = spec.indexOf("@");
    const name = (at > 0 ? spec.slice(0, at) : spec).trim();
    const version = at > 0 ? spec.slice(at + 1).trim() : undefined;
    if (!name) return;
    runAction(name, () => window.GearShell.w9y.apply(name, version), `${name} apply started.`);
  };
  const remove = (id) => {
    if (!window.confirm(`Remove w9y package "${id}" (files + registry record)?`)) {
      return;
    }
    runAction(id, () => window.GearShell.w9y.remove(id), `${id} remove started.`);
  };
  const reapply = (id, version) => {
    runAction(id, () => window.GearShell.w9y.apply(id, version), `${id} re-apply started.`);
  };
  return html`
    <div className="w9y-page">
      <${W9yHeader} count=${state.packages.length} onRefresh=${state.refresh}/>
      <${W9yNotice} notice=${state.notice} onDismiss=${() => state.setNotice(null)}/>
      <${W9yInstallBar} onInstall=${install} installing=${state.installing}/>
      <div className="w9y-list">
        ${state.packages.map((pkg) =>
          html`<${W9yPackageRow} key=${pkg.id} pkg=${pkg} declared=${declared} busy=${busy} onRemove=${remove} onReapply=${reapply}/>`,
        )}
      </div>
      ${state.packages.length === 0 ? html`<${W9yEmpty}/>` : null}
    </div>
  `;
}
