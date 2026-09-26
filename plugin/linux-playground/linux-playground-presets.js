import {
  DEFAULT_PROXY_URL,
  loadCustomPresets,
  presetGroups,
  presets,
  saveCustomPresets,
} from "/plugin/linux-playground/linux-playground-config.js";
function presetButton(preset, id, description, applyPreset) {
  const button = document.createElement("button");
  button.className = "preset";
  button.type = "button";
  button.dataset.preset = id;
  const title = document.createElement("strong");
  title.textContent = preset.label || preset.name;
  const detail = document.createElement("span");
  detail.textContent = description;
  button.replaceChildren(title, detail);
  button.addEventListener("click", () => applyPreset(id));
  return button;
}

function renderBuiltInPresets(element, applyPreset) {
  element.replaceChildren(...presetGroups.map((group) => {
    const section = document.createElement("section");
    section.className = "preset-group";
    const title = document.createElement("div");
    title.className = "section-label";
    title.textContent = group.title;
    const grid = document.createElement("div");
    grid.className = "preset-grid";
    grid.replaceChildren(...Object.entries(presets)
      .filter(([, preset]) => preset.group === group.id)
      .map(([id, preset]) => presetButton(preset, id, preset.profile, applyPreset)));
    section.replaceChildren(title, grid);
    return section;
  }));
}

function renderSavedPresets(element, savedPresets, applyPreset) {
  element.replaceChildren(...savedPresets.map((preset) =>
    presetButton(preset, preset.id, "Saved custom preset", applyPreset)));
}

function setPresetFields(preset, controls) {
  const { backendUrl, linuxUrl, kernelArchiveUrl, overlayUrl, proxyUrl, linuxFile, fileName, setArchitecture, setMemory, setActiveSource, setRootfsSource } = controls;
  if (!preset) {
    backendUrl.value = "";
    linuxUrl.value = "";
    kernelArchiveUrl.value = "";
    overlayUrl.value = "";
    linuxFile.value = "";
    fileName.textContent = "No local image selected";
    setActiveSource("none");
    return;
  }
  setArchitecture(preset.architecture);
  setRootfsSource("url");
  backendUrl.value = preset.backend;
  linuxUrl.value = preset.image;
  kernelArchiveUrl.value = preset.kernelArchive || "";
  overlayUrl.value = preset.overlay || "";
  proxyUrl.value = preset.proxyUrl || DEFAULT_PROXY_URL;
  setMemory(Number.parseInt(preset.memory, 10) || 0);
  linuxFile.value = "";
  fileName.textContent = "Preparing preset image…";
  setActiveSource("url");
}

function updateImageStatus(preset, proxiedUrl, downloads, fileName) {
  if (!preset) return;
  const url = proxiedUrl(preset.image);
  downloads.show(url);
  downloads.load(url).then((archive) => {
    fileName.textContent = `Preset cached · ${(archive.size / 1048576).toFixed(1)} MB`;
  }).catch(() => {});
}

export function initPresetLibrary(controls) {
  const { presetGroupsElement, customPresetsElement, proxyUrl, fileName, refreshBootRcText, refreshPostDhcpText, onPresetChange, downloads } = controls;
  let savedPresets = loadCustomPresets();
  const preloadImage = (url) => downloads.load(url);
  const proxiedUrl = (url) => proxyUrl.value.trim() ? `${proxyUrl.value.trim()}${url}` : url;
  const applyPreset = (name) => {
    document.querySelectorAll(".preset").forEach((button) => button.classList.toggle("active", button.dataset.preset === name));
    const preset = presets[name] || savedPresets.find((item) => item.id === name) || null;
    onPresetChange(preset, name);
    refreshBootRcText();
    refreshPostDhcpText();
    setPresetFields(preset, controls);
    updateImageStatus(preset, proxiedUrl, downloads, fileName);
  };
  const renderCustomPresets = () => renderSavedPresets(customPresetsElement, savedPresets, applyPreset);
  return {
    applyPreset,
    preloadImage,
    proxiedUrl,
    renderGroups: () => renderBuiltInPresets(presetGroupsElement, applyPreset),
    renderCustomPresets,
    savePreset: (preset) => {
      savedPresets = [...savedPresets, preset];
      saveCustomPresets(savedPresets);
      renderCustomPresets();
    },
  };
}
