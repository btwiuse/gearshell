// examples/js/calc-service.js — a JavaScript microservice: part of the
// calculator pipeline in examples/js/calc.js.
//
// Reads its argv:  calc-service.js <op> <a> <b>
// Computes a <op> b (add/mul/sub) and appends the decimal result to
// svc/service.txt in the shared task namespace, then exits. The parent
// orchestrator created svc/ before spawning; child tasks clone the
// parent's namespace (same underlying fs nodes), so the file written
// here is visible to the parent at the same path.
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
    if (args.length < 4) throw new Error("usage: calc-service.js <op> <a> <b>");
    const op = args[1];
    const a = Number(args[2]);
    const b = Number(args[3]);
    const result = op === "add" ? a + b : op === "mul" ? a * b : a - b;
    // writeFile creates the file (O_CREAT|O_TRUNC); appendFile requires it
    // to already exist and fails with ErrNotExist on the first run.
    await fs.writeFile("svc/service.txt", `${result}\n`);
    await print(`js service: ${a} ${op} ${b} = ${result}`);
    await exit(0);
  } catch (err) {
    await print(`js service error: ${err && err.message ? err.message : err}`);
    await exit(1);
  } finally {
    self.close();
  }
});
