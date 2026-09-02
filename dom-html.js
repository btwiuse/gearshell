// dom-html.js — htm bound to the DOM.
//
// htm only parses tagged templates into hyperscript calls; every prop and
// child decision is up to the bound function. React components bind htm to
// React.createElement, and this module binds it to a tiny DOM hyperscript
// helper so the imperative UI builders (settings rows, session wrappers,
// download links, ...) can use the same htm templates instead of
// document.createElement + appendChild chains. This file is the single
// sanctioned home of document.createElement in the tree.
//
// PITFALL: htm caches STATIC templates (no ${} parts) and returns the SAME
// element on every call — a `<section />` inside a loop yields one shared
// node that gets moved, not duplicated. Any template that must produce a
// fresh node per call (loop items, remounts) needs a dynamic part that
// evaluates to nothing, e.g. `<section>${null}</section>` (see
// the Deck iframe's dynamic slide sections).

import htm from "htm";

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const key in props || {}) {
    const value = props[key];
    if (value == null || value === false) continue;
    if (key === "class" || key === "className") {
      el.className = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value === true ? "" : value);
    }
  }
  const append = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      for (const item of child) append(item);
      return;
    }
    el.appendChild(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  };
  for (const child of children) append(child);
  return el;
}

export const html = htm.bind(h);
export default html;
