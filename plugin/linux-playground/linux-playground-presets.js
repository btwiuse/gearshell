import {
  DEFAULT_PROXY_URL,
  loadCustomPresets,
  presetGroups,
  presets,
  saveCustomPresets,
} from "/plugin/linux-playground/linux-playground-config.js";
import { loadLinuxArchive } from "/plugin/linux-playground/linux-image-cache.js";

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

function createImageLoader({ fileName, launch, updateLaunchLabel }) {
  const imageLoads = new Map();
  return (url) => {
    let load = imageLoads.get(url);
    if (load) return load;
    load = loadLinuxArchive(url, ({ cached, loaded, total }) => {
      const progress = total
        ? `${(loaded / total * 100).toFixed(0)}%`
        : `${(loaded / 1048576).toFixed(1)} MB`;
      fileName.textContent = cached
        ? `Preset cached · ${(loaded / 1048576).toFixed(1)} MB`
        : `Downloading preset · ${progress}`;
      if (!cached && launch.disabled) {
        updateLaunchLabel(total ? `LOADING ${Math.round((loaded / total) * 100)}%` : "DOWNLOADING…");
      }
    });
    imageLoads.set(url, load);
    load.catch(() => imageLoads.delete(url));
    return load;
  };
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
      .filter(([, preset]) => preset.architecture === group.architecture)
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
  const { backendUrl, linuxUrl, proxyUrl, linuxFile, fileName, setArchitecture, setMemory, setActiveSource } = controls;
  if (!preset) {
    backendUrl.value = "";
    linuxUrl.value = "";
    linuxFile.value = "";
    fileName.textContent = "No local image selected";
    setActiveSource("none");
    return;
  }
  setArchitecture(preset.architecture);
  backendUrl.value = preset.backend;
  linuxUrl.value = preset.image;
  proxyUrl.value = preset.proxyUrl || DEFAULT_PROXY_URL;
  setMemory(Number.parseInt(preset.memory, 10) || 0);
  linuxFile.value = "";
  fileName.textContent = "Preparing preset image…";
  setActiveSource("url");
}

function updateImageStatus(preset, proxiedUrl, preloadImage, fileName) {
  if (!preset) return;
  preloadImage(proxiedUrl(preset.image)).then((archive) => {
    fileName.textContent = `Preset cached · ${(archive.size / 1048576).toFixed(1)} MB`;
  }).catch((reason) => {
    fileName.textContent = `Preset download failed: ${String(reason?.message || reason)}`;
  });
}

export function initPresetLibrary(controls) {
  const { presetGroupsElement, customPresetsElement, proxyUrl, fileName, launch, updateLaunchLabel, refreshBootRcText, refreshPostDhcpText, onPresetChange } = controls;
  let savedPresets = loadCustomPresets();
  const preloadImage = createImageLoader({ fileName, launch, updateLaunchLabel });
  const proxiedUrl = (url) => proxyUrl.value.trim() ? `${proxyUrl.value.trim()}${url}` : url;
  const applyPreset = (name) => {
    document.querySelectorAll(".preset").forEach((button) => button.classList.toggle("active", button.dataset.preset === name));
    const preset = presets[name] || savedPresets.find((item) => item.id === name) || null;
    onPresetChange(preset, name);
    refreshBootRcText();
    refreshPostDhcpText();
    setPresetFields(preset, controls);
    updateImageStatus(preset, proxiedUrl, preloadImage, fileName);
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
