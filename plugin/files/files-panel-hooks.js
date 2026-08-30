// files-panel-hooks.js — state, effects and filesystem operations behind
// the Files panel, split out of files.js so every function stays under the
// 50-line rule and every file under the 500-line rule. Components live in
// files-panel-sections.js; files.js only wires them together.

import { useCallback, useEffect, useState } from "react";

import {
  enrichEntryStats,
  filesystemPathJoin,
  filesystemPathParent,
  normalizeFilesystemPath,
} from "../files-path.js";
import {
  sniffWasmBytes,
  useFilesActions,
} from "./files-editor.js";
import { useFilesContextMenu } from "./files-context-menu.js";
import { useLocalDirMounts } from "../files-mounts.js";
import { filesDep } from "./files-registry.js";

async function sniffWasmEntries(getRoot, path, entries) {
  // Extension-less files are often WebAssembly binaries in this sandbox;
  // sniff the \0asm header so they get the right icon. Bounded: namespace
  // mirrors like js/ can hold hundreds of entries whose reads hang, so cap
  // the sniff count and timebox each read.
  const SNIFF_LIMIT = 12;
  const SNIFF_TIMEOUT_MS = 400;
  let sniffed = 0;
  await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory || entry.name.includes(".")) return;
    if (sniffed >= SNIFF_LIMIT) return;
    sniffed++;
    try {
      const data = await Promise.race([
        getRoot().readFile(filesystemPathJoin(path, entry.name)),
        new Promise((resolve) =>
          setTimeout(() => resolve(null), SNIFF_TIMEOUT_MS)
        ),
      ]);
      if (data && sniffWasmBytes(data)) entry.iconKind = "wasm";
    } catch {
      // leave the generic icon if the file cannot be read
    }
  }));
}

// Every files-panel UI field as a [value, setter] pair, one line each.
function useFilesPanelFields() {
  return {
    path: useState("."),
    pathDraft: useState("/"),
    entries: useState([]),
    highlighted: useState(null),
    renameTarget: useState(null),
    creating: useState(null),
    entryName: useState(""),
    status: useState(""),
    loading: useState(false),
    viewMode: useState("grid"),
    sort: useState({ by: "name", desc: false }),
    columnWidths: useState({ size: 80, mtime: 164 }),
    sidebarCollapsed: useState({
      explorer: false,
      favorites: false,
      volumes: false,
    }),
    finePointer: useState(() =>
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ),
  };
}

// Shape the field pairs into the panel context object ({ path, setPath,
// ... }): value under the field name, setter under the camelCased
// set<Field> name.
function useFilesPanelState() {
  const fields = useFilesPanelFields();
  const out = {};
  for (const key of Object.keys(fields)) {
    const [value, setter] = fields[key];
    out[key] = value;
    if (setter) {
      out["set" + key[0].toUpperCase() + key.slice(1)] = setter;
    }
  }
  return out;
}

function useFilesMediaLayout() {
  const [stackedLayout, setStackedLayout] = useState(() =>
    window.matchMedia("(max-width: 560px)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const updateLayout = () => setStackedLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);
  return { stackedLayout, setStackedLayout };
}

function useFilesRefresh({ getRoot, path, setEntries, setStatus, setLoading }) {
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const names = await getRoot().readDir(path);
      const next = (Array.isArray(names) ? names : []).map((entry) => {
        const isDirectory = entry.endsWith("/");
        return { name: entry.replace(/\/$/, ""), isDirectory };
      }).sort((a, b) =>
        Number(b.isDirectory) - Number(a.isDirectory) ||
        a.name.localeCompare(b.name)
      );
      await sniffWasmEntries(getRoot, path, next);
      // Stat the listing (bounded: the wasm mirrors hold hundreds of
      // entries and large directory reads are the same hang risk) so
      // the info pane can sort by size / modified time.
      if (next.length <= 50) {
        await enrichEntryStats(getRoot, path, next, { timeoutMs: 250 });
      }
      setEntries(next);
      setStatus("");
    } catch (error) {
      setEntries([]);
      setStatus(error.message || "Unable to read this directory.");
    } finally {
      setLoading(false);
    }
  }, [path, getRoot, setEntries, setStatus, setLoading]);
  return refresh;
}

