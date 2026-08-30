// plugins-css.js — plugin stylesheet injection (500-line rule split out
// of plugins.js). Each manifest.css path becomes a <link data-plugin-css>
// carrying the entry's ?v= so cascade bumps keep CSS and JS cache-busted
// together; unregisterPlugin removes them again via removePluginCss.

import { html as domHtml } from "./dom-html.js?v=20260830.3";

export function injectPluginCss(manifest) {
  if (!Array.isArray(manifest.css) || manifest.css.length === 0) return [];
  // Version only same-origin paths: remote css is pinned by its own URL
  // (e.g. a jsdelivr reveal.js stylesheet) and needs no cache-buster.
  const version = (manifest.entry || "").match(/[?&]v=([\w.]+)/)?.[1] || "";
  const links = [];
  for (const path of manifest.css) {
    const href = path.startsWith("/") && version
      ? `${path}?v=${version}`
      : path;
    const link = domHtml`<link
      rel="stylesheet"
      href=${href}
      data-plugin-css=${manifest.id}
    />`;
    document.head.appendChild(link);
    links.push(link);
  }
  return links;
}

// Resolve when every link has loaded (or failed: a missing stylesheet must
// not stall plugin registration — the panel opens unstyled instead).
export function cssLoaded(links) {
  return Promise.all(links.map((link) => new Promise((resolve) => {
    link.addEventListener("load", resolve);
    link.addEventListener("error", resolve);
  })));
}

export function removePluginCss(id) {
  for (const link of [
    ...document.querySelectorAll(`link[data-plugin-css="${id}"]`),
  ]) {
    link.remove();
  }
}
