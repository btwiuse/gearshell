// app-plugin-manifests-shell-tools.js — the per-task shell toolset
// manifest and its bundled-binary URLs. Lives next to the plugin
// manifests (500-line split out of app-plugin-manifests.js).
//
// The bash/w9y/gear binaries and the shell rc file ship as the
// `shell-tools` plugin, not as kernel binds: the plugin mechanism
// reconciles them into workspace.binds (app-plugin-binds.js), so the
// version lives in this manifest and upgrades ride the plugin. These
// constants are re-exported through app-constants.js for legacy
// importers (app-normalize, gear-bind).

// The bundled shell binary (hush, mounted as /bin/bash). Pinned to a
// semver tag; isLegacyHushBinaryUrl auto-upgrades older pins on load so
// kernel-interpreter fixes (e.g. fd>2 redirects, script args) reach
// existing workspaces without a manual reset.
export const HUSH_BINARY_VERSION = "v0.5.9";
export const DEFAULT_HUSH_BINARY_URL =
  "https://w9y.io/go/github.com/btwiuse/hush/cmd/hush@v0.5.9";
export const W9Y_BINARY_VERSION = "v0.0.9";
export const DEFAULT_W9Y_BINARY_URL =
  "https://w9y.io/go/github.com/justwasm/w9y/cmd/w9y@v0.0.9";
export function isLegacyHushBinaryUrl(url) {
  return typeof url === "string" &&
    url.includes("github.com/btwiuse/hush/cmd/hush@") &&
    (!url.includes(`hush@${HUSH_BINARY_VERSION}`) ||
      url.includes("w9y.up.railway.app"));
}

// The Go gear CLI (cmd/gear, candidate replacement for the bash bin/gear
// script): same jsfs fd-bridge wire protocol, cobra/fang arg parsing.
export const GEAR_BINARY_VERSION = "v0.0.3";
export const DEFAULT_GEAR_BINARY_URL =
  "https://w9y.io/go/github.com/btwiuse/gearshell/cmd/gear@v0.0.3";

// Shell rc file shipped on the per-task /preset ramfs; keeps the
// w9y_detect bootstrap that installs w9y mods into $HOME/.w9y on demand.
export const SHELL_PROFILE_CONTENT = `function w9y_detect() {
  path="$LOCATION"
  OLDIFS=$IFS
  IFS='/'

  set -- $path

  IFS=$OLDIFS

  for x; do
    [[ -d $HOME/.w9y/$x ]] && continue
    w9y mod apply -v "$x" && mkdir -p $HOME/.w9y/$x
    [[ $? -eq 0 ]] || continue
    if [[ $x = picoclaw ]]; then
      echo "[INFO] picoclaw successfully installed, type 'picoclaw' to get started"
    fi
    if [[ $x = crush ]]; then
      echo "[INFO] crush successfully installed, type 'crush' to get started"
    fi
  done
}
function ensure_home() {
  [[ -d $HOME ]] || mkdir -p $HOME
}
ensure_home
cd $HOME
w9y_detect
`;

// The per-task shell toolset. Required: disabling it would leave every
// task without bash/w9y/gear, so the config API refuses to disable or
// remove it. The wasm binaries and the rc file ride the plugin-declared
// bind path (app-plugin-binds.js), replacing the old kernel binds
// (ensureTaskShellBinds now only manages the /bin + /preset ramfs
// parents and prunes the legacy kernel tool binds).
export const SHELL_TOOLS_PLUGIN = {
  id: "shell-tools",
  name: "Shell Tools",
  version: "1.0.0",
  icon: "Terminal",
  required: true,
  wasm: [
    { id: "bash", dst: "bin/bash", src: DEFAULT_HUSH_BINARY_URL },
    { id: "w9y", dst: "bin/w9y", src: DEFAULT_W9Y_BINARY_URL },
    { id: "gear", dst: "bin/gear", src: DEFAULT_GEAR_BINARY_URL },
  ],
  preset: [
    {
      id: "profile",
      dst: "preset/profile",
      content: SHELL_PROFILE_CONTENT,
      perm: "0666",
    },
  ],
};