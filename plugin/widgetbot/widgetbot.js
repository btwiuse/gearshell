// widgetbot.js — the optional Discord community widget (WidgetBot crate).
//
// Loads through the plugin kernel as a shell overlay (widgetbot-plugin.js
// registers it): the component renders nothing, and on mount injects the
// crate script only when the shell config `widgetbot` flag is on, so a
// plain workspace load keeps the browser console quiet. The config flag
// stays the visibility switch; the plugin manifest decides availability.

import React, { useEffect } from "react";

const SERVER_ID = "967111927299969064";
const CHANNEL_ID = "967111927740366888";

function injectCrate() {
  if (document.querySelector('script[src*="widgetbot"]')) return;
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@widgetbot/crate@3";
  script.async = true;
  script.onload = () => {
    try {
      new Crate({
        server: SERVER_ID,
        channel: CHANNEL_ID,
      });
    } catch { /* widget init is best-effort */ }
  };
  document.head.appendChild(script);
}

export function WidgetBotOverlay() {
  useEffect(() => {
    const cfg = typeof window !== "undefined" &&
        window.GearShell?.config?.getShell?.()
      ? window.GearShell.config.getShell()
      : null;
    if (cfg?.widgetbot === true) injectCrate();
  }, []);
  return null;
}
