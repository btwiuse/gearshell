// template-plugin.js — the GearShell plugin template (reference).
//
// Shows every way a plugin can extend the shell from ONE entry module:
//   registerPanel(...)           a React panel in the dockview grid
//   registerSettingsSection(...) a DOM section in the Settings page
//   registerOverlay(...)         ambient shell chrome beside the grid
// plus the permission-scoped `ctx.api` (the same API gear sees, gated
// by the manifest's permissions array).
//
// The plugin ships DISABLED (manifest enabled: false): nothing imports
// or fetches until the user enables it in the Plugins page.
//
// To turn this into your own plugin: copy plugin/template/, rename the
// component id + files, update the manifest entry URL, and register only
// the kinds you need.

import { TemplatePanel } from "./template.js?v=20260830.6";
import { TemplateSettingsSection } from "./template-settings.js?v=20260830.2";
import { TemplateOverlay } from "./template-overlay.js?v=20260830.3";

export const plugin = {
  register(ctx) {
    // 1. Panel — opened from the launcher or panels.open("template").
    // The render component receives the dockview panel props; it talks
    // to the shell through window.GearShell (permission-scoped).
    ctx.registerPanel({
      component: "template",
      label: "Plugin Template",
      icon: "BookOpen",
      title: "Plugin Template",
      render: TemplatePanel,
    });

    // 2. Settings section — a DOM render function (root, ctx) => dispose.
    // ctx.api is the same permission-scoped API the panel uses.
    ctx.registerSettingsSection({
      id: "template",
      label: "Plugin Template",
      render: TemplateSettingsSection,
    });

    // 3. Overlay — a null-rendering React component mounted beside the
    // dockview grid (desktop-pet style). Keep it tiny and unobtrusive.
    ctx.registerOverlay({
      id: "template",
      render: TemplateOverlay,
    });
  },
};
