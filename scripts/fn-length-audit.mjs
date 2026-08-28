// Function-length audit for the 50-line rule (acorn-based).
// Usage: node scripts/fn-length-audit.mjs [file.js ...]
// Reports every function/arrow/method whose body spans > 50 lines,
// including object-literal methods and nested callbacks.
import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";

const LIMIT = 50;
const cwd = "/Users/gear/GitHub/gearshell";
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(cwd)
    .filter((f) => f.endsWith(".js") && !f.startsWith("."))
    .map((f) => path.join(cwd, f));

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

function lineOf(src, pos) {
  return src.slice(0, pos).split("\n").length;
}

function spanOf(node) {
  return { start: node.loc.start.line, end: node.loc.end.line };
}

let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let ast;
  try {
    ast = parse(src, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });
  } catch (e) {
    console.log(`${path.basename(f)}: PARSE ERROR ${e.message}`);
    continue;
  }
  const bad = [];
  const check = (node, label) => {
    if (!node.body || node.body.type !== "BlockStatement") return;
    const body = node.body.loc.end.line - node.body.loc.start.line - 1;
    if (body > LIMIT) {
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
    console.log(`\n${path.basename(f)}:`);
    for (const b of bad) {
      console.log(`  ${b.label} @${b.start} body=${b.body}L`);
      total++;
    }
  }
}
console.log(`\n${total} functions over ${LIMIT} lines.`);
