#!/usr/bin/env python3
"""
Build graphviz dependency graphs of the GearShell JS source.

Produces three views under architecture-viz/:

  - js-deps.detailed.{dot,svg,png}  per-file graph (one node per .js/.mjs),
                                   clustered by directory. 156 nodes, 503
                                   edges. Use for "show me everything".
  - js-deps.modules.{dot,svg,png}  high-level graph (one node per directory
                                   / plugin family), edge weight = number
                                   of internal imports. Much easier to read.
  - js-deps.app.{dot,svg,png}      just app.js + top-level files reachable
                                   from it (1-hop + 2-hop) — the bootstrap
                                   wiring story.
"""

from __future__ import annotations
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = [ROOT] + [ROOT / "plugin"]
SKIP_DIRS = {
    "node_modules", ".git", ".crush", ".workbuddy", "browser", "isolation",
    "wanix-workbench", "bonsai", "web-pet", "memory", "docs",
    "神奇海螺队-第一轮评审", "PP评估", "proxy-test-collectsub",
    "wanix-dist", "examples", "scripts", "debug", "cmd", "architecture-viz",
    ".claude",
}

IMPORT_RE = re.compile(
    r"""(?:
        import\s+(?:[^'"`]+?from\s+)?['"`]([^'"`]+)['"`]
      | import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)
      | export\s+(?:[^'"`]+?from\s+)?['"`]([^'"`]+)['"`]
    )""",
    re.VERBOSE,
)

EXTERNAL_PREFIXES = ("http://", "https://", "//", "data:", "blob:")

# Plugin families get a single, stable label across the repo.
# Anything else is bucketed by directory.
PLUGIN_FAMILIES = {
    "plugin/app-store", "plugin/bubbletea-playground", "plugin/crush-playground",
    "plugin/deck", "plugin/default-page", "plugin/files", "plugin/glmatrix",
    "plugin/group", "plugin/home", "plugin/iframe-template-plugin",
    "plugin/launcher", "plugin/lucide-icons", "plugin/music", "plugin/playground",
    "plugin/runtime", "plugin/rv64", "plugin/settings", "plugin/spotlight",
    "plugin/terminal-frame", "plugin/v86", "plugin/w9y", "plugin/web-pet",
    "plugin/widgetbot", "plugin/workbench",
}


def should_skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith(".")


def collect_js_files() -> list[Path]:
    files: list[Path] = []
    for base in SCAN_DIRS:
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
            for fn in filenames:
                if fn.endswith((".js", ".mjs")):
                    files.append(Path(dirpath) / fn)
    return files


