// Flat ESLint config for the GearShell browser bundle.
//
// Scope: every .js file at the repo root (the dockview shell modules).
// browser=true sets `globalThis` + browser globals; es2024 enables the
// modern syntax the modules already use (nullish coalescing, optional
// chaining, top-level await, private fields, etc). Globals are pinned
// in `globals` so we get browser/runtime entries without picking up
// Deno / Node false positives (we run in the browser, not in either
// runtime).
//
// Why not deno lint? Deno's linter assumes the Deno runtime (no
// `window`, no `globalThis` for web APIs, etc) and flags every browser
// call site in this codebase. ESLint with a `browser` globals bundle
// gives actionable advice for the actual environment.
//
// Why not eslint-plugin-import? The modules are interlinked through
// ~80 same-origin ESM imports; the import resolver runs resolve() on
// every specifier against the filesystem and exhausts the V8 heap
// on a buildless bundle like this one. Import hygiene is enforced
// by the AGENTS.md "module URL consistency" rule and the manual
// `?v=` cascade instead.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "wanix-dist/**",
      "memory/**",
      "node_modules/**",
      "**/*.sw.js",
      "architecture-viz/**",
      "**/*.test.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // Wanix runtime + wanix task element globals the modules
        // reference via globalThis / custom-element lookups.
        wanix: "readonly",
        xterm: "readonly",
      },
    },
    rules: {
      // The shell calls window.* / document.* in many places; that's
      // the environment, not a bug. no-undef off so globals from
      // the browser bundle can pass without per-call eslint-disable.
      "no-undef": "off",
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-empty-pattern": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-unused-expressions": ["warn", { allowTaggedTemplates: true }],
      "prefer-const": "warn",
      "no-var": "error",
      // Pragmatic relaxations for buildless browser code:
      "no-prototype-builtins": "off",
      "no-inner-declarations": "off",
      "no-self-assign": "off",
      "no-case-declarations": "off",
      "no-async-promise-executor": "off",
      "no-redeclare": "off",
      "no-control-regex": "off",
      "no-throw-literal": "off",
    },
  },
  {
    // Generated/style files: relaxed.
    files: [
      "**/widgetbot.js",
    ],
    rules: {
      "no-unused-vars": "off",
    },
  },
];
