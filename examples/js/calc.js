// examples/js/calc.js — the microservice calculator: one task, four
// worker kinds, working together.
//
// This file IS the orchestrator: a `type="js"` worker. It creates a
// shared `svc/` directory, then spawns three child tasks — one per
// worker kind — each of which computes part of the same expression and
// writes its answer to a file in svc/. The orchestrator waits for all
// three and prints the results side by side. The kernel's spawn API
// always allocates children with type "auto", so each child's driver is
// sniffed from its binary: .wasm -> the WASI runtime, a bash script ->
// the gojs runtime, .js -> the js worker runtime. One task thus
// exercises all four kinds at once.
//
// Run it from a terminal with runtime "JavaScript" (or type=js):
//
//   examples/calc.js 6 7        # computes 6*7 three ways
//   examples/calc.js 12 4       # computes 12/4 three ways (div)
//   examples/calc.js 2 10       # computes 2+10 three ways (add)
//
// Default operation is multiply; pass add|sub|div as argv[3] to change
// it, e.g.  examples/calc.js 20 22 add
//
// Children (each a different worker kind, each writing svc/<name>.txt):
//   wasi  : examples/calc.wasm            (compiled from calc.wat)
//   gojs  : bin/bash -c '...'             (the task image's bash binary)
//   js    : examples/calc-service.js      (a js worker like this one)
//
// The kernel runs this file from a blob: URL, and a blob worker cannot
// resolve relative or root-absolute imports — only full URLs — so the
// helper module is imported dynamically from the worker's own origin.

const STDIO = { stdio: ["inherit", "inherit", "inherit"] };

// opWord maps the single-letter op (a/m/s/d) to the full word argv[3]
// that the service workers understand.
function opWord(op) {
  return op === "d" ? "div" : op === "a" ? "add" : op === "s" ? "sub" : "mul";
}

// bashExpr renders the arithmetic for a gojs bash child, which has no
// files: echo the result into svc/gojs.txt.
function bashExpr(op, a, b) {
  const sign = op === "a" ? "+" : op === "s" ? "-" : "*";
  return op === "d"
    ? `echo $(( ${a} / ${b} )) > svc/gojs.txt`
    : `echo $(( ${a} ${sign} ${b} )) > svc/gojs.txt`;
}

// spawnService starts one child worker for the given binary/args and
// returns its pid. Each worker kind computes the same expression and
// writes its answer to its own file in the shared svc/ directory.
async function spawnService(fs, cmd, args) {
  return fs.spawn(cmd, args, STDIO);
}

// gatherResults waits for every child, then reads each svc/<name>.txt.
async function gatherResults(fs, pids) {
  const exits = await Promise.all(pids.map((pid) => fs.wait(pid)));
  const names = ["svc/wasi.txt", "svc/gojs.txt", "svc/service.txt"];
  const answers = await Promise.all(
    names.map((name) => fs.readText(name).catch(() => "(no file)")),
  );
  return { exits, answers };
}

// report prints each worker's answer and the verdict, then cleans up.
async function report(fs, results, a, b, op) {
  const [wasiExit, gojsExit, jsExit] = results.exits;
  const [wasiAns, gojsAns, jsAns] = results.answers;
  await print(fs, `  wasi  (examples/calc.wasm)      : ${wasiAns.trim()} (exit ${wasiExit})`);
  await print(fs, `  gojs  (bin/bash)                : ${gojsAns.trim()} (exit ${gojsExit})`);
  await print(fs, `  js    (examples/calc-service.js): ${jsAns.trim()} (exit ${jsExit})`);

  const expected = op === "d" ? Math.floor(a / b) : op === "a" ? a + b : op === "s" ? a - b : a * b;
  const all = [wasiAns, gojsAns, jsAns].map((s) => Number(s.trim()));
  const agree = all.every((n) => Number.isFinite(n) && n === expected);
  await print(fs, agree ? `✅ all three workers agree: ${expected}` : `❌ disagreement (expected ${expected})`);

  await fs.remove("svc/wasi.txt").catch(() => {});
  await fs.remove("svc/gojs.txt").catch(() => {});
  await fs.remove("svc/service.txt").catch(() => {});
  await fs.remove("svc").catch(() => {});
  return agree ? 0 : 1;
}

// print appends a line to the orchestrator's own stdout (the task's
// fd/1), which the terminal (or the headless log) shows.
async function print(fs, line) {
  await fs.appendFile(`#task/${TID}/fd/1`, line + "\n");
}

let TID = null;

self.addEventListener("message", async (event) => {
  if (!event.data || !event.data.worker) return;
  const { WanixHandle } = await import(
    `${location.origin}/examples/js/wanix.js`
  );
  const { tid, port } = event.data.worker;
  TID = tid;
  const fs = new WanixHandle(port);

  try {
    const args = JSON.parse(await fs.readText(`#task/${tid}/args`));
    const a = Number(args[1] || "6");
    const b = Number(args[2] || "7");
    const op = (args[3] || "mul").slice(0, 1); // a/m/s/d
    await print(fs, `calc: ${a} ${opWord(op)} ${b} — spawning 3 workers...`);

    // svc/ is a shared directory in the task namespace; a previous run
    // may have left it behind, so make removal idempotent first.
    try { await fs.remove("svc"); } catch {}
    await fs.makeDir("svc");

    // One child per worker kind; the kernel's spawn API sniffs each
    // binary and picks the right driver automatically.
    const wasiPid = await spawnService(fs, "examples/calc.wasm",
      [opWord(op), String(a), String(b)]);
    const gojsPid = await spawnService(fs, "bin/bash", ["-c", bashExpr(op, a, b)]);
    const jsPid = await spawnService(fs, "examples/calc-service.js",
      [opWord(op), String(a), String(b)]);

    const results = await gatherResults(fs, [wasiPid, gojsPid, jsPid]);
    const code = await report(fs, results, a, b, op);
    await fs.writeFile(`#task/${tid}/exit`, String(code));
  } catch (err) {
    await print(fs, `calc error: ${err && err.message ? err.message : err}`);
    await fs.writeFile(`#task/${tid}/exit`, "1");
  } finally {
    self.close();
  }
});
