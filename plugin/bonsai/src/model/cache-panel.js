import {
  clearModelCache,
  describeModelCache,
  requestPersistentModelCache,
} from "./cache-manager.js";

function byId(id) {
  return document.getElementById(id);
}

function setReport(text) {
  byId("cacheReport").textContent = text;
}

async function refresh() {
  try {
    setReport(await describeModelCache());
    byId("cacheSummary").textContent = "MODEL STORAGE ON THIS ORIGIN";
  } catch (error) {
    setReport(`Error: ${String(error?.message ?? error)}`);
    byId("cacheSummary").textContent = "MODEL STORAGE UNAVAILABLE";
  }
}

async function keepOffline() {
  const granted = await requestPersistentModelCache();
  await refresh();
  byId("cacheSummary").textContent = granted
    ? "OFFLINE RETENTION GRANTED"
    : "OFFLINE RETENTION NOT GRANTED";
}

async function deleteCache() {
  await clearModelCache();
  await refresh();
  byId("cacheSummary").textContent = "MODEL CACHE DELETED";
}

function run(button, action) {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      setReport(`Error: ${String(error?.message ?? error)}`);
    } finally {
      button.disabled = false;
    }
  });
}

export function setupModelCachePanel() {
  const overlay = byId("cacheOverlay");
  byId("cacheBtn").addEventListener("click", async () => {
    overlay.hidden = false;
    document.body.classList.add("kx-locked");
    await refresh();
  });
  overlay.addEventListener("click", (event) => {
    if (!event.target.closest("[data-cache-close]")) return;
    overlay.hidden = true;
    document.body.classList.remove("kx-locked");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      overlay.hidden = true;
      document.body.classList.remove("kx-locked");
    }
  });
  run(byId("cacheRefreshBtn"), refresh);
  run(byId("cachePersistBtn"), keepOffline);
  run(byId("cacheClearBtn"), deleteCache);
}
