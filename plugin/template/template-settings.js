// template-settings.js — the Plugin Template settings section.
//
// registerSettingsSection render contract: a DOM function
//   (root, ctx) => disposeFn
// called with an empty <div> from the Settings page and the same
// permission-scoped ctx.api the panel gets. Return a cleanup function;
// it runs when the section unmounts or the user leaves Settings.

export function TemplateSettingsSection(root, ctx) {
  const manifest = ctx.manifest || {};
  root.className = "template-settings";
  root.innerHTML =
    "<h3>Plugin Template</h3>" +
    "<p>A settings section contributed by the template plugin. The render " +
    "contract is <code>(root, ctx) =&gt; dispose</code>: mount DOM into " +
    "root, return a cleanup function.</p>" +
    "<dl>" +
    "<dt>manifest.id</dt><dd>" + String(manifest.id || "") + "</dd>" +
    "<dt>manifest.version</dt><dd>" + String(manifest.version || "") + "</dd>" +
    "<dt>ctx.api</dt><dd>the permission-scoped API (tasks.create, " +
    "events.on, w9y.list, ...) — same object the panel sees</dd>" +
    "</dl>";
  return () => {
    root.innerHTML = "";
  };
}
