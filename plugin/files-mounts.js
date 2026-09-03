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
// The panel hands in stable accessors (getKernel, getRoot) and UI
// callbacks (status text, path navigation, directory refresh); the hook
// owns mount lifecycle: restore on kernel-ready, pick/bind, unmount,
// and reconnect after the user re-grants a lost permission.
//
// **Why not `GearShell.fs.*` for mount lifecycle?** The mount flow
// runs `window.showDirectoryPicker` (which must run inside a real
// user gesture on the top-level document) and then calls
// `kernel._setupNamespace(...)` to insert the bind into the wanix
// namespace. Rerouting this through `GearShell.fs.requestLocalDir` etc.
// — even though those wrappers do exist in `workspace-fs-api.js` — was
// tried in round 53 and empirically did not work from the in-page Files
// panel: the picker came up but the resulting bind never showed up in
// the kernel, and the panel was left in an inconsistent state. Until
// that is diagnosed (see memory/files-panel.md "Mount-chain API
// attempt + rollback"), the panel calls the kernel directly here. The
// same `fs.*` mount methods stay in the public API for non-Files callers
// (playground catalog, future agents) and may be revisited later.

async function restoreStoredMounts(ctx) {
  const { getKernel, setMounts } = ctx;
  const stored = await loadStoredMounts();
  const kernel = getKernel();
  const next = [];
  for (const mount of stored) {
    let granted = false;
    if (typeof mount.handle?.queryPermission === "function") {
      granted = (await mount.handle.queryPermission({
        mode: mount.mode || "readwrite",
      })) === "granted";
    } else {
      granted = Boolean(mount.handle);
    }
    if (granted && kernel?.isReady) {
      try {
        await bindLocalDir(mount.handle, mount.dst, getKernel);
        next.push({ ...mount, mounted: true });
        continue;
      } catch (err) {
        console.error("restore mount", mount.dst, err);
      }
    }
    next.push({ ...mount, mounted: false });
  }
  setMounts(next);
}

async function handleMountLocalDir(ctx) {
  const {
    getKernel,
    setMounts,
    onStatus,
    onNavigate,
    onRefresh,
  } = ctx;
  if (typeof window.showDirectoryPicker !== "function") {
    onStatus("File System Access API is not supported in this browser.");
    return;
  }
  try {
    const id = `gear-mount-${Date.now().toString(36)}-${
      Math.random().toString(36).slice(2, 7)
    }`;
    const handle = await window.showDirectoryPicker({
      mode: "readwrite",
      id,
    });
    const name = sanitizeMountName(handle.name);
    const stored = await loadStoredMounts();
    const used = new Set(stored.map((m) => m.dst));
    let dst = `mnt/${name}`;
    for (let i = 2; used.has(dst); i++) dst = `mnt/${name}-${i}`;
    await bindLocalDir(handle, dst, getKernel);
    const mount = { id, name, dst, mode: "readwrite", handle, mounted: true };
    await storeMount(mount);
    setMounts((prev) => [...prev, mount]);
    onStatus(`Mounted local directory "${name}" at /${dst}`);
    onNavigate(dst);
    onRefresh();
  } catch (err) {
    if (err?.name === "AbortError") return; // user dismissed the picker
    console.error("mount local directory:", err);
    onStatus(`Mount failed: ${err?.message || err}`);
  }
}

async function unmountLocalDir(ctx, mount) {
  const {
    getRoot,
    setMounts,
    currentPath,
    parentPath,
    onNavigate,
    onRefresh,
    onStatus,
  } = ctx;
  try {
    if (mount.mounted) await getRoot().unbind(mount.dst, mount.dst);
    await removeStoredMount(mount.id);
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
  const {
    getKernel,
    setMounts,
    onStatus,
    onNavigate,
    onRefresh,
  } = ctx;
  if (typeof window.showDirectoryPicker !== "function") {
    onStatus("File System Access API is not supported in this browser.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({
      mode: mount.mode || "readwrite",
      id: mount.id,
    });
    const name = sanitizeMountName(handle.name);
    await bindLocalDir(handle, mount.dst, getKernel);
    const updated = { ...mount, name, handle, mounted: true };
    await storeMount(updated);
    setMounts((prev) => prev.map((m) => (m.id === mount.id ? updated : m)));
    onStatus(`Reconnected local directory "${name}".`);
    onNavigate(mount.dst);
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
    [ctx.getKernel],
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
