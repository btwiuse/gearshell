import { mountTerminal, ghosttyProgressIdentity, progressIndicator } from "/plugin/terminal-mount.mjs";
import { clampMemory, DEFAULT_PROXY_URL, memoryFromSlider, presets, sliderFromMemory } from "/plugin/linux-playground/linux-playground-config.js";
import { createImageDownloadManager } from "/plugin/linux-playground/linux-image-downloads.js";
import { initPresetLibrary } from "/plugin/linux-playground/linux-playground-presets.js";
import { initScriptEditors } from "/plugin/linux-playground/linux-playground-scripts.js";

const $ = (id) => document.getElementById(id);
// Architecture radios (replaces the legacy <select>); all radios share
// name="architecture" so getArchitecture() returns the currently checked one.
const architectureInputs = document.querySelectorAll('input[name="architecture"]');
const getArchitecture = () => {
  for (const input of architectureInputs) if (input.checked) return input;
  return architectureInputs[0];
};
const setArchitecture = (value) => {
  for (const input of architectureInputs) input.checked = input.value === value;
};
const backendUrl = $("backendUrl");
const linuxUrl = $("linuxUrl");
const imageDownload = $("imageDownload");
const proxyUrl = $("proxyUrl");
const memory = $("memory");
const memoryInput = $("memoryInput");
const memoryValue = $("memoryValue");
const presetName = $("presetName");
const savePreset = $("savePreset");
const presetGroups = $("presetGroups");
const customPresets = $("customPresets");
const linuxFile = $("linuxFile");
const fileName = $("fileName");
const launch = $("launch");
const reset = $("reset");
const stop = $("stop");
const clearCache = $("clearCache");
const extraArgs = $("extraArgs");
const bootRcText = $("bootRc");
const postDhcpText = $("postDhcp");
const resetBootRc = $("resetBootRc");
const resetPostDhcp = $("resetPostDhcp");

// Linux-image source pair: each field has its own id (set in HTML) so
// dim is applied directly. CSS owns the visual; JS only toggles the
// data-active-dimmed attribute so the active field stays full opacity.
const linuxUrlField = $("linuxUrlField");
const linuxFileField = $("linuxFileField");

function setActiveSource(kind) {
  // kind: "url" | "file" | "none"
  linuxUrlField.toggleAttribute("data-active-dimmed", kind === "file");
  linuxFileField.toggleAttribute("data-active-dimmed", kind === "url");
}

/* Replace the launch button's leading text node (the arrow <span>
   stays put). aria-busy tracks whether the button is mid-transition so
   assistive tech announces the state change. */
function updateLaunchLabel(text) {
  const first = launch.firstChild;
  if (first && first.nodeType === Node.TEXT_NODE) {
    first.nodeValue = text + " ";
  } else {
    launch.prepend(document.createTextNode(text + " "));
  }
  if (text === "LAUNCH PLAYGROUND") launch.removeAttribute("aria-busy");
  else launch.setAttribute("aria-busy", "true");
}

const setup = $("setup");
const newInstanceTab = $("newInstanceTab");
const homeTab = $("homeTab");
const terminalPanel = $("terminalPanel");
const terminalProgress = $("terminalProgress");
const instanceTabs = $("instanceTabs");
const terminalStage = $("terminalStage");
const status = $("status");
const error = $("error");
const machineName = $("machineName");
const sourceName = $("sourceName");
const VNET_URL = "wss://vnet.net.k0s.io/x/net";
const bootRcDefaults = { v86: "/plugin/v86/guest-boot-rc", rv64: "/plugin/rv64/guest-boot-rc" };
const postDhcpDefaults = { v86: "/plugin/v86/guest-post-dhcp", rv64: "/plugin/rv64/guest-post-dhcp" };
let handle = null;
let activeInstance = null;
let activePreset = presets.v86;
let activePresetName = "v86";
let instanceCounter = 0;
const instances = new Map();
const observeTerminalProgress = progressIndicator(terminalProgress);
const { refreshBootRcText, refreshPostDhcpText, saveScriptEdit } = initScriptEditors({
  bootRcText,
  postDhcpText,
  resetBootRc,
  resetPostDhcp,
  getPresetName: () => activePresetName,
  getBootRcUrl: () => activePreset?.bootRc || bootRcDefaults[activePreset?.architecture] || bootRcDefaults.rv64,
  getPostDhcpUrl: () => activePreset?.postDhcp || postDhcpDefaults[activePreset?.architecture] || postDhcpDefaults.rv64,
});

