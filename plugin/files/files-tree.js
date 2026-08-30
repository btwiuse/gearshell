// files-tree.js — the Files panel's hierarchy tree, styled after the
// Windows Explorer / VS Code file explorer: a lazy-loading, expandable
// tree rooted at the filesystem root. The current directory's ancestor
// chain auto-expands and the current node stays highlighted, so the
// panel always shows where the selection sits in the whole tree.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  filesystemPathJoin,
  normalizeFilesystemPath,
} from "../files-path.js";
import { getEntryIcon } from "./files-ui.js";
import htm from "htm";

const html = htm.bind(React.createElement);

export const TREE_ROOT = ".";

// === Tree state (lazy loading + auto-reveal) ===

// Read a directory with a 2s timebox (namespace mirrors can hang, and
// the kernel may still be booting when the panel mounts — getRoot throws
// then), sorting dirs first. Returns a normalized entry list or null.
async function readTreeDir(getRoot, key) {
  const rawNames = await Promise.race([
    getRoot().readDir(key === TREE_ROOT ? "." : key),
    new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
  ]);
  if (rawNames == null) return null;
  return (Array.isArray(rawNames) ? rawNames : []).map((name) => {
    const isDirectory = name.endsWith("/");
    return { name: name.replace(/\/$/, ""), isDirectory };
  }).sort((a, b) =>
    Number(b.isDirectory) - Number(a.isDirectory) ||
    a.name.localeCompare(b.name)
  );
}

// Build the tree's loadChildren callback: reads a directory, stores the
// result, and retries with backoff when the kernel is not ready yet.
function makeTreeLoader({
  getRoot,
  childrenRef,
  inflightRef,
  setLoadingPaths,
  setChildrenMap,
}) {
  const loadChildren = async (dirPath, retryLeft = 20) => {
    const key = normalizeFilesystemPath(dirPath);
    const existing = childrenRef.current.get(key);
    if ((existing && !existing.error) || inflightRef.current.has(key)) return;
    inflightRef.current.add(key);
    setLoadingPaths((prev) => new Set(prev).add(key));
    const finish = () => {
      inflightRef.current.delete(key);
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };
    try {
      const list = await readTreeDir(getRoot, key);
      if (list == null) throw new Error("timed out");
      finish();
      setChildrenMap((prev) => new Map(prev).set(key, { children: list }));
    } catch {
      finish();
      if (retryLeft > 0) {
        // Kernel not ready yet (or a flaky read): retry with backoff so
        // the root/current chain eventually reveals itself.
        setTimeout(() => loadChildren(key, retryLeft - 1), 400);
      } else {
        // Unreadable directories stay collapsed instead of erroring out;
        // the user can retry by expanding again.
        setChildrenMap((prev) =>
          new Map(prev).set(key, {
            children: [],
            error: true,
          })
        );
      }
    }
  };
  return loadChildren;
}

// Reveal the current directory: expand every ancestor (and the target
// itself) and make sure their children are loaded, so the active node
// is always visible somewhere in the tree.
function revealTreePath(path, loadChildren, setExpanded) {
  const parts = normalizeFilesystemPath(path) === TREE_ROOT
    ? []
    : normalizeFilesystemPath(path).split("/");
  let acc = TREE_ROOT;
  const chain = [];
  for (const part of parts) {
    acc = acc === TREE_ROOT ? part : `${acc}/${part}`;
    chain.push(acc);
  }
  if (chain.length === 0) return;
  setExpanded((prev) => {
    const next = new Set(prev);
    let changed = false;
    for (const p of chain) {
      if (!next.has(p)) {
        next.add(p);
        changed = true;
      }
    }
    return changed ? next : prev;
  });
  chain.forEach((p) => loadChildren(p));
}

