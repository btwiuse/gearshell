// spotlight-overlay.js — the shell-side host for the Spotlight iframe.
//
// Spotlight is transient chrome, so it is an OVERLAY, not a panel: it
// renders beside the dockview grid (app-shell's PluginOverlays) and never
// takes a tab. The UI itself lives in an iframe page
// (plugin/spotlight/index.html) which talks back over the gear-bridge
// postMessage API under the manifest's permissions.api whitelist.
//
// This host owns exactly three things:
//   1. mount/unmount on the toggle channel (app-overlay-toggle.js), which
//      the ctrl+space hotkey drives;
//   2. a full-viewport fixed positioner for the iframe (the backdrop and
//      card are painted INSIDE the page, so the plugin owns its looks);
//   3. the close channel: the page posts { spotlight: "close" } and the
//      host unmounts, so a dismissed Spotlight never lingers as an
//      invisible iframe swallowing clicks.
//
// The iframe is unmounted (not merely hidden) while closed: a hidden
// iframe keeps its document alive and would keep the bridge channel and
// the page's keydown listener running for a UI nobody can see.

import React, { useCallback, useEffect, useRef, useState } from "react";
import htm from "htm";
import { onOverlayToggle } from "../../app-overlay-toggle.js";

const html = htm.bind(React.createElement);

export const SPOTLIGHT_OVERLAY_ID = "spotlight";
export const SPOTLIGHT_SRC = "/plugin/spotlight/index.html";

// Mount state driven by the toggle channel ("toggle" | "open" | "close").
function useSpotlightVisibility() {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onOverlayToggle(SPOTLIGHT_OVERLAY_ID, (mode) => {
        if (mode === "open") return setOpen(true);
        if (mode === "close") return setOpen(false);
        setOpen((previous) => !previous);
      }),
    [],
  );
  return [open, setOpen];
}

// The page asks to be dismissed (Escape, backdrop click, or a launch).
function useSpotlightCloseChannel(open, setOpen) {
  useEffect(() => {
    if (!open) return;
    const onMessage = (event) => {
      if (event.data?.spotlight === "close") setOpen(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, setOpen]);
}

// Focus the iframe so the page's input takes keystrokes immediately, and
// tell it to reset its query (the document survives between opens only
// within a single mount, but the reset keeps re-opens predictable).
// The card size is owned by the host (CSS), so the iframe element
// stops clipping events at the card edge. The surrounding glass layer
// is `pointer-events: none` so dockview stays interactive underneath;
// the only click target is the card itself, plus Escape on the hotkey
// channel. Host dims on a mousedown anywhere outside the card.
const CARD_MAX_WIDTH = 620;
const CARD_WIDTH_VIEWPORT = "92vw";
const CARD_HEIGHT = "62vh";
const CARD_OFFSET_TOP = "14vh";

function useSpotlightFocus(open, frameRef) {
  useEffect(() => {
    if (!open) return;
    const focusFrame = () => {
      const frame = frameRef.current;
      if (!frame) return;
      frame.focus();
      try {
        frame.contentWindow?.postMessage({ spotlight: "focus" }, "*");
      } catch {
        // Not loaded yet; the page focuses its own input on boot.
      }
    };
    const raf = requestAnimationFrame(focusFrame);
    return () => cancelAnimationFrame(raf);
  }, [open, frameRef]);
}

export function SpotlightOverlay() {
  const [open, setOpen] = useSpotlightVisibility();
  const frameRef = useRef(null);
  const closeSpotlight = useCallback(() => setOpen(false), [setOpen]);
  useSpotlightCloseChannel(open, closeSpotlight);
  useSpotlightFocus(open, frameRef);

  if (!open) return null;
  const onGlassMouseDown = (event) => {
    // Treat any click on the surrounding glass the same as Escape:
    // close the overlay and let it bubble up so dockview's normal
    // pointer behaviour isn't preempted by an inert full-viewport
    // overlay element. Only the iframe (the card itself) is a real
    // click target.
    if (event.target === event.currentTarget) closeSpotlight();
  };
  return html`
    <div className="spotlight-glass" onMouseDown=${onGlassMouseDown}>
      <iframe
        ref=${frameRef}
        className="spotlight-frame"
        src=${SPOTLIGHT_SRC}
        title="Spotlight"
        onLoad=${() => {
          frameRef.current?.contentWindow?.postMessage(
            { spotlight: "focus" },
            "*",
          );
          frameRef.current?.focus();
        }}
      />
    </div>
  `;
}
