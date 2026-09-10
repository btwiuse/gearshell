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

// Returns false when no GearShell host is available — there's no bash
// surface to dispatch to, so tool toggles are meaningless and the UI
// entry point should be hidden. Standalone deployment at
// https://gear.sh/plugin/bonsai/buildless.html hits this path.
function hasDispatchableHost() {
  return typeof window !== "undefined" &&
    typeof window.GearShell?.bash?.run === "function";
}

export function setupToolsPanel() {
  // Standalone / no-host: hide the Tools button entirely. The overlay
  // stays in the DOM (display:none via the button being absent is enough)
  // but no listener is attached, so it can't be opened.
  const btn = byId("toolsBtn");
  const overlay = byId("toolsOverlay");
  if (!hasDispatchableHost()) {
    if (btn) btn.hidden = true;
    return;
  }
  btn.addEventListener("click", () => {
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
