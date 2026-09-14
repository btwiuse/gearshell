// app-shell-panel-actions.js — dockview tab context-menu operations:
// Duplicate / Reload / Rename plus the multi-panel "reload all" helper.
// Split out of app-shell.js for the 500-line rule: these functions have
// no React / dockview-component dependency and are called by the
// `getTabContextMenuItems` callback the App component hands to dockview.
//
// The functions are session-bearing aware: terminals / vms / workbench
// tasks get a real "refresh" (close source, mount replacement in the
// same group); content-only panels (home / settings / files / ...) just
// duplicate or rename because their React subtree diffs cleanly.

import { nextPanelIndex } from "./app-panel-ids.js";
import {
  forgetOpenPanel,
  rememberOpenPanel,
} from "./app-panels-store.js";

// Panels that hold no session state are safe to duplicate from the tab
// context menu (the copy lands right after the source tab, in the same
// group). Session-bearing panels (terminal / vm / workbench / task /
// crush-runner / iframe) bind to ids that must stay unique, so they
// stay single-instance.
const DUPLICATABLE_PANEL_TYPES = new Set([
  "home",
  "deck",
  "settings",
  "files",
  "runtime",
  "music",
  "playground",
  "launcher",
]);

function panelTypeOf(panel) {
  return panel.params?.panelType || panel.id.replace(/-\d+$/, "");
}

// Duplicate a content panel right next to its source tab and remember it
// so layout persistence keeps the copy across reloads.
export function duplicatePanel(api, panel) {
  const type = panelTypeOf(panel);
  if (!DUPLICATABLE_PANEL_TYPES.has(type)) return null;
  const n = nextPanelIndex(type);
  const id = `${type}-${n}`;
  const params = { ...(panel.params || {}) };
  for (const key of Object.keys(params)) {
    if (key.endsWith("Id")) params[key] = n;
  }
  params.panelType = type;
  const sourceIndex = panel.group?.panels?.indexOf(panel) ?? -1;
  const dup = api.addPanel({
    id,
    component: type,
    params,
    ...(panel.title ? { title: `${panel.title}` } : {}),
    position: {
      referencePanel: panel.id,
      direction: "within",
      ...(sourceIndex >= 0 ? { index: sourceIndex + 1 } : {}),
    },
  });
  rememberOpenPanel(dup, { component: type });
  dup.api.setActive();
  return dup;
}

// Rebuild a session-bearing panel in place: spawn a same-type panel
// right after the source tab carrying the original params, then close
// the source. dockview's onDidRemovePanel → handlePanelRemoved takes
// care of tearing down the old session (wanix-term / iframe / workbench
// / vm / task / crush-runner), and the new panel's mount effect attaches
// a fresh session from the same params — exactly what a user means by
// "reload this tab".
//
// The new panel is created BEFORE the old one closes so the same group
// never empties (otherwise the empty-grid fallback could fire).
// The new panel gets a fresh id suffix via nextPanelIndex; we
// re-register its openPanel snapshot so workspace.ui.openPanels tracks
// the new id, and the full layout save (wireLayoutPersistence) picks up
// the position via onDidLayoutChange.
export function reloadPanel(api, panel) {
  const type = panelTypeOf(panel);
  const n = nextPanelIndex(type);
  const params = { ...(panel.params || {}) };
  // Refresh any *Id params to the new session id the same way
  // duplicatePanel does, so the new React subtree binds to its own
  // session and we don't leak the old session into the new mount.
  for (const key of Object.keys(params)) {
    if (key.endsWith("Id")) params[key] = n;
  }
  params.panelType = type;
  const sourceIndex = panel.group?.panels?.indexOf(panel) ?? -1;
  const replacement = api.addPanel({
    id: `${type}-${n}`,
    component: type,
    params,
    ...(panel.title ? { title: panel.title } : {}),
    position: {
      referencePanel: panel.id,
      direction: "within",
      ...(sourceIndex >= 0 ? { index: sourceIndex + 1 } : {}),
    },
  });
  // Re-register the openPanel snapshot for the new id so the workspace
  // restore path can re-open it. The old id is dropped naturally by
  // handlePanelRemoved (via forgetOpenPanel).
  rememberOpenPanel(replacement, { component: type });
  replacement.api.setActive();
  panel.api.close();
  return replacement;
}

// Rename a tab in place. Dockview's setTitle() updates the displayed
// label and triggers onDidLayoutChange so the new title rides along on
// the next layout snapshot save — the rename survives a workspace
// restore. The default title is reconstructed by reading the panel's
// current title so we can show it as a placeholder; users who want the
// canonical name back can close and reopen the tab (addPanel mints a
// fresh id + original title).
export function renamePanel(api, panel) {
  const current = panel.title || panel.api.title || panel.id;
  // window.prompt is blocked inside cross-origin iframes that don't have
  // allow-modals; this plugin page can opt into it via the manifest's
  // iframe.allow if it ever needs to expose Rename. For the shell chrome
  // it just works.
  const next = window.prompt(`Rename tab (current: "${current}")`, current);
  if (next === null) return; // user cancelled
  const trimmed = next.trim();
  if (!trimmed) return;       // empty input → no-op (use close+reopen)
  panel.api.setTitle(trimmed);
}

// Reload every session-bearing panel currently open. Useful when a
// workspace-wide state change (wanix restart, iframe plugin update)
// means the user wants a clean slate without hunting tabs. Skips
// non-reloadable content panels for the same reason as reloadPanel.
export function reloadAllPanels(api) {
  // Snapshot the list before iterating — reloadPanel closes the source
  // panel, which mutates api.panels and would shift indices if we
  // walked it live.
  const panels = [...api.panels];
  for (const panel of panels) reloadPanel(api, panel);
  return panels.length;
}

export function tabContextMenuItems({ panel, api }) {
  const items = [];
  const type = panelTypeOf(panel);
  // Every panel gets both Duplicate and Reload so the right-click menu
  // is stable across the whole grid. Session-bearing panels (terminal /
  // vm / workbench / task / crush-runner / iframe) get a real "refresh":
  // closing the source tab fires handlePanelRemoved which destroys the
  // wanix-term / iframe / workbench / vm / task session, and the new
  // panel's mount effect attaches a fresh one. Content-only panels
  // (home / settings / files / runtime / music / playground / plugins /
  // launcher) won't visibly change — React diffs the new tree against
  // the old and reuses every DOM node — but the menu item is still
  // there for muscle memory.
  if (DUPLICATABLE_PANEL_TYPES.has(type)) {
    items.push({
      label: "Duplicate",
      action: () => duplicatePanel(api, panel),
    });
  }
  items.push({
    label: "Reload",
    action: () => reloadPanel(api, panel),
  });
  items.push({
    label: "Rename",
    action: () => renamePanel(api, panel),
  });
  items.push("separator", "close", "closeOthers", "closeAll");
  return items;
}