function memoryInMiB() {
  return clampMemory(memoryInput.value);
}

function updateMemoryValue() {
  const value = memoryInMiB();
  memoryInput.value = value;
  memory.value = sliderFromMemory(value);
  memoryValue.textContent = `${value} MiB`;
}

function setMemory(value) {
  memoryInput.value = Number.parseInt(value, 10) || 0;
  updateMemoryValue();
}

const downloads = createImageDownloadManager(imageDownload);
const presetLibrary = initPresetLibrary({
  presetGroupsElement: presetGroups,
  customPresetsElement: customPresets,
  backendUrl,
  linuxUrl,
  proxyUrl,
  linuxFile,
  fileName,
  setArchitecture,
  setMemory,
  setActiveSource,
  updateLaunchLabel,
  downloads,
  refreshBootRcText,
  refreshPostDhcpText,
  onPresetChange: (preset, name) => {
    activePreset = preset;
    activePresetName = name;
  },
});
const { applyPreset, preloadImage, proxiedUrl, renderGroups, renderCustomPresets, savePreset: persistPreset } = presetLibrary;

function setStatus(mode, text) {
  status.dataset.mode = mode;
  status.textContent = text;
}

function showError(message) {
  error.hidden = false;
  error.textContent = message;
  setStatus("error", "ERROR");
}

function clearError() {
  error.hidden = true;
  error.textContent = "";
}

function selectedSource() {
  if (linuxFile.files[0]) return { kind: "local", file: linuxFile.files[0] };
  const url = linuxUrl.value.trim();
  if (url) return { kind: "remote", url };
  throw new Error("Choose a local Linux image or enter a remote image URL.");
}


function vmSession(config) {
  const session = { create: () => GearShell.vm.create({
    type: config.architecture,
    backendUrl: config.backend,
    linuxUrl: config.image,
    memory: config.memory,
    append: config.append,
    netdev: `user,type=virtio,relay_url=${VNET_URL}`,
    bootRc: bootRcText.value.trim()
      ? `data:text/plain;base64,${btoa(bootRcText.value)}`
      : (config.bootRc || bootRcDefaults[config.architecture] || bootRcDefaults.rv64),
    postDhcp: postDhcpText.value.trim()
      ? `data:text/plain;base64,${btoa(postDhcpText.value)}`
      : (config.postDhcp || postDhcpDefaults[config.architecture] || postDhcpDefaults.rv64),
  }) };
  return {
    create: session.create,
    write: (id, data) => GearShell.terminal.write(id, data),
    resize: (id, cols, rows, width, height) => GearShell.terminal.resize(id, cols, rows, width, height),
    dispose: (id) => GearShell.terminal.dispose(id),
    onOutput: (id, callback) => {
      const listener = (payload) => { if (payload?.sessionId === id) callback(payload.data); };
      GearShell.on("term.data", listener);
      return () => GearShell.off("term.data", listener);
    },
    onExit: (id, callback) => {
      const listener = (payload) => { if (payload?.sessionId === id) callback(payload); };
      GearShell.on("term.exit", listener);
      return () => GearShell.off("term.exit", listener);
    },
  };
}

function makeInstanceTab(instance, className) {
  const tab = document.createElement("button");
  tab.className = className + (instance.id === activeInstance ? " active" : "");
  tab.type = "button";
  tab.textContent = instance.label;
  tab.addEventListener("click", () => switchInstance(instance.id));
  return tab;
}

function renderTabs() {
  const active = [...instances.values()];
  instanceTabs.replaceChildren(...active.map((instance) => makeInstanceTab(instance, "instance-tab")));
  newInstanceTab.disabled = active.length >= 8;
}

