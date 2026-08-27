// Optional Discord community widget (WidgetBot crate).
// Off by default; enabled via the shell config `widgetbot` flag so a
// plain workspace load keeps the browser console quiet. The loader
// injects the crate script on demand and initializes it only when the
// flag is on.
export function initWidgetBot(enabled) {
  if (!enabled) return;
  if (document.querySelector('script[src*="widgetbot"]')) return;
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@widgetbot/crate@3";
  script.async = true;
  script.onload = () => {
    try {
      new Crate({
        server: "967111927299969064",
        channel: "967111927740366888",
      });
    } catch { /* widget init is best-effort */ }
  };
  document.head.appendChild(script);
}
