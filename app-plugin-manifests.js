// app-plugin-manifests.js — the DEFAULT_PLUGINS registry. Pure data:
// the built-in plugin manifests the kernel loads at boot and the
// Plugins page lists. Every manifest here is the copyable template
// for a third-party plugin (component, iframe, or overlay registration
// kind).
//
// Split across thematic files (500-line rule); this module is just
// the composition root:
//   - app-plugin-manifests-shell-tools.js  hush/w9y/gear URLs + the
//                                          shell-tools plugin (required)
//   - app-plugin-manifests-plugins-core.js entry-style core plugins
//   - app-plugin-manifests-iframes.js      simple iframe plugins
//   - app-plugin-manifests-crush.js        Crush family + iframe template
//   - app-plugin-manifests-examples.js     examples bind provider
//   - app-plugin-manifests-bbtex.js        bbtex iframe plugin
//   - app-plugin-manifests-rv64.js         rv64 iframe plugin
//   - app-plugin-manifests-v86.js          v86 iframe plugin
// To add a plugin, drop its manifest into the matching thematic file.

import { SHELL_TOOLS_PLUGIN } from "./app-plugin-manifests-shell-tools.js";
import { CORE_PLUGINS } from "./app-plugin-manifests-plugins-core.js";
import { IFRAME_PLUGINS } from "./app-plugin-manifests-iframes.js";
import { CRUSH_PLUGINS } from "./app-plugin-manifests-crush.js";
import { EXAMPLES_PLUGIN } from "./app-plugin-manifests-examples.js";
import { BBTEX_IFRAME_PLUGIN } from "./app-plugin-manifests-bbtex.js";
import { RV64_IFRAME_PLUGIN } from "./app-plugin-manifests-rv64.js";
import { V86_IFRAME_PLUGIN } from "./app-plugin-manifests-v86.js";

// Re-export the shell toolset constants so app-constants.js (and its
// downstream importers) can keep reading them from this module. The
// actual sources of truth live in app-plugin-manifests-shell-tools.js.
export {
  DEFAULT_GEAR_BINARY_URL,
  DEFAULT_HUSH_BINARY_URL,
  DEFAULT_W9Y_BINARY_URL,
  GEAR_BINARY_VERSION,
  HUSH_BINARY_VERSION,
  W9Y_BINARY_VERSION,
  isLegacyHushBinaryUrl,
  SHELL_PROFILE_CONTENT,
} from "./app-plugin-manifests-shell-tools.js";

export const DEFAULT_PLUGINS = [
  ...CORE_PLUGINS,
  ...IFRAME_PLUGINS,
  ...CRUSH_PLUGINS,
  SHELL_TOOLS_PLUGIN,
];

// The examples + bbtex bind providers are data, not logic: pushed after
// the array literal so DEFAULT_PLUGINS stays one flat list (see
// app-plugin-manifests-examples.js / app-plugin-manifests-bbtex.js).
DEFAULT_PLUGINS.push(EXAMPLES_PLUGIN);
// iframe edition of the bbtex playground: the reference for third-party
// plugin layout; can be disabled in the Plugins page.
DEFAULT_PLUGINS.push(BBTEX_IFRAME_PLUGIN);
// RISC-V 64 Linux in the browser (rv64.js iframe edition): self-contained
// page, boots Alpine via the shared vnet gateway, apk works.
DEFAULT_PLUGINS.push(RV64_IFRAME_PLUGIN);
DEFAULT_PLUGINS.push(V86_IFRAME_PLUGIN);