function prepareVmSource(deps, source) {
  const archive = source.kind === "oci"
    ? null
    : source.kind === "local"
      ? source.file
      : deps.preloadImage(deps.proxiedUrl(source.url));
  const kernelArchiveSource = deps.kernelArchiveUrl.value.trim();
  const overlaySource = deps.overlayUrl.value.trim();
  return Promise.all([
    archive,
    deps.preloadResource(deps.kernelDownloads, kernelArchiveSource),
    deps.preloadResource(deps.overlayDownloads, overlaySource),
  ]).then(([image]) => ({
    localUrl: image ? URL.createObjectURL(image) : null,
    kernelArchive: kernelArchiveSource ? deps.proxiedResourceUrl(kernelArchiveSource) : undefined,
    overlay: overlaySource ? deps.proxiedResourceUrl(overlaySource) : undefined,
  }));
}

function buildVmConfig(deps, backend, source, prepared) {
  const architecture = deps.getArchitecture().value;
  return {
    architecture,
    backend: deps.proxiedUrl(backend),
    image: prepared.localUrl || deps.linuxUrl.value.trim(),
    rootfs: source.kind === "oci"
      ? { type: "oci", src: source.image, platform: architecture === "rv64" ? "linux/riscv64" : "linux/386" }
      : undefined,
    overlay: prepared.overlay,
    kernelArchive: prepared.kernelArchive,
    memory: `${deps.memoryInMiB()}M`,
    append: [deps.activePreset()?.append, deps.extraArgs.value.trim()].filter((value) => value && value.length > 0).join(" "),
  };
}

function terminalOptions(deps, instance) {
  return {
    ...deps.ghosttyIdentity({ terminal: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace", fontSize: 13, lineHeight: 1.25, scrollback: 10000, theme: { background: "#080c12", foreground: "#e6edf3", cursor: "#60a5fa", selectionBackground: "#2563eb66" } } }),
    onData: () => { instance.ready = true; if (deps.activeInstance() === instance.id) deps.setStatus("ready", "RUNNING"); },
    onExit: (event) => { if (deps.activeInstance() === instance.id) deps.showError(event?.error || "The virtual machine stopped."); },
    onProgress: (data) => { if (deps.activeInstance() === instance.id) deps.observeTerminalProgress(data); },
  };
}

function finishLaunch(deps) {
  deps.setStatus("loading", "STARTING");
  deps.updateLaunchLabel("LAUNCH PLAYGROUND");
  deps.launch.disabled = false;
}

export function createVmLauncher(deps) {
  return async function startVm() {
    deps.clearError();
    const backend = deps.backendUrl.value.trim();
    if (!backend) throw new Error("Enter the emulator backend URL.");
    const source = deps.selectedSource();
    deps.setStatus("loading", "PREPARING IMAGE");
    deps.launch.disabled = true;
    deps.updateLaunchLabel("PREPARING IMAGE");
    const prepared = await prepareVmSource(deps, source);
    const instance = deps.createVmInstance(source, prepared.localUrl);
    deps.showVmInstance(instance);
    deps.updateLaunchLabel("LAUNCHING…");
    instance.handle = await deps.mountTerminal(instance.host, deps.vmSession(buildVmConfig(deps, backend, source, prepared)), terminalOptions(deps, instance));
    if (deps.activeInstance() === instance.id) deps.setHandle(instance.handle);
    finishLaunch(deps);
  };
}
