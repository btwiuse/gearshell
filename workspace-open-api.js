// workspace-open-api.js — panel/browser/files open namespaces + groupFor
// (split out of workspace-api.js for the 500-line rule). Each namespace
// is a plain object of functions; the entry module wraps them with safe().

import { getDockviewApi } from "./app-panels-store.js";
import { addIframePanel, addPanelByComponent } from "./panels.js";
import { requestFilesOpen } from "./plugin/files/files.js";

// Resolve { group, referencePanel, direction } into the group id a new
// panel lands in. direction alone docks to the container edge; group /
// referencePanel split next to that group or panel (dockview addGroup
// options, verified against the v8.2.0 source); neither keeps the
// caller's default (active group).
export function groupFor(dockview, options) {
  if (!options?.direction) return options?.group;
  const reference = options.referencePanel
    ? { referencePanel: options.referencePanel }
    : options.group
    ? { referenceGroup: options.group }
    : {};
  return dockview.addGroup({
    ...reference,
    direction: options.direction,
  }).id;
}

export const openApi = {
  panels: {
    list: () =>
      (getDockviewApi()?.panels ?? []).map((panel) => ({
        id: panel.id,
        // dockview's panel.component is the component reference, not the
        // registered name; the name lives in params.panelType (set by every
        // panel adder), with the id prefix as a fallback.
        component: typeof panel.params?.panelType === "string"
          ? panel.params.panelType
          : panel.id.replace(/-\d+$/, ""),
        title: panel.title,
        isActive: panel.api.isActive,
        groupId: panel.api.group?.id ?? null,
      })),
    open: (component, options) => {
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      const panel = addPanelByComponent(dockview, component, options?.group, options);
      return { ok: true, id: panel?.id || null, reused: panel?.params?.panelType === "launcher" };
    },
    close: (id) => {
      getDockviewApi()?.getPanel(id)?.api.close();
      return { ok: true };
    },
    focus: (id) => {
      getDockviewApi()?.getPanel(id)?.api.setActive();
      return { ok: true };
    },
  },

  browser: {
    open: (url, options = {}) => {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
        return { ok: false, error: "a http(s):// URL is required" };
      }
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      const target = url.trim();
      addIframePanel(dockview, {
        title: target,
        src: target,
        panelType: "browser",
        allow: "clipboard-read; clipboard-write; fullscreen",
        allowFullscreen: true,
      }, groupFor(dockview, options));
      // No window.open here: agent calls carry no user gesture, so popups
      // are always blocked. The wrapper's popout button (user click) is
      // the way to a real browser tab.
      return { ok: true, url: target };
    },
  },

  files: {
    open: (path, options = {}) => {
      if (typeof path !== "string" || !path.trim()) {
        return { ok: false, error: "path required" };
      }
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      const target = path.trim();
      const existing = dockview.panels.find(
        (panel) => panel.params?.panelType === "files",
      );
      if (existing) existing.api.setActive();
      else addPanelByComponent(dockview, "files", groupFor(dockview, options));
      const { queued } = requestFilesOpen(target);
      return { ok: true, path: target, queued };
    },
  },
};