export function useFilesTree({ getRoot, path }) {
  // Set of expanded directory paths (normalized, "." = root).
  const [expanded, setExpanded] = useState(() => new Set([TREE_ROOT]));
  // Map path -> { children } once read; keeps errors out of the UI.
  const [childrenMap, setChildrenMap] = useState(() => new Map());
  // Set of paths whose readDir is currently in flight (twistie spinner).
  const [loadingPaths, setLoadingPaths] = useState(() => new Set());

  // Mirrors so async callbacks never see stale state.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const childrenRef = useRef(childrenMap);
  childrenRef.current = childrenMap;
  const inflightRef = useRef(new Set());

  const loadChildren = useCallback(
    makeTreeLoader({
      getRoot,
      childrenRef,
      inflightRef,
      setLoadingPaths,
      setChildrenMap,
    }),
    [getRoot],
  );

  const toggleDir = useCallback((dirPath) => {
    const key = normalizeFilesystemPath(dirPath);
    if (!expandedRef.current.has(key)) loadChildren(key);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [loadChildren]);

  useEffect(() => {
    loadChildren(TREE_ROOT);
    revealTreePath(path, loadChildren, setExpanded);
  }, [path, loadChildren]);

  return { expanded, childrenMap, loadingPaths, toggleDir };
}

// === Tree rendering ===

function treeNodeHandlers({
  isDir,
  isCurrent,
  finePointer,
  node,
  onToggle,
  onOpen,
  onSelect,
  onContextMenu,
}) {
  return {
    onClick: () => {
      if (isDir) {
        // Explorer behavior: a click on an already-open (current) folder
        // toggles it closed instead of re-navigating, so the right-pane
        // preview never refreshes for a no-op navigation.
        if (isCurrent) onToggle(node.path);
        else onOpen(node);
      } else if (finePointer) onSelect(node);
      else onOpen(node);
    },
    onDoubleClick: isDir || !finePointer ? undefined : () => onOpen(node),
    onContextMenu: onContextMenu
      ? (event) => {
        event.preventDefault();
        onContextMenu(node, event.clientX, event.clientY);
      }
      : undefined,
  };
}

function renderTwistie({ isDir, isLoading, isExpanded, node, onToggle }) {
  return html`
    <button
      type="button"
      className="files-tree-twistie"
      aria-label=${isDir
        ? `${isExpanded ? "Collapse" : "Expand"} ${node.name}`
        : undefined}
      tabIndex=${isDir ? 0 : -1}
      onClick=${(event) => {
        if (!isDir) return;
        event.stopPropagation();
        onToggle(node.path);
      }}
    >
      ${isDir
        ? isLoading
          ? html`<${Loader2} size=${12} className="files-spinning" aria-hidden=${true}/>`
          : html`<${ChevronRight} size=${12} className=${isExpanded ? "open" : ""} aria-hidden=${true}/>`
        : null}
    </button>
  `;
}

function nodeRowClass(node, isCurrent, isSelected) {
  return [
    "files-tree-node",
    node.isDirectory ? "dir" : "",
    isCurrent ? "current" : "",
    isSelected ? "selected" : "",
  ].filter(Boolean).join(" ");
}

function renderTreeChildren(
  {
    children,
    nodePath,
    depth,
    path,
    selectedPath,
    finePointer,
    tree,
    onToggle,
    onOpen,
    onSelect,
    onContextMenu,
  },
) {
  return children.map((child) =>
    html`<${TreeNode}
      key=${child.name}
      node=${{ ...child, path: filesystemPathJoin(nodePath, child.name) }}
      depth=${depth + 1}
      path=${path}
      selectedPath=${selectedPath}
      finePointer=${finePointer}
      tree=${tree}
      onToggle=${onToggle}
      onOpen=${onOpen}
      onSelect=${onSelect}
      onContextMenu=${onContextMenu}
    />`,
  );
}

function renderTreeNodeRow({
  node,
  isDir,
  isExpanded,
  isCurrent,
  isSelected,
  isLoading,
  depth,
  Icon,
  finePointer,
  onToggle,
  onOpen,
  onSelect,
  onContextMenu,
}) {
  return html`
    <div
      role="treeitem"
      aria-expanded=${isDir ? isExpanded : undefined}
      aria-selected=${isSelected || undefined}
      className=${nodeRowClass(node, isCurrent, isSelected)}
      style=${{ "--tree-depth": depth }}
      title=${isDir ? `${node.name}/` : node.name}
      ...${treeNodeHandlers({
        isDir,
        isCurrent,
        finePointer,
        node,
        onToggle,
        onOpen,
        onSelect,
        onContextMenu,
      })}
    >
      ${renderTwistie({ isDir, isLoading, isExpanded, node, onToggle })}
      <${Icon} size=${15} aria-hidden=${true}/>
      <span className="files-tree-label">${node.name}</span>
    </div>
  `;
}

function TreeNode({
  node,
  depth,
  path,
  selectedPath,
  finePointer,
  tree,
  onToggle,
  onOpen,
  onSelect,
  onContextMenu,
}) {
  const nodePath = normalizeFilesystemPath(node.path);
  const isDir = node.isDirectory;
  const isExpanded = tree.expanded.has(nodePath);
  const isLoading = tree.loadingPaths.has(nodePath);
  const isCurrent = path === nodePath;
  const isSelected = selectedPath != null &&
    normalizeFilesystemPath(selectedPath) === nodePath;
  const Icon = getEntryIcon(node.name, isDir, node.iconKind);
  const children = isDir && isExpanded && !isLoading
    ? (tree.childrenMap.get(nodePath)?.children || [])
    : [];
  return html`
    <${React.Fragment}>
      ${renderTreeNodeRow({
        node,
        isDir,
        isExpanded,
        isCurrent,
        isSelected,
        isLoading,
        depth,
        Icon,
        finePointer,
        onToggle,
        onOpen,
        onSelect,
        onContextMenu,
      })}
      ${renderTreeChildren({
        children,
        nodePath,
        depth,
        path,
        selectedPath,
        finePointer,
        tree,
        onToggle,
        onOpen,
        onSelect,
        onContextMenu,
      })}
    </${React.Fragment}>
  `;
}

export function FilesTree({
  tree,
  path,
  selectedPath,
  finePointer,
  onToggle,
  onOpen,
  onSelect,
  onContextMenu,
}) {
  const treeRef = useRef(null);
  // Reveal the active node: after navigation (favorites, volumes,
  // breadcrumb, topbar input) the tree expands the ancestor chain, but
  // the target may sit above or below the visible area. Scroll it into
  // view once its children have rendered; "nearest" keeps the current
  // position unless the node is actually off-screen.
  useEffect(() => {
    const id = setTimeout(() => {
      treeRef.current?.querySelector(".files-tree-node.current")
        ?.scrollIntoView({ block: "nearest" });
    }, 0);
    return () => clearTimeout(id);
  }, [path, tree.childrenMap, tree.expanded]);

  const rootChildren = tree.childrenMap.get(TREE_ROOT)?.children;
  if (!rootChildren) {
    return html`
      <div className="files-tree">
        <p className="files-tree-loading">Loading…</p>
      </div>
    `;
  }
  return html`
    <div ref=${treeRef} className="files-tree" role="tree">
      ${rootChildren.map((child) =>
        html`<${TreeNode}
          key=${child.name}
          node=${{ ...child, path: child.name }}
          depth=${0}
          path=${path}
          selectedPath=${selectedPath}
          finePointer=${finePointer}
          tree=${tree}
          onToggle=${onToggle}
          onOpen=${onOpen}
          onSelect=${onSelect}
          onContextMenu=${onContextMenu}
        />`,
      )}
    </div>
  `;
}
