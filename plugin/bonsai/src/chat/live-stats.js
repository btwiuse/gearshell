// Live stats line above the chat composer.
//
// `updateLiveStat` is called on every streamed token; we throttle DOM
// writes to LIVE_STAT_MS so the TTFT / TOK/S numbers don't churn
// faster than the user can read them.
const LIVE_STAT_MS = 150;
let lastLiveStatAt = 0;

export function updateLiveStat({ liveEl, startedAt, firstTokenAt, now, tokens }) {
  if (!liveEl) return;
  if (tokens <= 1) {
    liveEl.textContent = `TTFT ${(firstTokenAt - startedAt).toFixed(0)} MS`;
    lastLiveStatAt = now;
    return;
  }
  if (now - lastLiveStatAt < LIVE_STAT_MS) return;
  lastLiveStatAt = now;
  liveEl.textContent = `${
    ((tokens - 1) / Math.max((now - firstTokenAt) / 1e3, 1e-9)).toFixed(0)
  } TOK/S`;
}
