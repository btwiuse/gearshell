// examples/js/ipc-probe.js — verify parent/child shared-namespace IPC.
// The parent makes svc/, spawns a bash child that writes a file into it,
// then reads the file back. Children clone the parent's namespace table
// (same underlying fs nodes), so a file written through a child is
// visible to the parent at the same path.
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
    await fs.makeDir("svc");
    const pid = await fs.spawn("bin/bash", ["-c", "echo $((20 + 22)) > svc/answer.txt"]);
    const code = await fs.wait(pid);
    const answer = (await fs.readText("svc/answer.txt")).trim();
    await print(`child exit=${code} answer=${answer}`);
    await fs.remove("svc/answer.txt");
    await fs.remove("svc");
    await exit(0);
  } catch (err) {
    await print(`error: ${err && err.message ? err.message : err}`);
    await exit(1);
  } finally {
    self.close();
  }
});
