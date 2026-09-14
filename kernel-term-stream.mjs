// Connect to a kernel term device, pump its output, and write winch
// frames. Shared by the iframe bridge (workspace-terminal-bridge.js) and
// the in-page API (workspace-terminal-api.js); the only difference between
// the two callers is what they do with each output chunk and how they
// react to exit, so the helper is parametrised by:
//
//   - `paths`     { data, winch, exit? }   kernel path builders
//   - `onChunk`   (Uint8Array) => void      output sink
//   - `onStreamEnd` () => void              called once the data stream
//                                            closes (dispose, kernel stop,
//                                            or remote EOF)
//   - `pollExit`  (trimmed) => void         optional exit-file poll; when
//                                            present, called once the
//                                            process exits (see
//                                            startExitFilePolling)
//   - `getRoot`   () => WanixHandle         lazy root accessor (the kernel
//                                            boots asynchronously after
//                                            the first session is created)
//
// Returns a controller exposing `dispose()` and `writeWinch(...)`. The
// caller is responsible for hooking `dispose` into its own session
// lifecycle and for surfacing `onStreamEnd` as a terminal exit event.

import { startExitFilePolling } from "./app-terminal-sessions.js";
import { getWanixRoot } from "./app-state.js";

const WAIT_TIMEOUT = 30000;
const ROOT_DEADLINE = 60000;
const winchEncoder = new TextEncoder();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRoot(deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  let root = null;
  while (Date.now() < deadline) {
    try {
      root = getWanixRoot();
      if (root) return root;
    } catch {
      // wanix not yet wired up
    }
    await sleep(250);
  }
  throw new Error("wanix system is not ready");
}

export function attachKernelTermStream({
  paths,
  onChunk,
  onStreamEnd,
  pollExit,
  beforeConnect,
}) {
  let reader = null;
  let writer = null;
  let exitPoller = null;
  let disposed = false;

  const connect = async () => {
    await beforeConnect?.();
    const root = await waitForRoot(ROOT_DEADLINE);
    // Integer literal timeout: floats panic the kernel.
    await root.waitFor(paths.data(), WAIT_TIMEOUT);
    const readable = await root.openReadable(paths.data());
    const writable = await root.openWritable(paths.data());
    reader = readable.getReader();
    writer = writable.getWriter();
    if (pollExit) {
      exitPoller = startExitFilePolling({
        path: paths.exit(),
        isAlive: () => !disposed,
        onExit: (trimmed) => pollExit(trimmed),
      });
    }
    pump();
  };

  const pump = async () => {
    try {
      while (!disposed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) onChunk(value);
      }
    } catch {
      // stream closed by dispose or kernel teardown
    }
    if (!disposed) {
      onStreamEnd?.();
    }
  };

  const writeWinch = async (cols, rows, xpixel = 0, ypixel = 0) => {
    const root = await waitForRoot(ROOT_DEADLINE);
    await root.waitFor(paths.winch(), WAIT_TIMEOUT);
    // openWritable, not writeFile: writeFile chmods after writing and the
    // signal FS rejects chmod, silently killing every winch update
    // (the shell's own terminals use openWritable for the same reason —
    // elements/term.js).
    const stream = await root.openWritable(paths.winch());
    const writer = stream.getWriter();
    await writer
      .write(winchEncoder.encode(`${cols} ${rows} ${xpixel} ${ypixel}\n`))
      .then(() => writer.close());
  };

  const write = (data) => {
    if (!writer) throw new Error("term stream is not connected yet");
    return writer.write(data);
  };

  const isConnected = () => !!writer;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    exitPoller?.stop();
    try { reader?.cancel?.(); } catch {}
    try { writer?.close?.(); } catch {}
  };

  // Fire-and-forget connect; callers can ignore the promise because the
  // pumps will eventually emit chunks / stream-end / exit events.
  connect().catch(() => onStreamEnd?.());

  return { dispose, write, writeWinch, isConnected };
}