function useFilesNavigation({
  path,
  setPath,
  setHighlighted,
  setEntries,
  clearFileSelection,
  setSelectedInfo,
}) {
  const navigateTo = (nextPath) => {
    // Canonicalize first: favorites and volumes pass absolute paths
    // ("/tmp/d29"), while tree/breadcrumb use relative ones ("tmp/d29").
    // Storing the raw value left a leading slash that never matched the
    // tree's normalized node paths, so the current node lost its
    // highlight. Re-clicking the folder you are already in is a no-op
    // (favorites, volumes, breadcrumb): keep the right-pane preview
    // instead of re-navigating and flashing "Empty folder." while it
    // reloads.
    const target = normalizeFilesystemPath(nextPath);
    if (target === normalizeFilesystemPath(path)) return;
    setPath(target);
    clearFileSelection();
    setHighlighted(null);
    setSelectedInfo(null);
    // Drop the previous listing so the right-pane grid cannot flash
    // stale entries while the new directory is loading.
    setEntries([]);
  };
  const navigateToPath = (pathDraft) => {
    navigateTo(normalizeFilesystemPath(pathDraft));
  };
  return { navigateTo, navigateToPath };
}

function useFilesOpenEntry(
  { openEntry, navigateTo, setSelectedInfo, setStatus },
) {
  return async (entry, currentPath) => {
    const result = await openEntry(entry, currentPath);
    if (result.isDirectory) {
      navigateTo(result.path);
      return;
    }
    setSelectedInfo(null);
    setStatus(result.error || "");
  };
}

function useFilesPanelContextMenu({
  getRoot,
  setStatus,
  path,
  openEditorEntry,
  navigateTo,
  refresh,
  clearFileSelection,
  selectedPath,
  setCreating,
  setEntryName,
  setRenameTarget,
}) {
  return useFilesContextMenu({
    getRoot,
    setStatus,
    openEntry: (entry) => openEditorEntry(entry, path),
    navigateTo,
    refresh,
    clearFileSelection,
    selectedPath,
    beginCreateIn: (entry, kind) => {
      setCreating(kind);
      setEntryName("");
      navigateTo(entry.path);
    },
    beginRename: (entry) => {
      setRenameTarget(entry);
      setCreating("rename-entry");
      setEntryName(entry.name);
    },
  });
}

function useFilesPanelMounts(
  { getKernel, getRoot, path, setStatus, navigateTo, refresh },
) {
  return useLocalDirMounts({
    getKernel,
    getRoot,
    currentPath: path,
    parentPath: filesystemPathParent,
    onStatus: setStatus,
    onNavigate: navigateTo,
    onRefresh: refresh,
  });
}

function useFilesPanelActions({
  getRoot,
  path,
  selectedPath,
  renameTarget,
  creating,
  entryName,
  setCreating,
  setEntryName,
  setSelectedPath,
  setPath,
  setStatus,
  refresh,
  navigateTo,
  openEditorEntry,
  saveFile,
  removeFile,
  fileInputRef,
}) {
  return useFilesActions({
    getRoot,
    path,
    selectedPath,
    renameTarget,
    creating,
    entryName,
    setCreating,
    setEntryName,
    setSelectedPath,
    setPath,
    setStatus,
    refresh,
    navigateTo,
    openEditorEntry,
    saveFile,
    removeFile,
    fileInputRef,
  });
}

function useFilesPanelEffects({
  refresh,
  restoreMounts,
  path,
  setPathDraft,
  setHighlighted,
  setContextMenu,
}) {
  useEffect(() => {
    refresh();
    const retry = () => {
      refresh();
      restoreMounts();
    };
    const system = filesDep("wanixSystem");
    if (system?._kernel?.isReady) {
      restoreMounts();
    } else {
      system?.addEventListener("ready", retry);
    }
    return () => system?.removeEventListener("ready", retry);
  }, [refresh, restoreMounts]);

  useEffect(() => {
    setPathDraft(path === "." ? "/" : `/${path.replace(/^\/+/, "")}`);
    setHighlighted(null);
    setContextMenu(null);
  }, [path, setPathDraft, setHighlighted, setContextMenu]);
}

export {
  sniffWasmEntries,
  useFilesMediaLayout,
  useFilesNavigation,
  useFilesOpenEntry,
  useFilesPanelActions,
  useFilesPanelContextMenu,
  useFilesPanelEffects,
  useFilesPanelMounts,
  useFilesPanelState,
  useFilesRefresh,
};
