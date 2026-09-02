// docs-app.js — the GearShell API Documentation plugin UI.
//
// A single-file React app (500-line rule is for new files, not for an
// entry that has to ship together; the app can grow and split later).
// Loads the catalog index, renders a sidebar TOC and the selected
// markdown page through marked + DOMPurify. State lives in URL hash so
// reloads jump to the same page.
//
// Imports the marked and DOMPurify via importmap (see index.html). The
// bridge makes GearShell.ping() and config.kv available so we can
// stash the last-opened page across reloads.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
import { marked } from "marked";
import DOMPurify from "dompurify";
import * as Lucide from "lucide-react";

const html = htm.bind(React.createElement);
const root = createRoot(document.getElementById("app"));

const INDEX_URL = "/plugin/gearshell-docs/content/index.json";
const LAST_PAGE_KEY = "gearshell-docs:last-page";
const LAST_SEARCH_KEY = "gearshell-docs:last-search";

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h || null;
}

function pushHash(id) {
  const next = id ? `#/${id}` : "";
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}

function Icon({ name, size = 14 }) {
  const Cmp = Lucide[name] || Lucide.FileText;
  return html`<${Cmp} size=${size} />`;
}

// marked setup ----------------------------------------------------------------

// Strip YAML frontmatter (`---\n...\n---\n`) before parsing — the
// generator writes a metadata block at the top of every page that
// marked would otherwise render as plain paragraphs. Stays a string
// so the same parser can be used for guides (no frontmatter).
function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\n+/, "");
}

const renderer = new marked.Renderer();
const baseCode = renderer.code.bind(renderer);
renderer.code = function (code, infostring, escaped) {
  const lang = (infostring || "").match(/\S*/)[0];
  const isMulti = typeof code === "object" && code !== null && "text" in code;
  const text = isMulti ? code.text : code;
  const out = baseCode({ text, lang, escaped }, infostring, escaped) || baseCode(code, infostring, escaped);
  return `${out}<button type="button" class="docs-copy" data-copy="${encodeURIComponent(typeof text === "string" ? text : "")}">copy</button>`;
};
marked.setOptions({ renderer, gfm: true, breaks: false });

function renderMarkdown(markdown) {
  return DOMPurify.sanitize(marked.parse(stripFrontmatter(markdown || "")), {
    ADD_ATTR: ["data-copy", "target"],
  });
}

// Sidebar section ------------------------------------------------------------

function SidebarSection({ section, activeId, openSections, onToggle, onSelect }) {
  const isOpen = openSections.has(section.id);
  const items = section.methods || section.guides || [];
  return html`
    <section className=${"docs-sidebar-section" + (isOpen ? " docs-open" : "")}>
      <header onClick=${() => onToggle(section.id)}>
        <span className="docs-chevron">${isOpen ? "▾" : "▸"}</span>
        <span>${section.title}</span>
        <span className="docs-count">${items.length}</span>
      </header>
      <div className="docs-sidebar-items">
        ${items.map((item) => html`
          <a key=${item.id}
            href=${`#/${item.id}`}
            className=${item.id === activeId ? "docs-active" : ""}
            onClick=${(e) => { e.preventDefault(); onSelect(item.id); }}>${item.title}</a>
        `)}
      </div>
    </section>
  `;
}

// Search filter --------------------------------------------------------------

function flattenSections(sections) {
  const out = [];
  for (const section of sections) {
    for (const item of section.methods || section.guides || []) {
      out.push({ section, item });
    }
  }
  return out;
}

function matchesSearch(item, needle) {
  if (!needle) return true;
  const text = (item.title + " " + item.id).toLowerCase();
  return text.includes(needle);
}

// Page renderer --------------------------------------------------------------

function useDocText(path) {
  const [state, setState] = useState({ loading: true, text: "", error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, text: "", error: null });
    fetch(`/plugin/gearshell-docs/content/${path}`)
      .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((text) => { if (!cancelled) setState({ loading: false, text, error: null }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, text: "", error: error.message }); });
    return () => { cancelled = true; };
  }, [path]);
  return state;
}

function findById(sections, id) {
  for (const section of sections) {
    for (const item of section.methods || section.guides || []) {
      if (item.id === id) return { section, item };
    }
  }
  return null;
}

function PageBody({ activeId, sections, onNavigate }) {
  const found = findById(sections, activeId);
  if (!found) {
    return html`
      <div className="docs-empty">
        <${Lucide.FileSearch} size=${48} />
        <h2>No page selected</h2>
        <p>Pick a method from the sidebar, or jump to the
          <a href=${"#/guide-overview"} onClick=${(e) => { e.preventDefault(); onNavigate("guide-overview"); }}>overview guide</a>.</p>
      </div>`;
  }
  const { item } = found;
  const { loading, text, error } = useDocText(item.path);
  const htmlContent = useMemo(() => (loading || error ? "" : renderMarkdown(text)), [text, loading, error]);
  useEffect(() => {
    if (!htmlContent) return;
    const root = document.querySelector(".docs-main");
    if (!root) return;
    const buttons = root.querySelectorAll(".docs-copy");
    const handler = (event) => {
      const btn = event.currentTarget;
      const code = decodeURIComponent(btn.getAttribute("data-copy") || "");
      navigator.clipboard?.writeText(code).then(() => {
        btn.textContent = "copied";
        setTimeout(() => { btn.textContent = "copy"; }, 1200);
      }).catch(() => { btn.textContent = "failed"; });
    };
    buttons.forEach((b) => b.addEventListener("click", handler));
    return () => { buttons.forEach((b) => b.removeEventListener("click", handler)); };
  }, [htmlContent]);

  return html`
    <article>
      ${error && html`<div className="docs-banner docs-error">Failed to load: ${error}</div>`}
      ${loading && html`<div className="docs-banner">Loading…</div>`}
      ${!loading && !error && html`<div dangerouslySetInnerHTML=${{ __html: htmlContent }} />`}
    </article>`;
}

