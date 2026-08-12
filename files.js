// Files: the Files panel — a tree-view file browser over the Wanix
// filesystem, with a built-in text/image/audio/PDF editor.
//
// This module owns the `files` dockview panel end-to-end. The
// filesystem helpers (path normalization, byte conversion, preview
// type detection) are all local to this module so the panel logic
// and its data-shape handling travel together.
//
// Dependency-injection shim: app.js calls `initFiles(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `filesDep(name)`. The
// only app.js globals FilesPanel touches directly are the wanix
// system element (so the panel can subscribe to its `ready` event)
// and the wanix filesystem root accessor.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, ArrowUp, Check, Download, FileCode2, FilePlus2,
  FolderOpen, FolderPlus, Pencil, RefreshCw, Save, Trash2, Upload,
} from 'lucide-react';

let __filesDeps = null;
export function initFiles(dependencies) {
  __filesDeps = dependencies;
}
function filesDep(name) {
  if (__filesDeps == null) {
    throw new Error('files: initFiles() has not been called; ensure app.js wires it in.');
  }
  const value = __filesDeps[name];
  if (value === undefined) {
    throw new Error(`files: missing dependency ${name}`);
  }
  return value;
}

// === Filesystem helpers ===
// Path normalization + byte conversion + preview-type detection for
// the Files panel. Each is a small standalone function that the
// panel calls per-file/per-path. They are not used outside this
// module.

function normalizeFilesystemPath(path = '.') {
  const parts = [];
  for (const part of String(path).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/') || '.';
}

function filesystemPathJoin(base, name) {
  return normalizeFilesystemPath(base === '.' ? name : `${base}/${name}`);
}

function filesystemPathParent(path) {
  const parts = normalizeFilesystemPath(path).split('/').filter((part) => part && part !== '.');
  parts.pop();
  return parts.join('/') || '.';
}

const FILE_PREVIEW_TYPES = {
  image: {
    mime: (name) => {
      const lower = name.toLowerCase();
      if (lower.endsWith('.png') || lower.endsWith('.gif')) return 'image/png';
      if (lower.endsWith('.webp')) return 'image/webp';
      return 'image/jpeg';
    },
    kind: 'image',
  },
  video: {
    mime: (name) => 'video/mp4',
    kind: 'video',
  },
  audio: {
    mime: (name) => 'audio/mpeg',
    kind: 'audio',
  },
  pdf: {
    mime: 'application/pdf',
    kind: 'pdf',
  },
};

function getFilesystemPreviewType(path) {
  const lower = path.toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return FILE_PREVIEW_TYPES.image;
  if (/\.(mp4|webm)$/.test(lower)) return FILE_PREVIEW_TYPES.video;
  if (/\.(mp3|wav|ogg)$/.test(lower)) return FILE_PREVIEW_TYPES.audio;
  if (lower.endsWith('.pdf')) return FILE_PREVIEW_TYPES.pdf;
  return null;
}

function toFilesystemBytes(contents) {
  if (contents instanceof Uint8Array) return contents;
  if (ArrayBuffer.isView(contents)) return new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength);
  return new Uint8Array(contents);
}

function decodeFilesystemText(contents) {
  const bytes = toFilesystemBytes(contents);
  if (bytes.byteLength > 1024 * 1024) throw new Error('Files larger than 1 MiB cannot be opened in this editor.');
  return new TextDecoder().decode(bytes);
}