def parse_imports(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return [m.group(1) or m.group(2) or m.group(3)
            for m in IMPORT_RE.finditer(text)]


def resolve(importer: Path, spec: str) -> Path | None:
    if spec.startswith(EXTERNAL_PREFIXES):
        return None
    if spec.startswith("/"):
        candidate = ROOT / spec.lstrip("/")
    else:
        candidate = (importer.parent / spec).resolve()
    candidates = [candidate]
    if candidate.suffix == "":
        candidates += [
            candidate.with_suffix(".js"),
            candidate.with_suffix(".mjs"),
            candidate / "index.js",
            candidate / "index.mjs",
        ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def file_group(p: Path) -> str:
    """Stable group label for a file (used by the modules view)."""
    try:
        rel = p.relative_to(ROOT)
    except ValueError:
        return p.parent.name
    parts = rel.parts
    if not parts:
        return "(root)"
    if parts[0] == "plugin":
        # Plugin family grouping: collapse 2nd-level files into one node.
        if len(parts) >= 2:
            family = "/".join(parts[:2])
            return f"plugin:{parts[1]}"
        return "plugin:(root)"
    # Top-level: bucket by filename prefix to avoid 50 single-file groups.
    name = parts[-1]
    if name.startswith("app-"):
        return "app-* (shell modules)"
    if name.startswith("workspace-"):
        return "workspace-* (workspace APIs)"
    if name.startswith("plugins-"):
        return "plugins-* (registry)"
    if name.startswith("panels"):
        return "panels-* (panel grid)"
    if name.startswith("settings-"):
        return "settings-* (settings helpers)"
    if name.startswith("crush-"):
        return "crush-* (runner facade)"
    return "(root)"


def main() -> int:
    files = collect_js_files()
    print(f"Scanning {len(files)} js/mjs files", file=sys.stderr)

    nodes: set[Path] = set()
    edges: list[tuple[Path, Path]] = []
    unresolved: list[tuple[Path, str]] = []
    externals: set[str] = set()

    for f in files:
        nodes.add(f.resolve())
        for spec in parse_imports(f):
            if spec.startswith(EXTERNAL_PREFIXES):
                externals.add(spec)
                continue
            if not spec.startswith("."):
                continue
            target = resolve(f, spec)
            if target is None:
                unresolved.append((f, spec))
                continue
            target = target.resolve()
            nodes.add(target)
            edges.append((f.resolve(), target))

    print(f"Resolved {len(edges)} edges across {len(nodes)} nodes",
          file=sys.stderr)

    out_dir = ROOT / "architecture-viz"
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Detailed (per-file) ────────────────────────────────────────────
    detailed = build_detailed(nodes, edges)
    write_render(detailed, out_dir / "js-deps.detailed.dot", "Detailed · per-file")

    # ── Modules (per-group) ────────────────────────────────────────────
    modules = build_modules(nodes, edges)
    write_render(modules, out_dir / "js-deps.modules.dot", "Modules · per-group")

    # ── App reachable (1- and 2-hop from app.js) ──────────────────────
    app_view = build_app_reachable(nodes, edges)
    write_render(app_view, out_dir / "js-deps.app.dot", "App reachable · 2-hop from app.js")

    # Make the default view the modules one (most readable).
    for ext in (".dot", ".svg", ".png"):
        src = out_dir / f"js-deps.modules{ext}"
        dst = out_dir / f"js-deps{ext}"
        if src.exists():
            src.replace(dst)

    print(f"\nUnresolved ({len(unresolved)}):", file=sys.stderr)
    for f, s in unresolved[:30]:
        print(f"  {f.relative_to(ROOT)} -> {s}", file=sys.stderr)
    print(f"\nExternals ({len(externals)}):", file=sys.stderr)
    for s in sorted(externals)[:30]:
        print(f"  {s}", file=sys.stderr)
    return 0


def build_detailed(nodes, edges) -> str:
    file_clusters: dict[str, list[Path]] = {}
    for n in nodes:
        rel = n.relative_to(ROOT)
        key = "(root)" if rel.parent == Path(".") else str(rel.parent)
        file_clusters.setdefault(key, []).append(n)

    L = [
        "digraph gearshell_deps_detailed {",
        "  graph [rankdir=TB, overlap=false, splines=spline,"
        "         concentrate=true, nodesep=0.18, ranksep=0.45,"
        f"         label=\"GearShell · detailed JS graph ({len(nodes)} files, {len(edges)} edges)\", labelloc=t, fontsize=18];",
        "  node [shape=box, style=\"rounded,filled\", fontname=Helvetica,"
        "        fontsize=9, fillcolor=\"#eef3ff\", color=\"#5b6dab\"];",
        "  edge [color=\"#7a86b3\", arrowsize=0.5];",
    ]
    for cid, (key, members) in enumerate(sorted(file_clusters.items()), 1):
        L.append(f"  subgraph cluster_{cid} {{")
        L.append(f'    label="{(key if key != "(root)" else "(root)").replace(chr(34), chr(92)+chr(34))}";')
        L.append('    style="rounded,dashed,filled";')
        L.append('    fillcolor="#fafbfd"; color="#c5cee5"; fontsize=10;')
        for m in members:
            L.append(f'    "{m}" [label="{m.name}"];')
        L.append("  }")
    for src, dst in edges:
        L.append(f'  "{src}" -> "{dst}";')
    L.append("}")
    return "\n".join(L)


def build_modules(nodes, edges) -> str:
    """One node per module group; edges weighted by import count."""
    group_of: dict[Path, str] = {n: file_group(n) for n in nodes}
    weights: dict[tuple[str, str], int] = {}
    for src, dst in edges:
        gs, gd = group_of[src], group_of[dst]
        if gs == gd:
            continue  # intra-module noise; skip
        weights[(gs, gd)] = weights.get((gs, gd), 0) + 1

    # Stable ordering of groups: top-level first (alphabetical), then plugins.
    top_level = sorted(g for g in set(group_of.values()) if not g.startswith("plugin:"))
    plugins = sorted(g for g in set(group_of.values()) if g.startswith("plugin:"))

    L = [
        "digraph gearshell_deps_modules {",
        "  graph [rankdir=TB, overlap=false, splines=spline,"
        "         concentrate=true, nodesep=0.3, ranksep=0.55,"
        f"         label=\"GearShell · module-grouped JS graph ({len(set(group_of.values()))} groups, {sum(weights.values())} inter-group imports)\", labelloc=t, fontsize=18];",
        "  node [shape=box, style=\"rounded,filled\", fontname=Helvetica,"
        "        fontsize=11, fillcolor=\"#eef3ff\", color=\"#5b6dab\"];",
        "  edge [color=\"#7a86b3\", arrowsize=0.7];",
        "",
        "  // ── top-level module groups ─────────────────────────",
    ]
    if top_level:
        L.append("  subgraph cluster_root {")
        L.append('    label="(root)"; style="rounded,dashed,filled";')
        L.append('    fillcolor="#fafbfd"; color="#c5cee5"; fontsize=10;')
        for g in top_level:
            L.append(f'    "{g}" [label="{g}"];')
        L.append("  }")
    L.append("")
    L.append("  // ── plugin families ───────────────────────────────")
    cid = 0
    for g in plugins:
        cid += 1
        L.append(f"  subgraph cluster_p{cid} {{")
        L.append(f'    label="{g}";')
        L.append('    style="rounded,filled";')
        # alternate fill colors per plugin for visual rhythm
        colors = ["#fff4e8", "#e8f7ee", "#f7e8f4", "#e8f0f7", "#f7f4e8",
                  "#f0e8f7", "#e8f7f4", "#f7ece8", "#e8e8f7"]
        L.append(f'    fillcolor="{colors[cid % len(colors)]}"; color="#c5cee5"; fontsize=10;')
        L.append(f'    "{g}";')
        L.append("  }")
    L.append("")
    for (gs, gd), w in sorted(weights.items(), key=lambda kv: -kv[1]):
        # thicker arrows for heavier edges
        pen = max(1, min(4, int(w ** 0.5)))
        L.append(f'  "{gs}" -> "{gd}" [penwidth={pen}, label="{w}" '
                 'labeldistance=1.6, labelfontsize=8, labelfontcolor="#5b6dab"];')
    L.append("}")
    return "\n".join(L)


def build_app_reachable(nodes, edges) -> str:
    """Subgraph from app.js, 2 hops, to show the bootstrap wiring."""
    src_of: dict[Path, list[Path]] = {}
    dst_of: dict[Path, list[Path]] = {}
    for s, d in edges:
        src_of.setdefault(d, []).append(s)
        dst_of.setdefault(s, []).append(d)
    app = (ROOT / "app.js").resolve()
    if app not in nodes:
        app = next((n for n in nodes if n.name == "app.js"), None)
        if app is None:
            return "digraph {} { }"
    reachable: set[Path] = {app}
    frontier = {app}
    for _ in range(2):
        nxt: set[Path] = set()
        for f in frontier:
            for d in dst_of.get(f, []):
                if d not in reachable:
                    nxt.add(d)
                    reachable.add(d)
        frontier = nxt
    sub_edges = [(s, d) for s, d in edges if s in reachable and d in reachable]
    L = [
        "digraph gearshell_deps_app {",
        "  graph [rankdir=TB, overlap=false, splines=spline,"
        "         concentrate=true, nodesep=0.2, ranksep=0.55,"
        f"         label=\"GearShell · 2-hop from app.js ({len(reachable)} files, {len(sub_edges)} edges)\", labelloc=t, fontsize=18];",
        "  node [shape=box, style=\"rounded,filled\", fontname=Helvetica,"
        "        fontsize=10, fillcolor=\"#eef3ff\", color=\"#5b6dab\"];",
        "  edge [color=\"#7a86b3\", arrowsize=0.6];",
        f'  "{app}" [fillcolor="#fff3b0", color="#d2a018", penwidth=2, label="app.js (entry)"];',
    ]
    for n in reachable:
        if n == app:
            continue
        L.append(f'  "{n}" [label="{n.relative_to(ROOT)}"];')
    for s, d in sub_edges:
        L.append(f'  "{s}" -> "{d}";')
    L.append("}")
    return "\n".join(L)


def write_render(dot_text: str, dot_path: Path, label: str) -> None:
    dot_path.write_text(dot_text, encoding="utf-8")
    svg = dot_path.with_suffix(".svg")
    png = dot_path.with_suffix(".png")
    os.system(f'dot -Tsvg -Gdpi=72 "{dot_path}" -o "{svg}"')
    os.system(f'dot -Tpng -Gdpi=96 "{dot_path}" -o "{png}"')
    print(f"  [{label}] {svg.relative_to(ROOT)}, {png.relative_to(ROOT)}",
          file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())