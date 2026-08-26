// files-mounts.js — local directory mounting (File System Access API)
// for the Files panel: IndexedDB-persisted FileSystemDirectoryHandles,
// silently re-bound on boot via queryPermission, shown as a macOS-style
// Volumes list. Extracted from files.js to keep every module under the
// 500-line rule; files.js owns the panel, this module owns the mounts.
import React, { useCallback, useRef, useState } from "react";
import { Disc3, FolderInput, X } from "lucide-react";

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
// The panel hands in stable accessors (getKernel / getRoot) and UI
// callbacks (status text, path navigation, directory refresh); the hook
// owns mount lifecycle: restore on kernel-ready, pick/bind, unmount,
// and reconnect after the user re-grants a lost permission.

export function useLocalDirMounts(
  {
    getKernel,
    getRoot,
    currentPath,
    parentPath,
    onStatus,
    onNavigate,
    onRefresh,
  },
) {
  const [mounts, setMounts] = useState([]);
  const restoredMountsRef = useRef(new Set());

  const restoreMounts = useCallback(async () => {
    const stored = await loadStoredMounts();
    const kernel = getKernel();
    const next = [];
    for (const mount of stored) {
      if (restoredMountsRef.current.has(mount.id)) {
        next.push(mount);
        continue;
      }
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
          restoredMountsRef.current.add(mount.id);
          next.push({ ...mount, mounted: true });
          continue;
        } catch (err) {
          console.error("restore mount", mount.dst, err);
        }
      }
      next.push({ ...mount, mounted: false });
    }
    setMounts(next);
  }, [getKernel]);

  const handleMountLocalDir = async () => {
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
      const used = new Set(mounts.map((m) => m.dst));
      let dst = `mnt/${name}`;
      for (let i = 2; used.has(dst); i++) dst = `mnt/${name}-${i}`;
      await bindLocalDir(handle, dst, getKernel);
      const mount = { id, name, dst, mode: "readwrite", handle, mounted: true };
      await storeMount(mount);
      restoredMountsRef.current.add(id);
      setMounts((prev) => [...prev, mount]);
      onStatus(`Mounted local directory "${name}" at /${dst}`);
      onNavigate(dst);
      onRefresh();
    } catch (err) {
      if (err?.name === "AbortError") return; // user dismissed the picker
      console.error("mount local directory:", err);
      onStatus(`Mount failed: ${err?.message || err}`);
    }
  };

  const unmountLocalDir = async (mount) => {
    try {
      if (mount.mounted) await getRoot().unbind(mount.dst, mount.dst);
      await removeStoredMount(mount.id);
      restoredMountsRef.current.delete(mount.id);
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
  };

  const reconnectLocalDir = async (mount) => {
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
      restoredMountsRef.current.add(mount.id);
      setMounts((prev) => prev.map((m) => (m.id === mount.id ? updated : m)));
      onStatus(`Reconnected local directory "${name}".`);
      onNavigate(mount.dst);
      onRefresh();
    } catch (err) {
      if (err?.name === "AbortError") return;
      onStatus(`Reconnect failed: ${err?.message || err}`);
    }
  };

  const openMount = (mount) => {
    if (!mount.mounted) {
      reconnectLocalDir(mount);
      return;
    }
    onNavigate(mount.dst);
  };

  return {
    mounts,
    restoreMounts,
    handleMountLocalDir,
    unmountLocalDir,
    openMount,
  };
}

// --- Volumes sidebar (macOS-style mount list) ---

export function VolumesSidebar({ mounts, onMount, onOpen, onUnmount }) {
  return React.createElement(
    "div",
    { className: "files-volumes" },
    React.createElement(
      "div",
      { className: "files-volumes-header" },
      React.createElement(
        "span",
        { className: "files-volumes-title" },
        "Volumes",
      ),
      React.createElement("button", {
        type: "button",
        title: "Mount local directory",
        "aria-label": "Mount local directory",
        onClick: onMount,
      }, React.createElement(FolderInput, { size: 13, "aria-hidden": true })),
    ),
    mounts.length === 0
      ? React.createElement(
        "p",
        { className: "files-volumes-empty" },
        "No mounted volumes.",
      )
      : React.createElement(
        "div",
        { className: "files-volumes-list" },
        mounts.map((mount) =>
          React.createElement(
            "div",
            {
              key: mount.id,
              className: `files-volume${
                mount.mounted ? "" : " files-volume-off"
              }`,
            },
            React.createElement(
              "button",
              {
                type: "button",
                className: "files-volume-name",
                title: mount.mounted
                  ? `Open /${mount.dst}`
                  : "Directory not accessible, click to reconnect",
                onClick: () => onOpen(mount),
              },
              React.createElement(Disc3, { size: 14, "aria-hidden": true }),
              React.createElement("span", null, mount.name),
            ),
            React.createElement("button", {
              type: "button",
              className: "files-volume-eject",
              title: mount.mounted ? "Unmount" : "Remove",
              "aria-label": `Unmount ${mount.name}`,
              onClick: () => onUnmount(mount),
            }, React.createElement(X, { size: 12, "aria-hidden": true })),
          )
        ),
      ),
  );
}