// Top bar --------------------------------------------------------------------

function TopBar({ search, onSearch, version, gearReady }) {
  return html`
    <header className="docs-topbar">
      <h1>GearShell API
        <span className="docs-version">${version}</span>
      </h1>
      <label className="docs-search">
        <${Icon} name="Search" />
        <input type="search" placeholder="Filter API surface (try: panels, kv, fs, music…)"
          value=${search} onChange=${(e) => onSearch(e.target.value)} />
      </label>
      <div className="docs-topbar-actions">
        <span title=${gearReady ? "GearShell bridge ready" : "GearShell bridge offline"}>
          <${Icon} name=${gearReady ? "CircleCheck" : "CircleAlert"} />
        </span>
        <a href="https://github.com/btwiuse/gearshell" target="_blank" rel="noreferrer">repo</a>
      </div>
    </header>`;
}

// App ------------------------------------------------------------------------

function App() {
  const [sections, setSections] = useState([]);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(parseHash());
  const [openSections, setOpenSections] = useState(new Set(["intro", "guides"]));
  const [search, setSearch] = useState("");
  const [gearReady, setGearReady] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const initialMount = useRef(true);

  // Load catalog index
  useEffect(() => {
    fetch(INDEX_URL)
      .then((r) => r.json())
      .then((data) => setSections(data.sections || []))
      .catch((err) => setError(err.message));
  }, []);

  // Restore last-opened page from kv (preferred) or localStorage
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      try {
        const saved = localStorage.getItem(LAST_SEARCH_KEY);
        if (saved) setSearch(saved);
      } catch {}
    }
    const stored = parseHash();
    if (stored) return;
    (async () => {
      try {
        if (window.GearShell?.config?.kv?.get) {
          const reply = await window.GearShell.config.kv.get(LAST_PAGE_KEY);
          if (reply?.ok && reply.value) {
            setActiveId(reply.value);
            pushHash(reply.value);
            return;
          }
        }
      } catch {}
      try {
        const last = localStorage.getItem(LAST_PAGE_KEY);
        if (last) { setActiveId(last); pushHash(last); }
      } catch {}
    })();
  }, []);

  // Hash sync
  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      if (next && next !== activeId) {
        setActiveId(next);
        // auto-open the section that contains the active id
        const found = findById(sections, next);
        if (found) setOpenSections((old) => new Set([...old, found.section.id]));
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [sections, activeId]);

  // Bridge readiness + version probe
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!window.GearShell) { setGearReady(false); return; }
      setGearReady(true);
      try {
        const v = await window.GearShell.version;
        if (!cancelled && typeof v === "string") setVersion(v);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Persist last-opened page
  useEffect(() => {
    if (!activeId) return;
    try { localStorage.setItem(LAST_PAGE_KEY, activeId); } catch {}
    if (!window.GearShell?.config?.kv?.set) return;
    window.GearShell.config.kv.set(LAST_PAGE_KEY, activeId).catch(() => {});
  }, [activeId]);

  useEffect(() => {
    try { localStorage.setItem(LAST_SEARCH_KEY, search); } catch {}
  }, [search]);

  const onToggle = (id) => setOpenSections((old) => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const onSelect = (id) => {
    setActiveId(id);
    pushHash(id);
    const found = findById(sections, id);
    if (found) setOpenSections((old) => new Set([...old, found.section.id]));
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    return sections.map((section) => {
      const items = (section.methods || section.guides || []).filter((item) => matchesSearch(item, search.toLowerCase()));
      if (!items.length) return null;
      return { ...section, methods: section.methods && items, guides: section.guides && items };
    }).filter(Boolean);
  }, [sections, search]);

  if (error) {
    return html`<div className="docs-empty"><h2>Catalog failed to load</h2><p>${error}</p></div>`;
  }

  return html`
    <div className="docs-shell">
      <${TopBar} search=${search} onSearch=${setSearch} version=${version} gearReady=${gearReady} />
      <div className="docs-body">
        <aside className="docs-sidebar">
          ${filtered.map((section) => html`
            <${SidebarSection} key=${section.id}
              section=${section}
              activeId=${activeId}
              openSections=${openSections}
              onToggle=${onToggle}
              onSelect=${onSelect} />
          `)}
        </aside>
        <main className="docs-main">
          <${PageBody} activeId=${activeId} sections=${sections} onNavigate=${onSelect} />
        </main>
      </div>
    </div>`;
}

root.render(html`<${App} />`);
