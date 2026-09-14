import { mountTerminal, ghosttyIdentity } from "/plugin/terminal-mount.mjs";

const $ = (id) => document.getElementById(id);
const architecture = $("architecture");
const backendUrl = $("backendUrl");
const linuxUrl = $("linuxUrl");
const linuxFile = $("linuxFile");
const fileName = $("fileName");
const launch = $("launch");
const reset = $("reset");
const stop = $("stop");
const setup = $("setup");
const newInstanceTab = $("newInstanceTab");
const homeTab = $("homeTab");
const terminalPanel = $("terminalPanel");
const instanceTabs = $("instanceTabs");
const terminalStage = $("terminalStage");
const status = $("status");
const error = $("error");
const machineName = $("machineName");
const sourceName = $("sourceName");
const presets = {
  v86: {
    architecture: "v86",
    backend: "https://cdn.jsdelivr.net/gh/btwiuse/wanix-extras@v0.4.0-rc20/v86.tgz",
    image: "https://cdn.jsdelivr.net/gh/btwiuse/wanix-extras@v0.4.0-rc18/wanix-linux.tgz",
  },
  rv64: {
    architecture: "rv64",
    backend: "https://cdn.jsdelivr.net/gh/btwiuse/wanix-extras@v0.4.0-rc18/rv64.tgz",
    image: "https://cdn.jsdelivr.net/gh/btwiuse/wanix-extras@v0.4.0-rc18/wanix-linux-rv64.tgz",
  },
};

const VNET_URL = "wss://vnet.net.k0s.io/x/net";
const bootRc = { v86: "/plugin/v86/guest-boot-rc", rv64: "/plugin/rv64/guest-boot-rc" };
const postDhcp = { v86: "/plugin/v86/guest-post-dhcp", rv64: "/plugin/rv64/guest-post-dhcp" };
let handle = null;
let localPath = null;
let activeInstance = null;
let instanceCounter = 0;
const instances = new Map();

function applyPreset(name) {
  document.querySelectorAll(".preset").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });
  const preset = presets[name];
  if (!preset) {
    backendUrl.value = "";
    linuxUrl.value = "";
    linuxFile.value = "";
    fileName.textContent = "No local image selected";
    localPath = null;
    return;
  }
  architecture.value = preset.architecture;
  backendUrl.value = preset.backend;
  linuxUrl.value = preset.image;
  linuxFile.value = "";
  fileName.textContent = "Using preset remote image";
  localPath = null;
}

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
    netdev: `user,type=virtio,relay_url=${VNET_URL}`,
    bootRc: bootRc[config.architecture],
    postDhcp: postDhcp[config.architecture],
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
  setStatus(next.ready ? "ready" : "loading", next.ready ? "RUNNING" : "BOOTING LINUX");
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
    setStatus("idle", "CONFIGURE");
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
  const localUrl = source.kind === "local" ? URL.createObjectURL(source.file) : null;
  const id = `instance-${++instanceCounter}`;
  const host = document.createElement("div");
  host.className = "instance-host";
  const instance = { id, host, handle: null, localUrl, ready: false, label: `${architecture.value.toUpperCase()} #${instanceCounter}`, machine: `${architecture.options[architecture.selectedIndex].text} Linux`, source: source.kind === "local" ? source.file.name : source.url };
  instances.set(id, instance);
  setup.hidden = true;
  terminalPanel.hidden = false;
  activeInstance = id;
  terminalStage.replaceChildren(host);
  machineName.textContent = instance.machine;
  sourceName.textContent = instance.source;
  renderTabs();
  instance.handle = await mountTerminal(host, vmSession({ architecture: architecture.value, backend, image: localUrl || linuxUrl.value.trim() }), {
    ...ghosttyIdentity({ terminal: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, scrollback: 10000, theme: { background: "#080c12", foreground: "#e6edf3", cursor: "#60a5fa", selectionBackground: "#2563eb66" } } }),
    onData: () => { instance.ready = true; if (activeInstance === id) setStatus("ready", "RUNNING"); },
    onExit: (event) => { if (activeInstance === id) showError(event?.error || "The virtual machine stopped."); },
  });
  if (activeInstance === id) handle = instance.handle;
  setStatus("loading", "BOOTING LINUX");
  launch.disabled = false;
}

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});
applyPreset("v86");

linuxFile.addEventListener("change", () => {
  const file = linuxFile.files[0];
  fileName.textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "No local image selected";
  if (file) linuxUrl.value = "";
});
linuxUrl.addEventListener("input", () => { if (linuxUrl.value.trim()) linuxFile.value = ""; });
architecture.addEventListener("change", () => { localPath = null; });
launch.addEventListener("click", () => startVm().catch((reason) => { launch.disabled = false; setup.hidden = false; terminalPanel.hidden = true; showError(String(reason?.message || reason)); }));
stop.addEventListener("click", () => stopVm().catch((reason) => showError(String(reason?.message || reason))));
newInstanceTab.addEventListener("click", () => { setup.hidden = false; terminalPanel.hidden = true; homeTab.classList.add("active"); clearError(); setStatus("idle", "CONFIGURE"); renderTabs(); });
homeTab.addEventListener("click", () => { setup.hidden = false; terminalPanel.hidden = true; homeTab.classList.add("active"); renderTabs(); });
reset.addEventListener("click", () => { backendUrl.value = ""; linuxUrl.value = ""; linuxFile.value = ""; fileName.textContent = "No local image selected"; clearError(); });
