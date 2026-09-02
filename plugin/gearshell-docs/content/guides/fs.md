---
id: fs
title: "Reading and writing the wanix filesystem"
kind: guide
---

# Reading and writing the wanix filesystem

The `fs.*` namespace is a thin wrapper over the wanix root's VFS calls.
The wanix kernel is the same one the Files panel uses, so an iframe
plugin reading `GearShell.fs.readText("/opfs/home/foo.txt")` reads the
same bytes the Files panel shows.

## Paths

Paths follow the wanix namespace syntax. Common examples:

| Path | What it points to |
|------|-------------------|
| `/opfs/home` | the user's home directory |
| `/opfs/wanix` | the wanix kernel assets |
| `/js/binds/bin/gear` | the `gear` CLI bind |
| `#task/<task-id>/*` | a live task's namespace |
| `#ramfs/*` | a ramfs mount |

## Examples

```js
// Read text
const text = await GearShell.fs.readFileText("/opfs/home/notes.md");

// Write text (truncates)
await GearShell.fs.writeFileText("/opfs/home/notes.md", "hello\n");

// Append: read + write
const current = await GearShell.fs.readFileText("/opfs/home/notes.md")
  .catch(() => "");
await GearShell.fs.writeFileText("/opfs/home/notes.md", current + "more\n");

// List a directory
for (const { name, isDirectory } of await GearShell.fs.readDir("/opfs/home")) {
  console.log(name, isDirectory);
}

// Check existence without throwing
if ((await GearShell.fs.exists("/opfs/home/notes.md")).exists) { ... }
```

## Caveats

- Bytes are `Uint8Array` across the bridge (structured-clone). Text
  helpers do the encoder/decoder for you.
- `exists()` only swallows ENOENT-class errors. Permission denied and
  other I/O failures still throw — use `stat()` if you need to
  distinguish.
- Path sandboxing is delegated to the wanix bind graph. The API itself
  does not add a second ACL.

