// Wrapper around ESLint that runs with a single process and a large
// heap. ESLint 9's parallel worker pool defaults to ~1GB/worker and
// blows up on the dockview shell's interlinked JSX-heavy modules; the
// shared heap model in this script processes the whole tree in one
// pass and reports a stable count of problems.
//
// Usage: node scripts/lint.mjs [paths...]
// Default path: every .js file in the repo root (excludes submodules
// and generated bundles via the ESLint ignores block).
import { ESLint } from "eslint";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      ignores: [
        "wanix-dist/**",
        "memory/**",
        "node_modules/**",
        "**/*.sw.js",
        "architecture-viz/**",
        "**/*.test.js",
        "browser/**",
        "scripts/**",
        "**/vendor/**",
      ],
    },
  ],
  cache: true,
  cacheLocation: ".eslintcache",
});

const patterns = process.argv.slice(2);
const targets = patterns.length > 0 ? patterns : ["."];
const results = await eslint.lintFiles(targets);
let totalProblems = 0;
let totalErrors = 0;
for (const r of results) {
  totalProblems += r.messages.length;
  totalErrors += r.errorCount;
  if (r.messages.length > 0) {
    process.stdout.write(`\n${r.filePath}\n`);
    for (const m of r.messages) {
      process.stdout.write(
        `  ${m.line}:${m.column}  ${m.ruleId || "syntax"}  ${m.message}\n`,
      );
    }
  }
}
process.stdout.write(
  `\n${results.length} files, ${totalProblems} problems, ${totalErrors} errors\n`,
);
process.exit(totalErrors > 0 ? 1 : 0);
