function storageKey(script, presetName) {
  return `linux-playground:${script}-edit:${presetName}`;
}

function loadScript(script, presetName) {
  try {
    return localStorage.getItem(storageKey(script, presetName));
  } catch {
    return null;
  }
}

function saveScript(script, presetName, content) {
  try {
    localStorage.setItem(storageKey(script, presetName), content);
  } catch {}
}

function clearScript(script, presetName) {
  try {
    localStorage.removeItem(storageKey(script, presetName));
  } catch {}
}

async function loadDefault(textarea, url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    textarea.value = response.ok
      ? await response.text()
      : `# HTTP ${response.status} fetching ${url}`;
  } catch (error) {
    textarea.value = `# Failed to fetch ${url}\n# ${error.message}`;
  }
}

export function initScriptEditors({
  bootRcText,
  postDhcpText,
  resetBootRc,
  resetPostDhcp,
  getPresetName,
  getBootRcUrl,
  getPostDhcpUrl,
}) {
  const refresh = async (script, textarea, url) => {
    const presetName = getPresetName() || "default";
    const saved = loadScript(script, presetName);
    if (saved !== null) {
      textarea.value = saved;
      return;
    }
    await loadDefault(textarea, url());
  };
  const refreshBootRcText = () => refresh("boot-rc", bootRcText, getBootRcUrl);
  const refreshPostDhcpText = () => refresh("post-dhcp", postDhcpText, getPostDhcpUrl);

  bootRcText.addEventListener("input", () => {
    const presetName = getPresetName();
    if (presetName) saveScript("boot-rc", presetName, bootRcText.value);
  });
  postDhcpText.addEventListener("input", () => {
    const presetName = getPresetName();
    if (presetName) saveScript("post-dhcp", presetName, postDhcpText.value);
  });
  resetBootRc.addEventListener("click", async () => {
    const presetName = getPresetName();
    if (presetName) clearScript("boot-rc", presetName);
    await refreshBootRcText();
  });
  resetPostDhcp.addEventListener("click", async () => {
    const presetName = getPresetName();
    if (presetName) clearScript("post-dhcp", presetName);
    await refreshPostDhcpText();
  });

  return { refreshBootRcText, refreshPostDhcpText, saveScriptEdit: saveScript };
}
