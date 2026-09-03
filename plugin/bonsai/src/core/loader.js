// Loader — runs before the scene modules to populate window.* globals
// (SEED, FREEZE, REDUCED, AZ_FIX, START_STAGE, QS, state, byId, simulate,
// stepProgress, updateDom, SPEED, App, BonsaiLoader) so any classic
// script that races ahead of the module graph still finds them.
//
// Converted from a classic <script> to an ES module so the loader can
// also be imported directly:
//   import { SEED, App } from "./loader.js";
//
// Window side effects are preserved at the bottom of the file as a
// compatibility shim for legacy code paths.
//
// Module evaluation is asynchronous (modules are deferred), so:
//   - Loading order in buildless.html still matters: this module must
//     appear before any <script type="module"> that reads its globals.
//   - Inline classic scripts that run *before* module evaluation may
//     not see the globals yet — that path is the original reason
//     config.js + loader.js used to be classic scripts. The window.*
//     assignments still happen, just slightly later in the boot.

const QS = new URLSearchParams(location.search);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FREEZE = QS.has("p") ? Math.min(1, Math.max(0, parseFloat(QS.get("p")) || 0)) : null;
const SPEED = Math.max(0.1, parseFloat(QS.get("speed")) || 1);
const SEED = QS.has("seed") ? parseInt(QS.get("seed"), 10) >>> 0 : (Math.random() * 1e9) | 0;
const AZ_FIX = QS.has("az") ? ((parseFloat(QS.get("az")) || 0) * Math.PI) / 180 : null;
const TOTAL_BYTES = 38e8;
const SHARDS = 32;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp01 = (a, b, t) => a + (b - a) * t;

const state = {
  target: 0,
  shown: 0,
  rate: 0,
  lastT: 0,
  lastBytes: 0,
  shard: 0,
  phaseOverride: null,
  external: false,
  doneAt: 0,
  totalBytes: TOTAL_BYTES,
  tensors: 0,
  tensorsTotal: 0,
  externalDone: false,
};

const readyCbs = [];

const BonsaiLoader = {
  set(loadedBytes, totalBytes = TOTAL_BYTES, meta = {}) {
    state.external = true;
    state.totalBytes = totalBytes;
    const now = performance.now() / 1e3;
    if (state.lastT > 0) {
      const dt = now - state.lastT;
      if (dt > 0.05) {
        const inst = (loadedBytes - state.lastBytes) / dt;
        state.rate = state.rate ? lerp01(state.rate, inst, 0.2) : inst;
        state.lastT = now;
        state.lastBytes = loadedBytes;
      }
    } else {
      state.lastT = now;
      state.lastBytes = loadedBytes;
    }
    state.target = clamp01(loadedBytes / totalBytes);
    if (meta.shard) state.shard = meta.shard;
  },
  info({ tensors, tensorsTotal } = {}) {
    if (tensors !== void 0) state.tensors = tensors;
    if (tensorsTotal !== void 0) state.tensorsTotal = tensorsTotal;
  },
  phase(text) {
    state.phaseOverride = text;
  },
  done() {
    state.externalDone = true;
    state.external = true;
    state.target = 1;
    state.phaseOverride = null;
  },
  onReady(fn) {
    readyCbs.push(fn);
  },
};

const shardOf = (f) => Math.min(SHARDS, 1 + Math.floor(clamp01(f / 0.9) * SHARDS));

function deriveStatus(f) {
  if (f >= 1) {
    return state.external ? "READY" : "READY — MODEL RESIDENT IN VRAM";
  }
  if (state.external) {
    return "STREAMING WEIGHTS → VRAM";
  }
  if (f > 0.985) return "ALLOCATING KV CACHE · WARMUP";
  if (f > 0.95) return "COMPILING WEBGPU KERNELS";
  if (f > 0.9) return "VERIFYING SHARD CHECKSUMS";
  if (f > 0.015) {
    return "STREAMING WEIGHTS — SHARD " + shardOf(f) + "/" + SHARDS;
  }
  return "REQUESTING MANIFEST";
}

