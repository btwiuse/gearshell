// app-plugin-manifests-bash.js — the Bash Playground iframe plugin.
//
// The playground exposes a single `bash.run` API call so the user can
// exercise headless commands without writing JS. Default-disabled:
// running shell commands in an iframe is a power-user feature and we
// don't want it on by default. The manifest grants only the bash
// namespace, nothing else.
export const BASH_PLAYGROUND_PLUGIN = {
  id: "bash-playground",
  name: "Bash Playground",
  version: "1.0.0",
  icon: "SquareTerminal",
  iframe: {
    src: "/plugin/bash-playground/index.html",
    allow: "clipboard-read; clipboard-write",
  },
  permissions: {
    api: ["bash.*"],
  },
  enabled: false,
};