function FilesPanel() {
  const fileInputRef = useRef(null);
  const filesPanelRef = useRef(null);
  const sidebarResizeRef = useRef(null);
  const [path, setPath] = useState('.');
  const [pathDraft, setPathDraft] = useState('/');
  const [entries, setEntries] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [contents, setContents] = useState('');
  const [savedContents, setSavedContents] = useState('');
  const [preview, setPreview] = useState(null);
  const [creating, setCreating] = useState(null);
  const [entryName, setEntryName] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarHeight, setSidebarHeight] = useState(220);
  const [stackedLayout, setStackedLayout] = useState(() => window.matchMedia('(max-width: 560px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 560px)');
    const updateLayout = () => setStackedLayout(media.matches);
    updateLayout();
    media.addEventListener('change', updateLayout);
    return () => media.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => () => document.body.classList.remove('files-resizing', 'files-resizing-row'), []);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const clearFileSelection = () => {
    setSelectedPath(null);
    setContents('');
    setSavedContents('');
    setPreview(null);
  };

  const startSidebarResize = (event) => {
    if (event.button !== 0) return;
    const panelBounds = filesPanelRef.current?.getBoundingClientRect();
    if (!panelBounds) return;
    event.preventDefault();
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      stacked: stackedLayout,
      panelLeft: panelBounds.left,
      panelTop: panelBounds.top,
      maxSize: stackedLayout
        ? Math.max(130, panelBounds.height - 180)
        : Math.max(190, panelBounds.width - 240),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add(stackedLayout ? 'files-resizing-row' : 'files-resizing');
  };

  const resizeSidebar = (event) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextSize = resize.stacked
      ? event.clientY - resize.panelTop
      : event.clientX - resize.panelLeft;
    if (resize.stacked) {
      setSidebarHeight(Math.max(130, Math.min(resize.maxSize, nextSize)));
    } else {
      setSidebarWidth(Math.max(190, Math.min(resize.maxSize, nextSize)));
    }
  };

  const stopSidebarResize = (event) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    sidebarResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove('files-resizing', 'files-resizing-row');
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const names = await filesDep("getWanixRoot")().readDir(path);
      const next = (Array.isArray(names) ? names : []).map((entry) => {
        const isDirectory = entry.endsWith('/');
        return { name: entry.replace(/\/$/, ''), isDirectory };
      }).sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
      setEntries(next);
      setStatus('');
    } catch (error) {
      setEntries([]);
      setStatus(error.message || 'Unable to read this directory.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    refresh();
    const retry = () => refresh();
    filesDep("wanixSystem")?.addEventListener('ready', retry);
    return () => filesDep("wanixSystem")?.removeEventListener('ready', retry);
  }, [refresh]);

  useEffect(() => {
    setPathDraft(path === '.' ? '/' : `/${path}`);
  }, [path]);

  const navigateToPath = () => {
    const nextPath = normalizeFilesystemPath(pathDraft);
    setPath(nextPath);
    clearFileSelection();
  };

  const openEntry = async (entry) => {
    const nextPath = filesystemPathJoin(path, entry.name);
    if (entry.isDirectory) {
      setPath(nextPath);
      clearFileSelection();
      return;
    }
    try {
      const data = await filesDep("getWanixRoot")().readFile(nextPath);
      const previewType = getFilesystemPreviewType(nextPath);
      setSelectedPath(nextPath);
      if (previewType) {
        const blob = new Blob([toFilesystemBytes(data)], { type: previewType.mime });
        setPreview({ ...previewType, blob, url: URL.createObjectURL(blob) });
        setContents('');
        setSavedContents('');
      } else {
        const text = decodeFilesystemText(data);
        setPreview(null);
        setContents(text);
        setSavedContents(text);
      }
      setStatus('');
    } catch (error) {
      setStatus(error.message || 'Unable to open this file.');
    }
  };

  const createEntry = async () => {
    const name = entryName.trim();
    if (!name || name.includes('/') || name === '.' || name === '..') {
      setStatus('Enter a name without a path separator.');
      return;
    }
    try {
      const entryPath = filesystemPathJoin(path, name);
      const root = filesDep("getWanixRoot")();
      if (creating === 'rename-file' && selectedPath) {
        await root.rename(selectedPath, filesystemPathJoin(filesystemPathParent(selectedPath), name));
        setSelectedPath(filesystemPathJoin(filesystemPathParent(selectedPath), name));
      } else if (creating === 'rename-folder') {
        const nextPath = filesystemPathJoin(filesystemPathParent(path), name);
        await root.rename(path, nextPath);
        setPath(nextPath);
      } else if (creating === 'folder') {
        await root.makeDir(entryPath);
      } else {
        await root.writeFile(entryPath, '');
      }
      setCreating(null);
      setEntryName('');
      await refresh();
      if (creating === 'file') await openEntry({ name, isDirectory: false });
    } catch (error) {
      setStatus(error.message || 'Unable to create this entry.');
    }
  };

  const saveFile = async () => {
    if (!selectedPath) return;
    try {
      await filesDep("getWanixRoot")().writeFile(selectedPath, contents);
      setSavedContents(contents);
      await refresh();
      setStatus('Saved.');
    } catch (error) {
      setStatus(error.message || 'Unable to save this file.');
    }
  };

  const removeFile = async () => {
    if (!selectedPath || !window.confirm(`Delete ${selectedPath}?`)) return;
    try {
      await filesDep("getWanixRoot")().remove(selectedPath);
      clearFileSelection();
      setStatus('Deleted.');
      await refresh();
    } catch (error) {
      setStatus(error.message || 'Unable to delete this file.');
    }
  };

  const removeDirectory = async () => {
    if (path === '.' || !window.confirm(`Delete the empty folder /${path}?`)) return;
    try {
      const parent = filesystemPathParent(path);
      await filesDep("getWanixRoot")().remove(path);
      setPath(parent);
      clearFileSelection();
      setStatus('Deleted empty folder.');
    } catch (error) {
      setStatus(error.message || 'Only empty folders can be deleted here.');
    }
  };

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    try {
      const root = filesDep("getWanixRoot")();
      for (const file of files) {
        await root.writeFile(filesystemPathJoin(path, file.name), new Uint8Array(await file.arrayBuffer()));
      }
      await refresh();
      setStatus(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to upload these files.');
    } finally {
      event.target.value = '';
    }
  };

  const downloadFile = () => {
    if (!selectedPath) return;
    const link = document.createElement('a');
    const blob = preview?.blob || new Blob([contents], { type: 'text/plain;charset=utf-8' });
    link.href = URL.createObjectURL(blob);
    link.download = selectedPath.split('/').pop() || 'download';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };

  const dirty = selectedPath && !preview && contents !== savedContents;
  return React.createElement('div', {
    ref: filesPanelRef,
    className: 'files-panel panel-content',
    style: {
      '--files-sidebar-width': `${sidebarWidth}px`,
      '--files-sidebar-height': `${sidebarHeight}px`,
    },
  },
    React.createElement('section', { className: 'files-sidebar' },
      React.createElement('div', { className: 'files-toolbar' },
        React.createElement('input', {
          value: pathDraft,
          'aria-label': 'Filesystem path',
          spellCheck: false,
          onChange: (event) => setPathDraft(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') navigateToPath(); },
        }),
        React.createElement('div', { className: 'files-toolbar-actions' },
          React.createElement('button', { type: 'button', title: 'Go to path', 'aria-label': 'Go to path', onClick: navigateToPath }, React.createElement(ArrowRight, { size: 15, 'aria-hidden': true })),
          React.createElement('button', { type: 'button', title: 'Parent folder', 'aria-label': 'Parent folder', disabled: path === '.', onClick: () => { setPath(filesystemPathParent(path)); clearFileSelection(); } }, React.createElement(ArrowUp, { size: 15, 'aria-hidden': true })),
          React.createElement('button', { type: 'button', title: 'Refresh files', 'aria-label': 'Refresh files', onClick: refresh }, React.createElement(RefreshCw, { className: loading ? 'files-spinning' : '', size: 15, 'aria-hidden': true })),
          React.createElement('button', { type: 'button', title: 'Upload files', 'aria-label': 'Upload files', onClick: () => fileInputRef.current?.click() }, React.createElement(Upload, { size: 15, 'aria-hidden': true })),
          React.createElement('button', { type: 'button', title: 'New file', 'aria-label': 'New file', onClick: () => { setCreating('file'); setEntryName(''); } }, React.createElement(FilePlus2, { size: 15, 'aria-hidden': true })),
          React.createElement('button', { type: 'button', title: 'New folder', 'aria-label': 'New folder', onClick: () => { setCreating('folder'); setEntryName(''); } }, React.createElement(FolderPlus, { size: 15, 'aria-hidden': true })),
          path !== '.' && React.createElement(React.Fragment, null,
            React.createElement('button', { type: 'button', title: 'Rename folder', 'aria-label': 'Rename folder', onClick: () => { setCreating('rename-folder'); setEntryName(path.split('/').pop() || ''); } }, React.createElement(Pencil, { size: 15, 'aria-hidden': true })),
            React.createElement('button', { type: 'button', title: 'Delete empty folder', 'aria-label': 'Delete empty folder', onClick: removeDirectory }, React.createElement(Trash2, { size: 15, 'aria-hidden': true })),
          ),
        ),
      ),
      React.createElement('input', { ref: fileInputRef, className: 'files-upload-input', type: 'file', multiple: true, onChange: uploadFiles }),
      creating && React.createElement('div', { className: 'files-create' },
        React.createElement('input', { autoFocus: true, value: entryName, placeholder: creating.includes('folder') ? 'folder name' : 'file name', onChange: (event) => setEntryName(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createEntry(); if (event.key === 'Escape') setCreating(null); } }),
        React.createElement('button', { type: 'button', title: `Create ${creating}`, 'aria-label': `Create ${creating}`, onClick: createEntry }, React.createElement(Check, { size: 15, 'aria-hidden': true })),
        React.createElement('button', { type: 'button', title: 'Cancel', 'aria-label': 'Cancel', onClick: () => setCreating(null) }, React.createElement(X, { size: 15, 'aria-hidden': true })),
      ),
      React.createElement('div', { className: 'files-list', role: 'list' },
        entries.map((entry) => React.createElement('button', {
          key: `${entry.isDirectory ? 'd' : 'f'}:${entry.name}`,
          type: 'button',
          role: 'listitem',
          className: selectedPath === filesystemPathJoin(path, entry.name) ? 'selected' : '',
          title: entry.name,
          onClick: () => openEntry(entry),
        },
        React.createElement(entry.isDirectory ? FolderOpen : FileCode2, { size: 15, 'aria-hidden': true }),
        React.createElement('span', null, entry.name),
        )),
        !loading && entries.length === 0 && !status && React.createElement('p', { className: 'files-empty' }, 'Folder is empty.'),
      ),
    ),
    React.createElement('div', {
      className: 'files-resizer',
      role: 'separator',
      'aria-label': stackedLayout ? 'Resize file browser file list height' : 'Resize file browser sidebar',
      'aria-orientation': stackedLayout ? 'horizontal' : 'vertical',
      'aria-valuemin': stackedLayout ? 130 : 190,
      'aria-valuenow': Math.round(stackedLayout ? sidebarHeight : sidebarWidth),
      onPointerDown: startSidebarResize,
      onPointerMove: resizeSidebar,
      onPointerUp: stopSidebarResize,
      onPointerCancel: stopSidebarResize,
    }),
    React.createElement('section', { className: 'files-editor' },
      selectedPath
        ? preview
          ? React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'files-editor-toolbar' },
              React.createElement('code', { title: selectedPath }, `/${selectedPath}`),
              React.createElement('div', { className: 'files-toolbar-actions' },
                React.createElement('button', { type: 'button', title: 'Download file', 'aria-label': 'Download file', onClick: downloadFile }, React.createElement(Download, { size: 15, 'aria-hidden': true })),
                React.createElement('button', { type: 'button', title: 'Rename file', 'aria-label': 'Rename file', onClick: () => { setCreating('rename-file'); setEntryName(selectedPath.split('/').pop() || ''); } }, React.createElement(Pencil, { size: 15, 'aria-hidden': true })),
                React.createElement('button', { type: 'button', title: 'Delete file', 'aria-label': 'Delete file', onClick: removeFile }, React.createElement(Trash2, { size: 15, 'aria-hidden': true })),
              ),
            ),
            React.createElement('div', { className: `files-media-preview ${preview.kind}` },
              preview.kind === 'image'
                ? React.createElement('img', { src: preview.url, alt: selectedPath.split('/').pop() || 'Image preview' })
                : preview.kind === 'audio'
                  ? React.createElement('audio', { src: preview.url, controls: true, preload: 'metadata' })
                  : React.createElement('video', { src: preview.url, controls: true, preload: 'metadata' }),
            ),
          )
          : React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'files-editor-toolbar' },
            React.createElement('code', { title: selectedPath }, `/${selectedPath}`),
            React.createElement('div', { className: 'files-toolbar-actions' },
              React.createElement('button', { type: 'button', title: 'Save file', 'aria-label': 'Save file', disabled: !dirty, onClick: saveFile }, React.createElement(Save, { size: 15, 'aria-hidden': true })),
              React.createElement('button', { type: 'button', title: 'Download file', 'aria-label': 'Download file', onClick: downloadFile }, React.createElement(Download, { size: 15, 'aria-hidden': true })),
              React.createElement('button', { type: 'button', title: 'Rename file', 'aria-label': 'Rename file', onClick: () => { setCreating('rename-file'); setEntryName(selectedPath.split('/').pop() || ''); } }, React.createElement(Pencil, { size: 15, 'aria-hidden': true })),
              React.createElement('button', { type: 'button', title: 'Delete file', 'aria-label': 'Delete file', onClick: removeFile }, React.createElement(Trash2, { size: 15, 'aria-hidden': true })),
            ),
          ),
          React.createElement('textarea', { value: contents, spellCheck: false, 'aria-label': `Contents of ${selectedPath}`, onChange: (event) => setContents(event.target.value) }),
          )
        : React.createElement('div', { className: 'files-editor-empty' }, React.createElement(FileCode2, { size: 28, 'aria-hidden': true })),
      status && React.createElement('div', { className: 'files-status', role: 'status' }, status),
    ),
  );
}

// === Panel registration ===
// Counter for unique Files panel ids. The counter is module-scoped
// so it survives React re-renders but resets on page reload.
let filesIdCounter = 0;

// Register a new Files panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Files from the panel
// menu, and from the restore-saved-panels path on boot.
export function addFilesPanel(api, group) {
  const id = ++filesIdCounter;
  const panel = api.addPanel({
    id: `files-${id}`,
    component: 'files',
    params: { filesId: id, panelType: 'files' },
    title: 'Files',
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = filesDep('rememberOpenPanel');
  rememberOpenPanel(panel, { component: 'files' });
  panel.api.setActive();
  return panel;
}

export { FilesPanel };
