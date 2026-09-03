import { getToolSettings, setToolEnabled } from "./tools.js";

function byId(id) {
  return document.getElementById(id);
}

function render() {
  const list = byId("toolsList");
  list.replaceChildren();
  for (const tool of getToolSettings()) {
    const label = document.createElement("label");
    label.className = "tool-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = tool.enabled;
    input.addEventListener("change", () => {
      setToolEnabled(tool.name, input.checked);
      render();
    });
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = tool.name;
    const description = document.createElement("span");
    description.textContent = tool.description;
    copy.append(name, description);
    label.append(input, copy);
    list.appendChild(label);
  }
}

export function setupToolsPanel() {
  const overlay = byId("toolsOverlay");
  byId("toolsBtn").addEventListener("click", () => {
    render();
    overlay.hidden = false;
    document.body.classList.add("kx-locked");
  });
  overlay.addEventListener("click", (event) => {
    if (!event.target.closest("[data-tools-close]")) return;
    overlay.hidden = true;
    document.body.classList.remove("kx-locked");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      overlay.hidden = true;
      document.body.classList.remove("kx-locked");
    }
  });
}
