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
    ],
  },
];