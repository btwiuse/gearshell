// playground-catalog-shell-panels.js — the panel-opening namespace
// half of the shell catalog (panels, browser, files, fs). Split out
// of playground-catalog-shell.js for the 500-line rule.
//
// Each entry mirrors a window.GearShell method the Explorer can
// invoke against the running shell. The hints carry the conventions
// callers hit in practice (group/referencePanel/direction for
// panels.open, wanix path syntax for fs.*) so the form rendered by
// the Explorer doesn't need to hardcode per-method UI.

export const panelsCatalog = [
  {
    namespace: "panels",
    title: "Panels",
    methods: [
      {
        name: "list",
        args: [],
        hint: "Every dockview panel: id, component, title, active, group.",
      },
      {
        name: "open",
        args: [
          {
            key: "component",
            label: "Component",
            type: "string",
            default: "home",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder:
              '{"group":null,"referencePanel":null,"direction":"right"}',
          },
        ],
        hint: "direction/group/referencePanel split the dock next to a panel.",
      },
      {
        name: "close",
        args: [{
          key: "id",
          label: "Panel id",
          type: "string",
          placeholder: "settings-1",
        }],
        hint: "Close a panel by id (panels.list shows ids).",
      },
      {
        name: "focus",
        args: [{
          key: "id",
          label: "Panel id",
          type: "string",
          placeholder: "home-1",
        }],
        hint: "Activate a panel by id.",
      },
    ],
  },
  {
    namespace: "browser",
    title: "Browser",
    methods: [
      {
        name: "open",
        args: [
          {
            key: "url",
            label: "URL",
            type: "string",
            placeholder: "https://example.com",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"direction":"right"}',
          },
        ],
        hint: "Open a http(s) URL in an iframe panel.",
      },
    ],
  },
  {
    namespace: "files",
    title: "Files",
    methods: [
      {
        name: "open",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/notes.md",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
          },
        ],
        hint: "Reveal a VFS path in the Files panel.",
      },
    ],
  },
  // Filesystem: low-level VFS CRUD against the wanix namespace.
  // Same kernel the Files panel drives; paths use wanix syntax
  // ("/", ".", "task", "#task/repl-1/term/data", "/opfs/home", …).
  // Iframe plugins opt in via the `fs.*` permission path.
  {
    namespace: "fs",
    title: "Filesystem (wanix VFS)",
    methods: [
      {
        name: "readFile",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/notes.md",
          },
        ],
        hint:
          "Read the full contents of a file as a Uint8Array. " +
          "Throws on ENOENT / EACCES — use exists() to probe first.",
      },
      {
        name: "readFileText",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/notes.md",
          },
        ],
        hint:
          "Convenience wrapper around readFile that decodes the bytes " +
          "as UTF-8 and returns a string. Empty string when the file is empty.",
      },
      {
        name: "writeFile",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/scratch.bin",
          },
          {
            key: "contents",
            label: "Bytes (Uint8Array)",
            type: "json",
            default: "[104,101,108,108,111]",
            placeholder: "[104,101,108,108,111]",
          },
        ],
        hint:
          "Write a Uint8Array (or plain number[]) to a path, truncating " +
          "any existing file. Resolves { ok, path, bytes } on success.",
      },
      {
        name: "writeFileText",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/scratch.txt",
          },
          {
            key: "text",
            label: "Text",
            type: "string",
            default: "hello",
          },
        ],
        hint:
          "Convenience wrapper around writeFile that encodes a string " +
          "as UTF-8 bytes before writing.",
      },
      {
        name: "readDir",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home",
          },
        ],
        hint:
          "List the immediate children of a directory as " +
          "[{name, isDirectory}]. The wanix trailing-slash convention is " +
          "normalised away so callers don't need to know it.",
      },
      {
        name: "stat",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/notes.md",
          },
        ],
        hint:
          "Return { size, mode, isDirectory, isFile, modTime, raw }. " +
          "Throws when the path does not exist — use exists() for a " +
          "boolean probe.",
      },
      {
        name: "exists",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/maybe.md",
          },
        ],
        hint:
          "Resolve { ok, exists } without throwing on ENOENT-style " +
          "failures. Real I/O errors (permission denied, kernel panic) " +
          "still throw.",
      },
      {
        name: "mkdir",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/projects",
          },
        ],
        hint: "Create a directory. Resolves { ok, path } on success.",
      },
      {
        name: "rm",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home/old.txt",
          },
        ],
        hint:
          "Remove a file or empty directory. Resolves { ok, path } on " +
          "success; throws if the path does not exist.",
      },
      {
        name: "rename",
        args: [
          {
            key: "path",
            label: "Current path",
            type: "string",
            placeholder: "/opfs/home/old.txt",
          },
          {
            key: "nextPath",
            label: "New path",
            type: "string",
            placeholder: "/opfs/home/new.txt",
          },
        ],
        hint:
          "Rename or move a file or directory. Resolves { ok, path, nextPath }.",
      },
      {
        name: "mounts",
        args: [],
        hint: "List persisted local directory mounts without exposing handles.",
      },
      {
        name: "requestLocalDir",
        args: [
          {
            key: "name",
            label: "Display name (optional)",
            type: "string",
            placeholder: "my-project",
          },
        ],
        hint:
          "Run the File System Access picker on the host, bind the chosen " +
          "directory into mnt/<name>, persist it in IndexedDB. Resolves " +
          "{ ok, mount: { id, name, dst, mounted } }. Browser-only and " +
          "requires a real user gesture.",
      },
      {
        name: "reconnect",
        args: [{ key: "id", label: "Mount id", type: "string" }],
        hint:
          "Re-run the File System Access picker for a stored mount whose " +
          "permission was revoked. Picks the same browser-side id so the " +
          "bind graph slot is reused.",
      },
      {
        name: "remount",
        args: [{ key: "id", label: "Mount id", type: "string" }],
        hint: "Reconnect a stored mount when permission is already granted.",
      },
      {
        name: "restoreMounts",
        args: [],
        hint:
          "Boot-time restore: silently rebinds every stored mount whose " +
          "permission queryPermission still grants. Returns the refreshed " +
          "mount list (with mounted flags).",
      },
      {
        name: "unmount",
        args: [{ key: "id", label: "Mount id", type: "string" }],
        hint: "Unmount and forget a persisted local directory mount.",
      },
      {
        name: "watch",
        args: [
          {
            key: "path",
            label: "Path",
            type: "string",
            placeholder: "/opfs/home",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: '{"recursive":true}',
            placeholder: '{"recursive":true}',
          },
        ],
        hint:
          "Watch a /opfs/... path. Returns a handle { id, path, recursive }. " +
          "Mutations are delivered as 'fs.changed' events with payload " +
          "{ path, type: 'modified|appeared|disappeared', root }. " +
          "Requires Chromium with FileSystemObserver support.",
      },
      {
        name: "unwatch",
        args: [
          {
            key: "handle",
            label: "Watch handle",
            type: "json",
            default: '{"id":1}',
            placeholder: '{"id":1}',
          },
        ],
        hint:
          "Dispose a watcher returned by fs.watch. Pass the full handle " +
          "object, not just the id.",
      },
    ],
  },
];