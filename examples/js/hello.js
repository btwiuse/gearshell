// examples/js/hello.js — the minimal wanix "js" worker.
//
// A `type="js"` task runs this file as a module Worker. The kernel sends
// one startup message, then the script owns the task. Everything a worker
// can do flows through the `port` MessagePort in that message (see
// wanix.js), which is a byte stream to the task filesystem:
//
//   message.data.worker = {
//     id, tid,            // worker id, task id ("#task/<tid>/..." paths)
//     ppid,               // parent task id
//     port,               // MessagePort: fs RPC (the WanixHandle)
//     p9,                 // MessagePort: 9p export channel (unused here)
//     cmd, env, url, debug,
//   }
//
// Run it from a terminal with a profile of runtime "JavaScript", or:
//
//   wanix-task type=js cmd=/examples/hello.js
//
// argv[0] is the script path; extra words become argv[1..]. Env vars come
// from the task's `env` attribute, cwd from `wd`.
//
// The kernel runs this file from a blob: URL, and a blob worker cannot
// resolve relative or root-absolute imports — only full URLs — so the
// helper module is imported dynamically, built from the worker's own
// origin (works on any host that serves the shell).

console.log("hello.js worker booted");

self.addEventListener("error", (event) => {
  console.error("hello.js worker error:", event.message, event.error?.stack || event.error);
});
self.addEventListener("unhandledrejection", (event) => {
  console.error("hello.js worker unhandled rejection:", event.reason?.stack || event.reason);
});

self.addEventListener("message", async (event) => {
  if (!event.data || !event.data.worker) return;
  const { WanixHandle } = await import(
    `${location.origin}/examples/js/wanix.js`
  );
  const { tid, port } = event.data.worker;
  const fs = new WanixHandle(port);
  const TASK = `#task/${tid}`;

  // stdout: write lines to fd/1, which is bound to the terminal for a
  // `term` task (or to #web/console for a headless one).
  const print = (line) => fs.appendFile(`${TASK}/fd/1`, line + "\n");
  // A task is "done" once its exit file has a number; do this last.
  const exit = (code) => fs.writeFile(`${TASK}/exit`, String(code));

  try {
    const args = JSON.parse(await fs.readText(`${TASK}/args`));
    const env = (await fs.readText(`${TASK}/env`))
      .split("\n").filter((line) => line.includes("="));
    const cwd = (await fs.readText(`${TASK}/dir`)).trim() || "/";

    await print(`hello from a wanix js worker`);
    await print(`  task id : ${tid}`);
    await print(`  cwd     : ${cwd}`);
    await print(`  argv    : ${JSON.stringify(args)}`);
    await print(`  env     : ${JSON.stringify(env)}`);

    // The namespace this worker sees is the task's own: every bind the
    // task declares is mounted here. List what is visible at the root.
    const entries = await fs.readDir(".");
    await print(`  root    : ${entries.join(", ")}`);

    if (args.length > 1) {
      await print(`  extra   : ${args.slice(1).join(" ")}`);
    }
    await print("done");
    await exit(0);
  } catch (err) {
    await print(`error: ${err && err.message ? err.message : err}`);
    await exit(1);
  } finally {
    self.close(); // stop the worker once the task is finished
  }
});
