// Deck: the marketing slides panel — a reveal.js presentation that
// pulls markdown from slides.md and renders it as a navigable deck.
//
// This module owns the `deck` dockview panel. The reveal.js helper
// library (loadSlidesMarkdown / prepareRevealSlides / initReveal /
// layoutReveal / destroyReveal + the revealStates WeakMap) and the
// DeckPanel component all live here, keeping the panel's structure
// and its rendering pipeline in one place.
//
// Dependency-injection shim: app.js calls `initDeck(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `deckDep(name)`.
// Mirrors the same pattern used by home.js / settings.js /
// crush-runner.js / files.js / runtime.js. The only app.js globals
// DeckPanel touches directly are the dev-error reporting helpers
// (which write to the shared debug overlay) and the CDN-loaded
// `Reveal` + `marked` globals (loaded by index.html as plain
// <script> tags, not ES modules).

import React, { useEffect, useRef } from "react";
import htm from "htm";
import { html as domHtml } from "../../dom-html.js?v=20260830.3";

const html = htm.bind(React.createElement);
import { nextPanelIndex } from "../../app-panel-ids.js?v=20260828.76";

let __deckDeps = null;
export function initDeck(dependencies) {
  __deckDeps = dependencies;
}
function deckDep(name) {
  if (__deckDeps == null) {
    throw new Error(
      "deck: initDeck() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __deckDeps[name];
  if (value === undefined) {
    throw new Error(`deck: missing dependency ${name}`);
  }
  return value;
}

// Inlined HTML for the deck panel. The original <template
// id="deck-template"> element lived in index.html; moving it here
// keeps the panel structure next to the React component that
// consumes it, so future edits to either happen in the same file.
const DECK_TEMPLATE_HTML = `
      <div class="home-content">
      <div class="home-debug-panel">
        <pre class="home-debug-errors" hidden aria-live="assertive"></pre>
        <button class="home-debug-dismiss" type="button" aria-label="Dismiss debug errors" title="Dismiss debug errors" hidden>&times;</button>
      </div>
      <div class="reveal">
        <div class="slides">
          <section data-home-slides-markdown></section>

        </div>
      </div>
    </div>
    `;

// === Reveal helpers ===

const revealStates = new WeakMap();
let slidesMarkdownPromise = null;

function loadSlidesMarkdown() {
  if (!slidesMarkdownPromise) {
    slidesMarkdownPromise = fetch("slides.md?v=20260725.1").then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load slides.md (${response.status})`);
        }
        return response.text();
      },
    );
  }
  return slidesMarkdownPromise;
}

function layoutReveal(homeContent) {
  revealStates.get(homeContent)?.deck?.layout();
}

async function prepareRevealSlides(homeContent) {
  const placeholder = homeContent.querySelector("[data-home-slides-markdown]");
  if (!placeholder) return;

  const stack = domHtml`<section />`;
  for (const source of (await loadSlidesMarkdown()).split(/^\s*--\s*$/m)) {
    const slide = domHtml`<section />`;
    slide.innerHTML = deckDep("marked").parse(source);
    stack.appendChild(slide);
  }
  placeholder.replaceWith(stack);
}

function initReveal(homeContent, api) {
  const existing = revealStates.get(homeContent);
  if (existing) return existing;

  const state = { deck: null, destroyed: false };
  revealStates.set(homeContent, state);
  state.ready = (async () => {
    while (typeof deckDep("Reveal") === "undefined") {
      await new Promise((resolve) => setTimeout(resolve));
      if (state.destroyed) return;
    }
    await prepareRevealSlides(homeContent);
    if (state.destroyed) return;

    const el = homeContent.querySelector(".reveal");
    if (!el) return;
    state.deck = new deckDep("Reveal")(el, {
      hash: false,
      controls: true,
      progress: true,
      center: true,
      transition: "slide",
      backgroundTransition: "fade",
      keyboard: true,
      keyboardCondition: () =>
        api.isActive &&
        !["INPUT", "TEXTAREA", "BUTTON"].includes(
          document.activeElement.tagName,
        ),
      overview: true,
      touch: true,
      mouseWheel: true,
      // Reveal switches to its scroll reader below 435px by default. That
      // mode disables navigation controls, including the custom arrows.
      scrollActivationWidth: null,
    });
    await state.deck.initialize();
    if (state.destroyed) return;
    layoutReveal(homeContent);
  })().catch((error) => {
    if (!state.destroyed) {
      deckDep("reportHomeError")("Reveal initialization failed", error);
    }
  });
  return state;
}

function destroyReveal(homeContent) {
  const state = revealStates.get(homeContent);
  if (!state) return;
  state.destroyed = true;
  state.deck?.destroy();
  revealStates.delete(homeContent);
}

// === DeckPanel ===

function DeckPanel({ api }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const homeContent = domHtml`<div />`;
    homeContent.innerHTML = DECK_TEMPLATE_HTML;
    const root = homeContent.firstElementChild;
    if (!wrapper || !root) return;

    wrapper.appendChild(root);
    const panelView = wrapper.closest(".dv-view");
    if (panelView) panelView.classList.add("home-view");
    // Reveal also emits a bubbling "ready" event. Keep it from waking wanix.
    const stopReadyEvent = (event) => event.stopPropagation();
    root.addEventListener("ready", stopReadyEvent);
    const dismiss = root.querySelector(".home-debug-dismiss");
    dismiss?.addEventListener("click", deckDep("dismissHomeDebugErrors"));
    deckDep("showHomeDebugErrors")();
    initReveal(root, api);
    const layout = () => requestAnimationFrame(() => layoutReveal(root));
    const subscriptions = [
      api.onDidDimensionsChange(layout),
      api.onDidVisibilityChange((event) => {
        if (event.isVisible) layout();
      }),
      api.onDidLocationChange(layout),
      api.onDidGroupChange(layout),
    ];
    layout();

    return () => {
      root.removeEventListener("ready", stopReadyEvent);
      dismiss?.removeEventListener("click", deckDep("dismissHomeDebugErrors"));
      if (panelView) panelView.classList.remove("home-view");
      for (const subscription of subscriptions) subscription.dispose();
      destroyReveal(root);
      root.remove();
    };
  }, [api]);

  return html`<div ref=${wrapperRef} className="panel-content"></div>`;
}

// === Panel registration ===

// Register a new Deck panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Deck from the panel
// menu, and from the restore-saved-panels path on boot.
export function addDeckPanel(api, group) {
  const id = nextPanelIndex("deck");
  const panel = api.addPanel({
    id: `deck-${id}`,
    component: "deck",
    params: { deckId: id, panelType: "deck" },
    title: "Deck",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = deckDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "deck" });
  panel.api.setActive();
  return panel;
}

export { DeckPanel };
