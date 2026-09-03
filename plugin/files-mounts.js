// files-mounts.js — local directory mounting (File System Access API)
// for the Files panel: IndexedDB-persisted FileSystemDirectoryHandles,
// silently re-bound on boot via queryPermission, shown as a macOS-style
// Volumes list. Extracted from files.js to keep every module under the
// 500-line rule; files.js owns the panel, this module owns the mounts.
import React, { useCallback, useState } from "react";
import { ChevronRight, Disc3, FolderInput, X } from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);

// --- IndexedDB persistence + wanix kernel bridge ---

const MOUNTS_DB = "gearshell-mounts";
const MOUNTS_STORE = "mounts";
let mntDirReady = false;

export function sanitizeMountName(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  );
  return cleaned || "mounted";
}

function openMountsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MOUNTS_DB, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(MOUNTS_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequestDone(req) {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function loadStoredMounts() {
  try {
    const db = await openMountsDB();
    const tx = db.transaction(MOUNTS_STORE, "readonly");
    const all = await idbRequestDone(tx.objectStore(MOUNTS_STORE).getAll());
    db.close();
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export async function storeMount(mount) {
  try {
    const db = await openMountsDB();
    const tx = db.transaction(MOUNTS_STORE, "readwrite");
    tx.objectStore(MOUNTS_STORE).put(mount);
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch (err) {
    console.error("storeMount:", err);
  }
}

export async function removeStoredMount(id) {
  try {
    const db = await openMountsDB();
    const tx = db.transaction(MOUNTS_STORE, "readwrite");
    tx.objectStore(MOUNTS_STORE).delete(id);
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch (err) {
    console.error("removeStoredMount:", err);
  }
}

// Bind a FileSystemDirectoryHandle into the root namespace at `dst`.
// The picker must run inside a user gesture, so mounting starts from a
// button, not at boot; restoreMounts() re-binds persisted handles with a
// silent queryPermission check. Binds the /mnt parent (fresh memfs per
// page load) once per session.
export async function bindLocalDir(handle, dst, getKernel) {
  const kernel = getKernel();
  if (!kernel) throw new Error("wanix kernel is not ready");
  const binds = [];
  if (!mntDirReady) {
    binds.push({ type: "ns", dst: "mnt", src: "#ramfs/new" });
    mntDirReady = true;
  }
  binds.push({ type: "localdir", dst, data: Promise.resolve(handle) });
  await kernel._setupNamespace("1", "", binds);
}

// --- React state for the Files panel ---
//
// The panel hands in UI callbacks (status text, path navigation,
// directory refresh); the hook owns the local mount list, restore
// tracking, and dispatches mount lifecycle through `GearShell.fs.*`.
//
// Every kernel/picker call is now concentrated in workspace-fs-api:
//   `fs.requestLocalDir()`     picker + bind + IDB persist
//   `fs.reconnect(id)`         re-picker + bind for a single mount
//   `fs.restoreMounts()`       boot-time silent re-bind
//   `fs.unmount(id)`           unbind + IDB drop
//   `fs.remount(id)`           silent queryPermission + rebind
//
// This module is now a UI shim: state, list rendering, and the
// dispatch over the GearShell API surface. The Files panel does not
// need a kernel handle.

async function restoreStoredMounts(ctx) {
  const { setMounts } = ctx;
  try {
    const result = await window.GearShell?.fs?.restoreMounts?.();
    if (result && Array.isArray(result.mounts)) {
      // restoreMounts returns metadata only (no handles). Re-read the
      // IDB-backed store so the panel can keep the full record set in
      // local state (the volume list shows handle-backed fields like
      // mounted/permission).
      const stored = await loadStoredMounts();
      const live = new Map(stored.map((m) => [m.id, m]));
      setMounts(
        result.mounts.map((m) => {
          const full = live.get(m.id);
          return full ? { ...full, mounted: m.mounted } : { ...m };
        }),
      );
      return;
    }
  } catch (err) {
    console.error("restoreMounts:", err);
  }
  setMounts(await loadStoredMounts());
}

async function handleMountLocalDir(ctx) {
  const { setMounts, onStatus, onNavigate, onRefresh } = ctx;
  try {
    const result = await window.GearShell?.fs?.requestLocalDir?.();
    if (!result || !result.mount) {
      onStatus("File System Access API is not supported in this browser.");
      return;
    }
    // Pull the freshly-stored record so the local list has the full
    // handle-backed entry (requestLocalDir returns metadata only).
    const stored = await loadStoredMounts();
    const fresh = stored.find((m) => m.id === result.mount.id);
    if (fresh) setMounts((prev) => [...prev, fresh]);
    onStatus(`Mounted local directory "${result.mount.name}" at /${result.mount.dst}`);
    onNavigate(result.mount.dst);
    onRefresh();
  } catch (err) {
    if (err?.name === "AbortError") return; // user dismissed the picker
    console.error("mount local directory:", err);
    onStatus(`Mount failed: ${err?.message || err}`);
  }
}

async function unmountLocalDir(ctx, mount) {
  const {
    setMounts,
    currentPath,
    parentPath,
    onNavigate,
    onRefresh,
    onStatus,
  } = ctx;
  try {
    // Delegate the wanix unbind + IDB drop to GearShell.fs.unmount so
    // the bind graph is the only source of truth for what is mounted.
    await window.GearShell?.fs?.unmount?.(mount.id);
    setMounts((prev) => prev.filter((m) => m.id !== mount.id));
    if (
      currentPath === mount.dst || currentPath.startsWith(`${mount.dst}/`)
    ) {
      onNavigate(
        parentPath(mount.dst) === "." ? "mnt" : parentPath(mount.dst),
      );
    }
    onRefresh();
    onStatus(`Unmounted "${mount.name}".`);
  } catch (err) {
    onStatus(`Unmount failed: ${err?.message || err}`);
  }
}

async function reconnectLocalDir(ctx, mount) {
  const { setMounts, onStatus, onNavigate, onRefresh } = ctx;
  try {
    const result = await window.GearShell?.fs?.reconnect?.(mount.id);
    if (!result || !result.mount) {
      onStatus("File System Access API is not supported in this browser.");
      return;
    }
    const stored = await loadStoredMounts();
    const fresh = stored.find((m) => m.id === mount.id);
    if (fresh) {
      setMounts((prev) =>
        prev.map((m) => (m.id === mount.id ? fresh : m))
      );
    }
    onStatus(`Reconnected local directory "${result.mount.name}".`);
    onNavigate(result.mount.dst);
    onRefresh();
  } catch (err) {
    if (err?.name === "AbortError") return;
    onStatus(`Reconnect failed: ${err?.message || err}`);
  }
}

export function useLocalDirMounts(props) {
  const [mounts, setMounts] = useState([]);
  const ctx = { ...props, mounts, setMounts };
  const restoreMounts = useCallback(
    () => restoreStoredMounts(ctx),
    // The hook only ever calls into GearShell.fs.* which is process-global;
    // deps on the UI callbacks keep the restoration aligned with the
    // latest status/navigate/refresh setters the panel supplies.
    [ctx.onStatus, ctx.onNavigate, ctx.onRefresh],
  );
  const openMount = (mount) => {
    if (!mount.mounted) {
      reconnectLocalDir(ctx, mount);
      return;
    }
    ctx.onNavigate(mount.dst);
  };
  return {
    mounts,
    restoreMounts,
    handleMountLocalDir: () => handleMountLocalDir(ctx),
    unmountLocalDir: (mount) => unmountLocalDir(ctx, mount),
    openMount,
  };
}

// --- Volumes sidebar (macOS-style mount list) ---

function renderVolumesHeader({ collapsed, onToggle, onMount }) {
  return html`
    <div className="files-volumes-header">
      <button
        type="button"
        className="files-sidebar-toggle files-section-header"
        onClick=${onToggle}
        aria-expanded=${!collapsed}
        title=${collapsed ? "Expand Volumes" : "Collapse Volumes"}
      >
        <${ChevronRight} size=${13} className=${collapsed ? "" : "open"} aria-hidden=${true}/>
        <span className="files-volumes-title">Volumes</span>
      </button>
      <button
        type="button"
        title="Mount local directory"
        aria-label="Mount local directory"
        onClick=${onMount}
      >
        <${FolderInput} size=${13} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

function renderVolumeRow(mount, onOpen, onUnmount) {
  return html`
    <div
      key=${mount.id}
      className=${`files-volume${mount.mounted ? "" : " files-volume-off"}`}
    >
      <button
        type="button"
        className="files-volume-name"
        title=${mount.mounted
          ? `Open /${mount.dst}`
          : "Directory not accessible, click to reconnect"}
        onClick=${() => onOpen(mount)}
      >
        <${Disc3} size=${14} aria-hidden=${true}/>
        <span>${mount.name}</span>
      </button>
      <button
        type="button"
        className="files-volume-eject"
        title=${mount.mounted ? "Unmount" : "Remove"}
        aria-label=${`Unmount ${mount.name}`}
        onClick=${() => onUnmount(mount)}
      >
        <${X} size=${12} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

export function VolumesSidebar({
  mounts,
  onMount,
  onOpen,
  onUnmount,
  collapsed = false,
  onToggle,
}) {
  return html`
    <div className="files-section">
      ${renderVolumesHeader({ collapsed, onToggle, onMount })}
      ${!collapsed &&
        (mounts.length === 0
          ? html`<p className="files-volumes-empty">No mounted volumes.</p>`
          : html`
              <div className="files-volumes-list">
                ${mounts.map((mount) => renderVolumeRow(mount, onOpen, onUnmount))}
              </div>
            `)}
    </div>
  `;
}
