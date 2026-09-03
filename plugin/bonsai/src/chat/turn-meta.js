// Streaming chat primitives: per-turn meta line, the throttled
// paint queue, and the live TTFT / TOK/S indicator.
//
// These touch a small set of DOM elements shared with the chat
// composer. The caller hands them in so the module stays stateless.

export function appendTurnMeta(msg, { startedAt, firstTokenAt, thinkEndedAt, endedAt, tokens }) {
  if (tokens <= 0) return;
  const parts = [`${tokens} TOK`];
  if (thinkEndedAt) {
    parts.push(`THOUGHT ${((thinkEndedAt - (firstTokenAt || startedAt)) / 1e3).toFixed(1)}S`);
  }
  if (firstTokenAt) {
    parts.push(`TTFT ${(firstTokenAt - startedAt).toFixed(0)} MS`);
  }
  if (tokens > 5 && firstTokenAt) {
    parts.push(
      `${
        ((tokens - 1) / Math.max((endedAt - firstTokenAt) / 1e3, 1e-9)).toFixed(1)
      } TOK/S`,
    );
  }
  const meta = document.createElement("div");
  meta.className = "c-msg-meta";
  meta.textContent = parts.join("  ·  ");
  msg.appendChild(meta);
}

const STREAM_RENDER_MS = 33;
let streamPaint = null;
let renderQueued = false;
let lastRenderAt = 0;

export function scheduleStreamPaint(paint) {
  streamPaint = paint;
  if (renderQueued) return;
  renderQueued = true;
  const tick = () => {
    if (!streamPaint) {
      renderQueued = false;
      return;
    }
    if (performance.now() - lastRenderAt < STREAM_RENDER_MS) {
      requestAnimationFrame(tick);
      return;
    }
    renderQueued = false;
    lastRenderAt = performance.now();
    const paintNow = streamPaint;
    streamPaint = null;
    try { paintNow(); } catch (error) { console.error(error); }
    if (streamPaint) {
      renderQueued = true;
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

export function cancelStreamPaint() {
  streamPaint = null;
  renderQueued = false;
}