function switchInstance(id) {
  const next = instances.get(id);
  if (!next) return;
  activeInstance = id;
  setup.hidden = true;
  terminalPanel.hidden = false;
  homeTab.classList.remove("active");
  terminalStage.replaceChildren(next.host);
  handle = next.handle;
  machineName.textContent = next.machine;
  sourceName.textContent = next.source;
  setStatus(next.ready ? "ready" : "loading", next.ready ? "RUNNING" : "STARTING");
  renderTabs();
}

async function stopVm() {
  const instance = instances.get(activeInstance);
  if (!instance) return;
  await instance.handle?.dispose?.();
  if (instance.localUrl) URL.revokeObjectURL(instance.localUrl);
  instances.delete(instance.id);
  const next = instances.values().next().value;
  if (next) switchInstance(next.id);
  else {
    activeInstance = null;
    handle = null;
    terminalPanel.hidden = true;
    setup.hidden = false;
    setStatus("idle", "READY TO CONFIGURE");
  }
  renderTabs();
}

async function startVm() {
  clearError();
  const backend = backendUrl.value.trim();
  if (!backend) throw new Error("Enter the emulator backend URL.");
  const source = selectedSource();
  setStatus("loading", "PREPARING IMAGE");
  launch.disabled = true;
  updateLaunchLabel("PREPARING IMAGE");
  const archive = source.kind === "local" ? source.file : await preloadImage(proxiedUrl(source.url));
  const localUrl = URL.createObjectURL(archive);
  const id = `instance-${++instanceCounter}`;
  const host = document.createElement("div");
  host.className = "instance-host";
  const instance = { id, host, handle: null, localUrl, ready: false, label: `${getArchitecture().value.toUpperCase()} #${instanceCounter}`, machine: `${getArchitecture().dataset.label} Linux`, source: source.kind === "local" ? source.file.name : source.url };
  instances.set(id, instance);
  setup.hidden = true;
  terminalPanel.hidden = false;
  activeInstance = id;
  terminalStage.replaceChildren(host);
  machineName.textContent = instance.machine;
  sourceName.textContent = instance.source;
  renderTabs();
  updateLaunchLabel("LAUNCHING…");
  instance.handle = await mountTerminal(host, vmSession({
        architecture: getArchitecture().value,
        backend: proxiedUrl(backend),
        image: localUrl || linuxUrl.value.trim(),
        memory: `${memoryInMiB()}M`,
        append: [activePreset?.append, extraArgs.value.trim()].filter((s) => s && s.length > 0).join(" "),
      }), {
    ...ghosttyProgressIdentity({ terminal: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, scrollback: 10000, theme: { background: "#080c12", foreground: "#e6edf3", cursor: "#60a5fa", selectionBackground: "#2563eb66" } } }),
    onData: () => { instance.ready = true; if (activeInstance === id) setStatus("ready", "RUNNING"); },
    onExit: (event) => { if (activeInstance === id) showError(event?.error || "The virtual machine stopped."); },
    onProgress: (data) => { if (activeInstance === id) observeTerminalProgress(data); },
  });
  if (activeInstance === id) handle = instance.handle;
  setStatus("loading", "STARTING");
  updateLaunchLabel("LAUNCH PLAYGROUND");
  launch.disabled = false;
}

renderGroups();
renderCustomPresets();
applyPreset("v86-minimal");

