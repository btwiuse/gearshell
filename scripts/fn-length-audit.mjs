// Audit for the 50-line function rule and the 500-line file rule
// (acorn-based). Usage: node scripts/fn-length-audit.mjs [file.js ...]
// With no args, walks the repo recursively (root + plugin/), skipping
// submodules and build artifacts. Reports every function/arrow/method
// whose body spans > 50 lines and every file over 500 lines.
import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";

const FN_LIMIT = 50;
const FILE_LIMIT = 500;
const cwd = "/Users/gear/GitHub/gearshell";
const SKIP_DIRS = new Set([
  "node_modules",
  "memory",
  "dist",
  "docs",
  "architecture-viz",
  ".git",
  "wanix-dist",
  "browser",
  "bonsai",
  "isolation",
  "wanix-workbench",
  "web-pet",
  "proxy-test-collectsub",
  ".workbuddy",
  "神奇海螺队-第一轮评审",
  "PP评估",
  "vendor",
]);

function collectFiles(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) collectFiles(full, out);
    } else if (ent.name.endsWith(".js") || ent.name.endsWith(".mjs")) {
      out.push(full);
    }
  }
}

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : (() => {
    const out = [];
    collectFiles(cwd, out);
    return out;
  })();

// Generic recursive walk over any acorn AST (nodes are plain objects
// carrying a `type`; walk every property, skipping position metadata).
function walkAst(node, visit) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") {
    return;
  }
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "range") {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit);
    } else {
      walkAst(value, visit);
    }
  }
}

let fnTotal = 0;
let fileTotal = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  // Count lines like wc: a trailing newline does not add a line.
  const lines = src.endsWith("\n")
    ? src.split("\n").length - 1
    : src.split("\n").length;
  if (lines > FILE_LIMIT) {
    console.log(`\n${path.relative(cwd, f)}: ${lines}L (over ${FILE_LIMIT})`);
    fileTotal++;
  }
  let ast;
  try {
    ast = parse(src, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });
  } catch (e) {
    console.log(`${path.relative(cwd, f)}: PARSE ERROR ${e.message}`);
    continue;
  }
  const bad = [];
  const check = (node, label) => {
    if (!node.body || node.body.type !== "BlockStatement") return;
    const body = node.body.loc.end.line - node.body.loc.start.line - 1;
    if (body > FN_LIMIT) {
      bad.push({ label, start: node.loc.start.line, body });
    }
  };
  walkAst(ast, (node) => {
    if (node.type === "FunctionDeclaration") {
      check(node, node.id?.name ?? "(anon)");
    } else if (node.type === "FunctionExpression") {
      check(node, node.id?.name ?? "(anon)");
    } else if (node.type === "ArrowFunctionExpression") {
      check(node, "(arrow)");
    }
  });
  if (bad.length) {
    console.log(`\n${path.relative(cwd, f)}:`);
    for (const b of bad) {
      console.log(`  ${b.label} @${b.start} body=${b.body}L`);
      fnTotal++;
    }
  }
}
console.log(`\n${fnTotal} functions over ${FN_LIMIT} lines; ` +
  `${fileTotal} files over ${FILE_LIMIT} lines.`);
