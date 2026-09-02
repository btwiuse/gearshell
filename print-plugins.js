import { DEFAULT_PLUGINS } from "./app-plugin-manifests.js";

process.stdout.write(`${JSON.stringify(DEFAULT_PLUGINS, null, 2)}\n`);
