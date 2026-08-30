// examples/js/fs-demo.js — a wanix "js" worker showing the fs API and
// process control: listing the task namespace, writing/reading a file,
// and spawning a child task (here the bash binary) with inherited stdio.
//
// Run it the same way as hello.js (runtime "JavaScript", or a wanix-task
// with type=js and cmd=/examples/fs-demo.js). Extra cmd words become
// argv[1..] and are treated as a path to list at the end.
//
// The kernel runs this file from a blob: URL, and a blob worker cannot
// resolve relative or root-absolute imports — only full URLs — so the
// helper module is imported dynamically from the worker's own origin.

self.addEventListener("message", async (event) => {
  if (!event.data || !event.data.worker) return;
  const { WanixHandle } = await import(
    `${location.origin}/examples/js/wanix.js`
  );
  const { tid, port } = event.data.worker;
  const fs = new WanixHandle(port);
  const TASK = `#task/${tid}`;
  const print = (line) => fs.appendFile(`${TASK}/fd/1`, line + "\n");
  const exit = (code) => fs.writeFile(`${TASK}/exit`, String(code));

  try {
    const args = JSON.parse(await fs.readText(`${TASK}/args`));
    await print(`fs-demo: task ${tid}, argv=${JSON.stringify(args)}`);
    await walkRoot(fs, print);
    await scratchFile(fs, print);
    await readWasm(fs, print);
    await spawnChild(fs, print);
    await print("fs-demo done");
    await exit(0);
  } catch (err) {
    await print(`error: ${err && err.message ? err.message : err}`);
    await exit(1);
  } finally {
    self.close();
  }
});

// List the task namespace root: every bind the task declares is mounted
// here (bin/, examples/, preset/, ... plus the kernel's device namespaces).
async function walkRoot(fs, print) {
  const entries = await fs.readDir(".");
  await print(`root (${entries.length}): ${entries.join(", ")}`);
}

// Make a directory, write a file, read it back, stat it, clean up.
// The task namespace is per-task, so this cannot touch other tasks or
// the host.
async function scratchFile(fs, print) {
  await fs.makeDir("scratch");
  await fs.writeFile("scratch/note.txt", "written by a js worker\n");
  await print(
    `scratch/note.txt = ${JSON.stringify(await fs.readText("scratch/note.txt"))}`,
  );
  const info = await fs.stat("scratch/note.txt");
  await print(
    `stat: size=${info.Size} isDir=${info.IsDir} mode=0o${(info.Mode >>> 0).toString(8)}`,
  );
  await fs.remove("scratch/note.txt");
  await fs.remove("scratch");
  await print("scratch cleaned up");
}

// Read a real file from the namespace: the hello WASI example shipped by
// the same plugin (a wasm binary, so it exercises binary reads).
async function readWasm(fs, print) {
  const wasm = await fs.readFile("examples/hello.wasm");
  if (wasm) {
    const magic = [...wasm.subarray(0, 4)]
      .map((b) => b.toString(16).padStart(2, "0")).join(" ");
    await print(`examples/hello.wasm: ${wasm.byteLength} bytes (0x${magic})`);
  }
}

// Spawn a child task (bash) with stdout inherited, and wait for its exit
// code. Children share this task's namespace and resolve commands like
// the parent.
async function spawnChild(fs, print) {
  const pid = await fs.spawn(
    "bin/bash",
    ["-c", "echo spawned-from-js: $((6 * 7))"],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  await print(`spawned bash (pid ${pid}), waiting...`);
  const exitCode = await fs.wait(pid);
  await print(`child exited with code ${exitCode}`);
}
