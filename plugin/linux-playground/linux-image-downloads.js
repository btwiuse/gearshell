import { deleteLinuxArchive, loadLinuxArchive } from "/plugin/linux-playground/linux-image-cache.js";

function formatBytes(bytes) {
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / 1048576).toFixed(1)} MiB`;
}

function statusText(state) {
  if (state.status === "cached") return `Cached · ${formatBytes(state.loaded)}`;
  if (state.status === "loading") {
    const progress = state.total ? ` · ${Math.round(state.loaded / state.total * 100)}%` : "";
    return `Downloading ${formatBytes(state.loaded)}${progress}`;
  }
  if (state.status === "cancelled") return "Download cancelled. Resume restarts the download.";
  return state.error || "Ready to download";
}

function render(state, element) {
  element.hidden = !state.url;
  element.dataset.url = state.url || "";
  element.dataset.status = state.status;
  element.querySelector(".image-download-url").textContent = state.url || "";
  element.querySelector(".image-download-status").textContent = statusText(state);
  const progress = element.querySelector("progress");
  progress.value = state.total ? state.loaded / state.total : 0;
  progress.toggleAttribute("data-indeterminate", state.status === "loading" && !state.total);
  const cancel = element.querySelector("[data-download-action=cancel]");
  const resume = element.querySelector("[data-download-action=resume]");
  if (cancel) cancel.hidden = state.status !== "loading";
  if (resume) resume.hidden = state.status === "loading";
}

function stateFor(states, url) {
  let state = states.get(url);
  if (!state) {
    state = { url, status: "ready", loaded: 0, total: 0, controller: null, promise: null, archive: null, error: "" };
    states.set(url, state);
  }
  return state;
}

function resetForLoad(state) {
  state.controller?.abort();
  state.controller = new AbortController();
  state.status = "loading";
  state.loaded = 0;
  state.total = 0;
  state.error = "";
}

function startLoad(state, refresh, renderState) {
  state.promise = loadLinuxArchive(state.url, {
    refresh,
    signal: state.controller.signal,
    onProgress: ({ cached, loaded, total }) => {
      state.status = cached ? "cached" : "loading";
      state.loaded = loaded;
      state.total = total;
      renderState(state);
    },
  }).then((archive) => {
    state.archive = archive;
    state.status = "cached";
    state.loaded = archive.size;
    state.total = archive.size;
    return archive;
  }).catch((error) => {
    state.status = error?.name === "AbortError" ? "cancelled" : "error";
    state.error = state.status === "error" ? String(error?.message || error) : "";
    throw error;
  }).finally(() => {
    state.controller = null;
    state.promise = null;
    renderState(state);
  });
  return state.promise;
}

function bindActions(element, getManager) {
  element.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.downloadAction;
    const url = element.dataset.url;
    if (!action || !url) return;
    const manager = getManager();
    if (action === "cancel") manager.cancel(url);
    if (action === "resume") manager.load(url).catch(() => {});
    if (action === "refresh") manager.refresh(url).catch(() => {});
  });
}

export function createImageDownloadManager(element) {
  const states = new Map();
  const renderState = (state) => render(state, element);
  const load = (url, { refresh = false } = {}) => {
    const state = stateFor(states, url);
    if (state.promise && !refresh) return state.promise;
    if (refresh) state.archive = null;
    resetForLoad(state);
    renderState(state);
    return startLoad(state, refresh, renderState);
  };
  const cancel = (url) => stateFor(states, url).controller?.abort();
  const refresh = async (url) => {
    cancel(url);
    await deleteLinuxArchive(url);
    return load(url, { refresh: true });
  };
  const manager = { cancel, load, refresh, show: (url) => renderState(stateFor(states, url)) };
  bindActions(element, () => manager);
  return manager;
}
