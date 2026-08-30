# GearShell task worker examples: js workers and wasi workers

Every task in GearShell runs in one of three worker kernels, chosen by the
task's `type`:

| type    | what runs                                             | who runs it                          |
| ------- | ----------------------------------------------------- | ------------------------------------ |
| `gojs`  | a Go program compiled to wasm (`GOOS=js GOARCH=wasm`) | the gojs driver + Go wasm runtime    |
| `js`    | a plain JavaScript module (your own worker script)    | the js driver: your file IS a module Worker |
| `wasi`  | a wasm32-wasi binary (zig / C / rust / hand-written WAT) | the wasi driver + a WASI preview1 runtime |
| `auto`  | any of the above, detected from the binary (`*.js`, or wasm magic) | the kernel tries each driver |

The bash / w9y / gear programs you already use are all `gojs`. These
examples show the other two worker kinds, with the actual ABI visible so
you can copy the pattern.

Enable the **Examples** plugin (Plugins page) to mount this directory's
files into every task namespace under `examples/`, then open a terminal
and run:

```
examples/hello.js              # runtime "JavaScript"
examples/fs-demo.js            # runtime "JavaScript"
examples/hello.wasm            # runtime "WASI"
examples/args.wasm a b c       # runtime "WASI"
examples/cat.wasm examples/hello.wat   # runtime "WASI"
```

(In Settings > Terminal, the profile's Runtime dropdown chooses the type;
a task with `type` "auto" also works — the kernel sniffs `*.js` for the js
driver and the wasm format for the wasi driver.)

> **WASI needs a cross-origin-isolated host.** The kernel's wasi worker
> runs the module in a second worker connected through a
> `SharedArrayBuffer`, which browsers only allow when the page is
> cross-origin isolated (COOP `same-origin` + COEP). The plain
> `python3 -m http.server` (and GitHub Pages) cannot send those headers,
> so wasi tasks fail silently there; js and gojs workers are unaffected.
> Run the repo with the Go dev server to get wasi workers:
>
> ```
> go run scripts/dev-server.go       # http://127.0.0.1:8080 (COOP+COEP set)
> ```
>
> It mirrors ../wanix's `examples/serve.go`, but uses COEP `credentialless`
> so the shell's cross-origin iframes (codigo / crush panels) still load.
> Any COOP/COEP-capable production host works the same way.

## js workers — your script IS the worker

`type="js"` tasks run the cmd's first word as a module Worker. The kernel
sends exactly one startup message:

```js
self.addEventListener("message", async (e) => {
  if (!e.data || !e.data.worker) return;
  const { tid, port, cmd } = e.data.worker;
  // port: MessagePort byte stream to the task filesystem.
  // #task/<tid>/ is this task's control dir: args, env, dir, fd/0..2, exit.
});
```

Everything the worker can do flows through that `port`:

- **stdout** — append text to `#task/<tid>/fd/1` (bound to the terminal
  for a `term` task, or to the web console when headless);
- **fs** — `#task/<tid>/args` is JSON argv, `/env` is `KEY=VALUE` lines,
  `/dir` is the cwd; the task's own namespace (its binds) is the working
  filesystem;
- **process control** — `Spawn`/`Wait` can start child tasks (e.g. bash);
- **done** — write a number to `#task/<tid>/exit`, then `self.close()`.

The wire protocol on `port` is a duplex multiplexer + CBOR RPC. You do not
need to care: `examples/js/wanix.js` (+ `mux.js`) is a ~250-line,
dependency-free reimplementation of the client — read it to see exactly
what the kernel speaks, or just import the `WanixHandle` class:

```js
import { WanixHandle } from "/examples/js/wanix.js";

self.addEventListener("message", async (e) => {
  if (!e.data?.worker) return;
  const fs = new WanixHandle(e.data.worker.port);
  const T = `#task/${e.data.worker.tid}`;
  await fs.appendFile(`${T}/fd/1`, "hi from a js worker\n");
  await fs.writeFile(`${T}/exit`, "0");
  self.close();
});
```

One portability caveat: the kernel serves the worker script from a blob:
URL, and a blob worker can only resolve FULL URLs (not relative or
root-absolute paths), so the examples import the client dynamically:
`await import(`${location.origin}/examples/js/wanix.js`)`. If you host
the shell at a subpath, add that prefix to the import, or inline the
client into your worker.

`hello.js` is the minimal walkthrough (args, env, cwd, namespace listing).
`fs-demo.js` shows the fs API and `Spawn` + `Wait` process control.

## wasi workers — a real wasm32-wasi binary

`type="wasi"` tasks compile the cmd's first word as a wasm32-wasi module
and run it in a WASI preview1 runtime whose stdio is wired to the task:

- fd 0 = the task's stdin (empty in the current kernel — the runtime opens
  it as an empty file, so interactive stdin programs will read EOF);
- fd 1 / fd 2 = the task's stdout / stderr (your terminal);
- a preopen directory at fd 3, mounted at `/`, maps to the task's
  namespace (use preopen-relative paths; absolute paths are not
  capable). `cat.wasm` hardcodes fd 3 (browser_wasi_shim numbers stdio
  0..2, then preopens in order); discover preopens properly with
  `fd_prestat_get` for production code.
- `args_get` returns the parsed cmd words, `environ_get` the task's env.

The examples are hand-written WebAssembly text (`.wat`) so you can read
the whole ABI in one sitting — no toolchain needed to build them:

```
wasm-tools parse examples/wasi/hello.wat -o examples/wasi/hello.wasm
```

- `hello.wat` — one `fd_write` call. The "hello world" of WASI.
- `args.wat` — `args_sizes_get` / `args_get` / `environ_sizes_get` /
  `environ_get`: your argv and env, straight from the kernel. Note the
  label strings live at 4096+ so a long argv's pointer array (which grows
  down from 16) cannot clobber them.
- `cat.wat` — `path_open` on the fd-3 preopen, then `fd_read` + `fd_write`
  in a loop: read any file in the task namespace.

To build your own: any wasm32-wasi toolchain works (zig, clang + wasi-sdk,
rust with the `wasm32-wasi` target, or plain WAT as here). Example:

```sh
zig build-exe main.zig -target wasm32-wasi -O Debug
# then point a WASI-runtime terminal profile at ./main.wasm
```

## How the files get into a terminal

The Examples plugin declares the resources with the `files` manifest field
— fetched files mounted into every task namespace, same mechanism the
shell-tools plugin uses for the bash/w9y/gear binaries (`wasm` field):

```js
{
  id: "examples",
  files: [
    { id: "hello-js",  dst: "examples/hello.js",  src: "/examples/js/hello.js" },
    { id: "hello-wasm", dst: "examples/hello.wasm", src: "/examples/wasi/hello.wasm" },
    // ...
  ],
}
```

The `.wat` sources, this README, and the `wanix.js`/`mux.js` client are
served as plain static files (they do not need to be mounted: the worker
fetches `wanix.js` over HTTP, and the wasm sources are only for reading).
