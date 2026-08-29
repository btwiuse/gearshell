// files-plugin.js — the Files panel as a plugin.
//
// The Files panel registers through the plugin kernel like the other
// dogfood plugins, but keeps its custom opener: addFilesPanel applies
// the live background-playback renderer mode and tracks open panels so
// a config change can flip them (the generic opener cannot do that).
// initFiles stays kernel-wired for the same reason.

import { FilesPanel } from "./files.js?v=20260826.116";
import { addFilesPanel } from "./files-registry.js?v=20260826.73";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "files",
      label: "Files",
      icon: "FolderOpen",
      title: "Files",
      render: FilesPanel,
      open: addFilesPanel,
    });
  },
};
