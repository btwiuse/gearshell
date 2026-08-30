// app-plugin-manifests-examples.js — the `examples` plugin manifest
// (500-line split out of app-plugin-manifests.js). Pure data: a DISABLED
// bind provider that mounts runnable js-worker / wasi-worker examples
// into every task namespace, so any terminal can launch them.

// Runnable js-worker and wasi-worker examples, mounted into every task
// namespace under examples/ so any terminal can launch them. Ships
// DISABLED like the template: enable it from the Plugins page to get
// the files, then try, from a terminal with the matching runtime:
//
//   js   runtime:  examples/hello.js            (plain js worker)
//   js   runtime:  examples/fs-demo.js arg      (fs API + spawn)
//   wasi runtime:  examples/hello.wasm          (WASI hello world)
//   wasi runtime:  examples/args.wasm a b c     (argv/env via WASI ABI)
//   wasi runtime:  examples/cat.wasm FILE       (read a file via preopen)
//   js   runtime:  examples/calc.js A B [op]    (one task, four worker
//                                                 kinds: wasi + gojs + js)
//
// Sources and the full tutorial live in examples/ (wat sources for the
// wasm files, the worker protocol docs in examples/js/wanix.js).
export const EXAMPLES_PLUGIN = {
  id: "examples",
  name: "Examples",
  // Bump the version whenever example content changes: the OPFS bind
  // cache keys on <pluginId>@<version> + src URL, so a same-version
  // content edit would keep serving the stale cached copy.
  version: "1.0.12",
  icon: "Lightbulb",
  // No entry module: purely a bind provider. Declares the examples as
  // per-task `files` binds (same shape the shell-tools plugin uses for
  // its /bin binaries): every task namespace gets examples/ mounted
  // into it, so any terminal can run them. The kernel's js driver
  // reads worker scripts from the task's own namespace (like wasi and
  // gojs), so per-task mounts work for all four worker kinds.
  enabled: false,
  files: [
    { id: "hello-js", dst: "examples/hello.js", src: "/examples/js/hello.js" },
    { id: "fs-demo-js", dst: "examples/fs-demo.js", src: "/examples/js/fs-demo.js" },
    { id: "ipc-probe-js", dst: "examples/ipc-probe.js", src: "/examples/js/ipc-probe.js" },
    { id: "calc-js", dst: "examples/calc.js", src: "/examples/js/calc.js" },
    { id: "calc-service-js", dst: "examples/calc-service.js", src: "/examples/js/calc-service.js" },
    { id: "hello-wasm", dst: "examples/hello.wasm", src: "/examples/wasi/hello.wasm" },
    { id: "args-wasm", dst: "examples/args.wasm", src: "/examples/wasi/args.wasm" },
    { id: "cat-wasm", dst: "examples/cat.wasm", src: "/examples/wasi/cat.wasm" },
    { id: "calc-wasm", dst: "examples/calc.wasm", src: "/examples/wasi/calc.wasm" },
    { id: "calc-wat", dst: "examples/calc.wat", src: "/examples/wasi/calc.wat" },
    // The .wat sources are bound too, so cat.wasm (and any task) can
    // read them from the namespace, not just fetch them over HTTP.
    { id: "hello-wat", dst: "examples/hello.wat", src: "/examples/wasi/hello.wat" },
    { id: "args-wat", dst: "examples/args.wat", src: "/examples/wasi/args.wat" },
    { id: "cat-wat", dst: "examples/cat.wat", src: "/examples/wasi/cat.wat" },
  ],
};
