// Streaming markdown renderer for the chat assistant.
//
// Three concerns interleave here:
//
//   1. safety — model output goes through DOMPurify before .innerHTML
//   2. streaming — renderAnswer is called once per paint window
//      (see turn-meta.js scheduleStreamPaint, capped at ~30 fps).
//   3. incremental render — re-parsing the entire accumulated answer
//      on every paint is O(n) per paint, which becomes hot around
//      100+ tokens of LaTeX / tables.
//
// We address (1) by replacing the old Promise.all + .then() race
// with top-level await: by the time this module's body finishes
// executing, `marked`, `katexLib`, and `sanitizeHtml` are all set,
// or all three are null and the fallback (plain paragraphs) takes
// over. There is no longer a window where one is loaded and the
// others aren't, so no paint can innerHTML raw model output.
//
// We address (3) by memoizing the render on `text`. The streaming
// hot path returns the cached HTML when the same prefix reappears
// (e.g. a re-render triggered by visibility/focus change). For
// genuine growth paints (the common case during streaming), we
// parse just the new tail and splice the rendered chunk onto the
// already-rendered prefix — the cost is O(delta) per paint, not
// O(accumulated).
//
// The previous lazy-import version had `let sanitizeHtml = null`
// and called `el.innerHTML = raw` whenever DOMPurify was the slow
// leg of the race. That race is what this rewrite closes.

import { marked as markedNs } from "https://esm.sh/marked@17?external=react";
import katexNs from "https://esm.sh/katex@0.16?external=react";
import domPurifyNs from "https://esm.sh/dompurify@3.2.6?external=react";

const marked = markedNs;
const katexLib = katexNs?.default ?? katexNs;
const domPurify = domPurifyNs?.default ?? domPurifyNs;

marked.use({ gfm: true, breaks: true });
marked.use(makeKatexExtension());

const sanitizeHtml = (html) =>
  domPurify.sanitize(html, { USE_PROFILES: { html: true } });

const katexCache = new Map();
function renderKatex(text, display) {
  const key = (display ? "d:" : "i:") + text;
  const cached = katexCache.get(key);
  if (cached !== void 0) return cached;
  let html;
  try {
    html = katexLib.renderToString(text.trim(), {
      throwOnError: false,
      displayMode: display,
    });
  } catch {
    html = escapeHtml(text);
  }
  katexCache.set(key, html);
  return html;
}

function stashKatex(text, display) {
  const html = renderKatex(text, display);
  if (!currentKatexSink) return html;
  return `<span data-katex-fragment="${currentKatexSink.push(html) - 1}"></span>`;
}

let currentKatexSink = null;

function trimIncompleteMath(text) {
  let cut = -1;
  for (const [open, close] of [["\\[", "\\]"], ["\\(", "\\)"]]) {
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

// Cache: every (el, text) pair that ran through the full path. Same
// text against the same element returns the same innerHTML — used
// by visibility-change re-renders that shouldn't reparse.
//
// `el._lastText` is attached to the live DOM node. It's read on
// the fast path and updated on every successful render. Clearing
// the thread (clearChat, openSession) resets it implicitly when
// the DOM is replaced. Stale state from a removed element is GC'd
// automatically — no WeakMap needed.

function renderFull(text) {
  currentKatexSink = [];
  let html = sanitizeHtml(marked.parse(text));
  if (currentKatexSink.length) {
    const fragments = currentKatexSink;
    currentKatexSink = null;
    html = html.replace(
      /<span data-katex-fragment="(\d+)"><\/span>/g,
      (_, i) => fragments[+i] ?? "",
    );
  } else {
    currentKatexSink = null;
  }
  return html;
}

export function renderAnswer(el, raw, withCaret) {
  const text = withCaret && katexLib ? trimIncompleteMath(raw || "") : (raw || "");
  // Fast path: streaming paint arrives with `el._lastText === text`
  // when the page re-renders the same accumulated buffer (visibility
  // toggle, theme change). Skip work; caret stays in place.
  if (el._lastText === text) return;

  if (el._lastText && text.startsWith(el._lastText)) {
    // Incremental: parse only the appended delta and splice onto
    // the existing DOM as additional siblings. `el` already
    // contains the rendered prefix from the previous paint.
    const delta = text.slice(el._lastText.length);
    let deltaHtml;
    try {
      currentKatexSink = [];
      deltaHtml = sanitizeHtml(marked.parse(delta));
    } finally {
      if (currentKatexSink && currentKatexSink.length) {
        const frags = currentKatexSink;
        currentKatexSink = null;
        deltaHtml = deltaHtml.replace(
          /<span data-katex-fragment="(\d+)"><\/span>/g,
          (_, i) => frags[+i] ?? "",
        );
      } else {
        currentKatexSink = null;
      }
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = deltaHtml;
    while (tmp.firstChild) el.appendChild(tmp.firstChild);
    el._lastText = text;
    if (withCaret) appendCaret(el);
    return;
  }

  // Full re-render — covers both the first paint and any case where
  // the upstream buffer was rewritten (new session, history open).
  let html;
  try {
    html = renderFull(text);
  } catch {
    const safe = escapeHtml(text);
    const paragraphs = safe
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    el.innerHTML = paragraphs
      .map((p) => `<p>${formatInline(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
    el._lastText = text;
    if (withCaret) appendCaret(el);
    return;
  }
  el.innerHTML = html;
  el._lastText = text;
  if (withCaret) appendCaret(el);
}

function appendCaret(el) {
  const caret = document.createElement("span");
  caret.className = "a-caret";
  const DESCEND = /^(P|UL|OL|LI|BLOCKQUOTE|H[1-6]|PRE|CODE|EM|STRONG)$/;
  let host = el;
  for (;;) {
    let tail = host.lastChild;
    while (tail && tail.nodeType === Node.TEXT_NODE && !tail.textContent.trim()) {
      tail = tail.previousSibling;
    }
    if (
      !tail ||
      tail.nodeType !== Node.ELEMENT_NODE ||
      !DESCEND.test(tail.tagName)
    ) break;
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
