// files-registry.js — dependency-injection shim and dockview panel
// registration for the Files panel. Split out of files.js so the panel
// module stays under the 500-line rule.
//
// app.js calls `initFiles(dependencies)` from the bottom of its module
// body, populating a small lookup table that the panel modules read
// lazily via `filesDep(name)`.
import { WORKSPACE_CHANGED_EVENT } from "../../app-constants.js?v=20260828.61";
import { nextPanelIndex } from "../../app-panel-ids.js?v=20260828.76";

let __filesDeps = null;
export function initFiles(dependencies) {
  __filesDeps = dependencies;
  // Re-apply the keep-alive renderer whenever the shell config changes
  // (the background-playback toggle lives there), including panels that
  // are already open.
  window.addEventListener(WORKSPACE_CHANGED_EVENT, applyFilesRenderer);
}
export function filesDep(name) {
  if (__filesDeps == null) {
    throw new Error(
      "files: initFiles() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __filesDeps[name];
  if (value === undefined) {
    throw new Error(`files: missing dependency ${name}`);
  }
  return value;
}

// === Panel registration ===

// Open Files panels, kept so a config change can flip their renderer
// mode live. Pruned when a panel reports its own removal.
const openFilesPanels = new Set();

// dockview's default renderer ('onlyWhenVisible') removes a hidden
// panel's DOM, which unmounts the React tree and kills any playing
// media. 'always' keeps the DOM alive (visibility: hidden) so audio
// keeps playing when the user switches tabs.
function backgroundPlaybackAllowed() {
  try {
    return filesDep("loadConfig")()?.allowBackgroundPlayback !== false;
  } catch {
    return true;
  }
}

export function applyFilesRenderer() {
  const renderer = backgroundPlaybackAllowed() ? "always" : "onlyWhenVisible";
  for (const panel of openFilesPanels) {
    try {
      panel.api.setRenderer(renderer);
    } catch {
      // panel was removed; drop it so the next pass is clean
      openFilesPanels.delete(panel);
    }
  }
}

// Register a new Files panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Files from the panel
// menu, and from the restore-saved-panels path on boot.
export function addFilesPanel(api, group) {
  const id = nextPanelIndex("files");
  const panel = api.addPanel({
    id: `files-${id}`,
    component: "files",
    params: { filesId: id, panelType: "files" },
    title: "Files",
    renderer: backgroundPlaybackAllowed() ? "always" : "onlyWhenVisible",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = filesDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "files" });
  panel.api.setActive();
  openFilesPanels.add(panel);
  panel.api.onDidRemove?.(() => openFilesPanels.delete(panel));
  return panel;
}