linuxFile.addEventListener("change", () => {
  const file = linuxFile.files[0];
  fileName.textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "No local image selected";
  if (file) {
    linuxUrl.value = "";
    activePreset = null;
    setActiveSource("file");
  } else {
    setActiveSource("none");
  }
});
linuxUrl.addEventListener("input", () => {
  const url = linuxUrl.value.trim();
  if (url) {
    linuxFile.value = "";
    activePreset = null;
    setActiveSource("url");
    downloads.show(proxiedUrl(url));
  } else {
    imageDownload.hidden = true;
    setActiveSource("none");
  }
});
linuxUrl.addEventListener("change", () => {
  const url = linuxUrl.value.trim();
  if (!url) return;
  fileName.textContent = "Preparing remote image…";
  downloads.show(proxiedUrl(url));
  preloadImage(proxiedUrl(url)).then((archive) => {
    fileName.textContent = `Image cached · ${(archive.size / 1048576).toFixed(1)} MB`;
  }).catch((reason) => {
    fileName.textContent = `Image download failed: ${String(reason?.message || reason)}`;
  });
});
for (const input of architectureInputs) {
  input.addEventListener("change", () => { activePreset = null; });
}
memory.addEventListener("input", () => {
  memoryInput.value = memoryFromSlider(memory.value);
  updateMemoryValue();
});
memoryInput.addEventListener("input", updateMemoryValue);
memoryInput.addEventListener("change", updateMemoryValue);
savePreset.addEventListener("click", () => {
  const name = presetName.value.trim();
  const backend = backendUrl.value.trim();
  const image = linuxUrl.value.trim();
  if (!name || !backend || !image) {
    showError("Name, emulator backend URL, and Linux image URL are required to save a preset.");
    return;
  }
  const id = `custom-${crypto.randomUUID()}`;
  persistPreset({
    id,
    name,
    architecture: getArchitecture().value,
    backend,
    image,
    proxyUrl: proxyUrl.value.trim(),
    memory: `${memoryInMiB()}M`,
    append: extraArgs.value.trim(),
    bootRc: null,
    postDhcp: null,
  });
  saveScriptEdit("boot-rc", id, bootRcText.value);
  saveScriptEdit("post-dhcp", id, postDhcpText.value);
  presetName.value = "";
  renderCustomPresets();
  applyPreset(id);
});
launch.addEventListener("click", () => startVm().catch((reason) => {
  launch.disabled = false;
  updateLaunchLabel("LAUNCH PLAYGROUND");
  setup.hidden = false;
  terminalPanel.hidden = true;
  showError(String(reason?.message || reason));
}));
stop.addEventListener("click", () => stopVm().catch((reason) => showError(String(reason?.message || reason))));
newInstanceTab.addEventListener("click", () => { setup.hidden = false; terminalPanel.hidden = true; homeTab.classList.add("active"); clearError(); setStatus("idle", "READY TO CONFIGURE"); renderTabs(); });
homeTab.addEventListener("click", () => { setup.hidden = false; terminalPanel.hidden = true; homeTab.classList.add("active"); renderTabs(); });
reset.addEventListener("click", () => { backendUrl.value = ""; linuxUrl.value = ""; proxyUrl.value = DEFAULT_PROXY_URL; setMemory(1024); linuxFile.value = ""; fileName.textContent = "No local image selected"; clearError(); setActiveSource("none"); });


// Debug utility: drop the IndexedDB archive cache (Linux images keyed
// by URL) so the next preset / launch re-fetches. The in-memory
// imageLoads Map and wanix bind archive caches reset naturally on
// reload / next VM create.
clearCache.addEventListener("click", () => {
  if (clearCache.disabled) return;
  const original = clearCache.textContent;
  clearCache.disabled = true;
  clearCache.textContent = "CLEARING…";
  const finish = (text, ok) => {
    clearCache.textContent = text;
    clearCache.disabled = false;
    clearCache.classList.toggle("link-button-error", !ok);
    setTimeout(() => {
      clearCache.textContent = original;
      clearCache.classList.remove("link-button-error");
    }, 1800);
  };
  if (!globalThis.indexedDB) { finish("NO INDEXEDDB", false); return; }
  const request = indexedDB.deleteDatabase("gearshell-linux-images");
  let settled = false;
  const done = (ok) => {
    if (settled) return;
    settled = true;
    finish(ok ? "CACHE CLEARED" : "CLEAR FAILED", ok);
  };
  request.onsuccess = () => done(true);
  request.onerror = () => done(false);
  // onblocked fires when another tab / worker still holds the DB open;
  // surface that to the user instead of silently hanging.
  request.onblocked = () => { clearCache.textContent = "CLOSE OTHER TABS"; };
});

/* Cmd/Ctrl+Enter fires LAUNCH from any field in the form. The shortcut is
   intentional and additive — it does not block native form submission
   (there is no <form> here, just buttons). */
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (!launch.disabled) launch.click();
  }
});
