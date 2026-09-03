let marked = null;
let katexLib = null;
let sanitizeHtml = null;
const katexCache = new Map();
let katexFragments = null;
Promise.all([
  import("https://esm.sh/marked@17"),
  import("https://esm.sh/katex@0.16"),
  import("https://esm.sh/dompurify@3.2.6"),
])
  .then(([markedModule, katexModule, domPurifyModule]) => {
    marked = markedModule.marked;
    marked.use({ gfm: true, breaks: true });
    katexLib = katexModule.default ?? katexModule;
    const domPurify = domPurifyModule.default ?? domPurifyModule;
    sanitizeHtml = (html) => domPurify.sanitize(html, { USE_PROFILES: { html: true } });
    marked.use(makeKatexExtension());
    ensureKatexCss();
  })
  .catch(() => {
    marked = null;
    katexLib = null;
    sanitizeHtml = null;
  });
function ensureKatexCss() {
  if (document.querySelector("link[data-katex]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css";
  link.dataset.katex = "1";
  document.head.appendChild(link);
}
function katexExtension(name, startRe, tokenRe, display) {
  return {
    name,
    level: "inline",
    start(src) {
      return src.match(startRe)?.index;
    },
    tokenizer(src) {
      const m = tokenRe.exec(src);
      if (m) return { type: name, raw: m[0], text: m[1] };
    },
    renderer(token) {
      return stashKatex(token.text, display);
    },
  };
}

function makeKatexExtension() {
  return {
    extensions: [
      katexExtension("katexDollarBlock", /\$\$/, /^\$\$([\s\S]+?)\$\$/, true),
      katexExtension("katexBlock", /\\\[/, /^\\\[([\s\S]+?)\\\]/, true),
      katexExtension("katexInline", /\\\(/, /^\\\(([\s\S]+?)\\\)/, false),
      katexExtension(
        "katexDollarInline",
        /\$/,
        /^\$(?!\s|\$)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/,
        false,
      ),
    ],
  };
}
function renderKatex(text, display) {
  const key = (display ? "d:" : "i:") + text;
  let html = katexCache.get(key);
  if (html === void 0) {
    try {
      html = katexLib.renderToString(text.trim(), {
        throwOnError: false,
        displayMode: display,
      });
    } catch {
      html = escapeHtml(text);
    }
    katexCache.set(key, html);
  }
  return html;
}
function stashKatex(text, display) {
  const html = renderKatex(text, display);
  if (!katexFragments) return html;
  return `<span data-katex-fragment="${katexFragments.push(html) - 1}"></span>`;
}
function trimIncompleteMath(text) {
  let cut = -1;
  for (
    const [open, close] of [
      ["\\[", "\\]"],
      ["\\(", "\\)"],
    ]
  ) {
    const lastOpen = text.lastIndexOf(open);
    if (lastOpen !== -1 && text.indexOf(close, lastOpen + open.length) === -1) {
      if (cut === -1 || lastOpen < cut) cut = lastOpen;
    }
  }
  const dollarCount = text.split("$$").length - 1;
  if (dollarCount % 2 === 1) {
    const lastOpen = text.lastIndexOf("$$");
    if (cut === -1 || lastOpen < cut) cut = lastOpen;
  }
  const tail = cut === -1 ? text : text.slice(0, cut);
  const m = /\$(?![\s\d$])[^$\n]*$/.exec(tail);
  if (m && tail.split("$").length % 2 === 0) {
    if (cut === -1 || m.index < cut) cut = m.index;
  }
  return cut === -1 ? text : text.slice(0, cut);
}
export function renderAnswer(el, raw, withCaret) {
  const text = withCaret && katexLib ? trimIncompleteMath(raw || "") : raw || "";
  if (marked && sanitizeHtml) {
    try {
      katexFragments = [];
      let html = sanitizeHtml(marked.parse(text));
      if (katexFragments.length) {
        html = html.replace(
          /<span data-katex-fragment="(\d+)"><\/span>/g,
          (_, i) => katexFragments[+i] ?? "",
        );
      }
      el.innerHTML = html;
      if (withCaret) appendCaret(el);
      return;
    } catch {
    } finally {
      katexFragments = null;
    }
  }
  const safe = escapeHtml(text);
  const paragraphs = safe
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  el.innerHTML = paragraphs
    .map((p) => `<p>${formatInline(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  if (withCaret) appendCaret(el);
}
function appendCaret(el) {
  const caret = document.createElement("span");
  caret.className = "a-caret";
  const DESCEND = /^(P|UL|OL|LI|BLOCKQUOTE|H[1-6]|PRE|CODE|EM|STRONG)$/;
  let host = el;
  for (;;) {
    let tail = host.lastChild;
    while (
      tail && tail.nodeType === Node.TEXT_NODE && !tail.textContent.trim()
    ) {
      tail = tail.previousSibling;
    }
    if (
      !tail ||
      tail.nodeType !== Node.ELEMENT_NODE ||
      !DESCEND.test(tail.tagName)
    ) {
      break;
    }
    host = tail;
  }
  host.appendChild(caret);
}
function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>");
}
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