function simulate() {
  let simBytes = 0,
    stallUntil = 0,
    prev = performance.now() / 1e3;
  const t0 = prev;
  const tick = () => {
    if (state.doneAt) return;
    const now = performance.now() / 1e3,
      t = now - t0;
    const dt = Math.min(now - prev, 0.25);
    prev = now;
    if (t > 0.7 && now > stallUntil) {
      if (Math.random() < 0.35 * dt) {
        stallUntil = now + 0.4 + Math.random() * 0.8;
      }
      const frac = simBytes / TOTAL_BYTES;
      const phaseMul = frac > 0.985 ? 0.1 : frac > 0.95 ? 0.16 : frac > 0.9 ? 0.35 : 1;
      const mbps = (150 + 55 * Math.sin(t * 0.5) + (Math.random() - 0.5) * 60) *
        phaseMul;
      simBytes = Math.min(TOTAL_BYTES, simBytes + mbps * 1e6 * SPEED * dt);
      BonsaiLoader.set(simBytes, TOTAL_BYTES);
      state.external = false;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

const byId = (id) => document.getElementById(id);

const el = {
  pct: byId("pct"),
  status: byId("status"),
  statA: byId("statA"),
  bar: byId("barFill"),
  prog: byId("uiLoad"),
};

const GB = (b) => (b / 1e9).toFixed(2);
const fmtEta = (s) => {
  if (!isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60),
    ss = Math.ceil(s % 60);
  return " · ETA " + m + ":" + String(ss).padStart(2, "0");
};

let lastDom = 0;
function updateDom(now) {
  if (now - lastDom < 0.12 && !state.doneAt) return;
  lastDom = now;
  const f = state.shown;
  const pctInt = state.doneAt ? 100 : Math.min(99, Math.floor(f * 100));
  el.pct.textContent = pctInt;
  el.prog.setAttribute("aria-valuenow", pctInt);
  el.bar.style.width = (f * 100).toFixed(1) + "%";
  el.status.textContent = state.phaseOverride ||
    deriveStatus(state.doneAt ? 1 : f);
  if (state.doneAt) {
    el.statA.textContent = state.external
      ? GB(state.totalBytes) + " GB RESIDENT IN VRAM"
      : GB(state.totalBytes) +
        " / " +
        GB(state.totalBytes) +
        " GB · " +
        SHARDS +
        "/" +
        SHARDS +
        " · COMPLETE";
  } else {
    const total = state.totalBytes;
    const bytes = f * total;
    const rate = state.rate > 1e5 ? " · " + Math.round(state.rate / 1e6) + " MB/S" : "";
    const eta = state.rate > 1e5 ? fmtEta((total - bytes) / state.rate) : "";
    const seg = state.external
      ? state.tensorsTotal ? " · TENSOR " + state.tensors + "/" + state.tensorsTotal : ""
      : " · SHARD " + (state.shard || shardOf(f)) + "/" + SHARDS;
    el.statA.textContent = GB(bytes) + " / " + GB(total) + " GB" + seg + rate + eta;
  }
}

function stepProgress(dt, now) {
  if (FREEZE !== null) {
    state.target = state.shown = FREEZE;
  } else {
    state.shown += (state.target - state.shown) * Math.min(1, dt * 3.2);
    if (state.target >= 0.9999 && state.shown > 0.9995) state.shown = 1;
  }
  if (
    state.shown >= 1 &&
    !state.doneAt &&
    (!state.external || state.externalDone)
  ) {
    state.doneAt = now;
    document.body.classList.add("done");
    for (const fn of readyCbs) fn();
  }
  return state.shown;
}

const START_STAGE = FREEZE !== null ||
    QS.has("az") ||
    QS.has("seed") ||
    QS.get("stage") === "loading"
  ? "loading"
  : "landing";

const App = {
  stage: START_STAGE,
  landingActive: START_STAGE === "landing",
  startGarden: null,
  _disposeLanding: null,
  go() {
    if (this.stage !== "landing") return;
    this.stage = "loading";
    document.body.classList.remove("stage-landing");
    document.body.classList.add("stage-loading");
    if (this.startGarden) this.startGarden();
    if (window.BonsaiApp) window.BonsaiApp.startLoad();
    if (FREEZE === null && QS.has("demo")) {
      setTimeout(() => {
        if (!state.external) simulate();
      }, 900);
    }
    setTimeout(() => {
      this.landingActive = false;
      if (this._disposeLanding) this._disposeLanding();
    }, 1600);
  },
  flatMode() {
    document.body.classList.add("flat", "ready", "spectrum", "stage-loading");
    document.body.classList.remove("stage-landing");
    let prev = performance.now() / 1e3;
    (function flatLoop() {
      requestAnimationFrame(flatLoop);
      const now = performance.now() / 1e3;
      const dt = Math.min(now - prev, 0.05);
      prev = now;
      stepProgress(dt, now);
      updateDom(now);
    })();
    if (window.BonsaiApp) window.BonsaiApp.startLoad();
    if (FREEZE === null && QS.has("demo")) {
      setTimeout(() => {
        if (!state.external) simulate();
      }, 700);
    }
  },
};

byId("loadCta").addEventListener("click", (e) => {
  e.preventDefault();
  App.go();
});

// ─── Public ESM surface ─────────────────────────────────────────────
//
// Anything in this list can be imported directly:
//   import { SEED, App, simulate } from "./loader.js";
//
// Window side effects below are kept for legacy callers that reach
// for window.SEED etc. without going through the module graph.

export {
  App,
  AZ_FIX,
  BonsaiLoader,
  byId,
  FREEZE,
  QS,
  REDUCED,
  SEED,
  SHARDS,
  simulate,
  SPEED,
  START_STAGE,
  state,
  stepProgress,
  TOTAL_BYTES,
  updateDom,
};

// ─── Window side effects (legacy compat) ────────────────────────────

if (typeof window !== "undefined") {
  window.SEED = SEED;
  window.FREEZE = FREEZE;
  window.REDUCED = REDUCED;
  window.AZ_FIX = AZ_FIX;
  window.START_STAGE = START_STAGE;
  window.QS = QS;
  window.state = state;
  window.byId = byId;
  window.simulate = simulate;
  window.stepProgress = stepProgress;
  window.updateDom = updateDom;
  window.SPEED = SPEED;
  window.App = App;
  window.BonsaiLoader = BonsaiLoader;
}
