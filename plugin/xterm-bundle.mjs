// plugin/xterm-bundle.mjs — one import for every plugin terminal.
//
// Every plugin page that renders its own xterm loads the exact same set
// and versions as the wanix kernel's terminal (elements/term.js +
// package.json beta tags): @xterm/xterm@6.1.0-beta.304 with the
// clipboard / fit / image / progress / unicode11 / web-links addons and
// xterm-addon-cursor-trail. Keeping the URLs here (instead of inline in
// each page) guarantees the plugins stay consistent with each other and
// with the host terminal.
//
// Usage:
//   const libs = await loadXtermBundle();
//   const xterm = new libs.Terminal({ ... });
//   xterm.open(host);
//   applyXtermAddons(xterm, libs);   // clipboard, image, cursor trail,
//                                    // unicode11, web links, progress

export const XTERM_BUNDLE = {
  xterm:
    "https://cdn.jsdelivr.net/npm/@xterm/xterm@6.1.0-beta.304/lib/xterm.mjs",
  fit:
    "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.12.0-beta.301/lib/addon-fit.mjs",
  clipboard:
    "https://cdn.jsdelivr.net/npm/@xterm/addon-clipboard@0.3.0-beta.303/lib/addon-clipboard.mjs",
  image:
    "https://cdn.jsdelivr.net/npm/@xterm/addon-image@0.10.0-beta.301/lib/addon-image.mjs",
  progress:
    "https://cdn.jsdelivr.net/npm/@xterm/addon-progress@0.3.0-beta.301/lib/addon-progress.mjs",
  unicode11:
    "https://cdn.jsdelivr.net/npm/@xterm/addon-unicode11@0.10.0-beta.301/lib/addon-unicode11.mjs",
  webLinks:
    "https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.13.0-beta.301/lib/addon-web-links.mjs",
  cursorTrail:
    "https://cdn.jsdelivr.net/npm/xterm-addon-cursor-trail@0.0.1/lib/addon-cursor-trail.mjs",
};

export async function loadXtermBundle() {
  const [xterm, fit, clipboard, image, progress, unicode11, webLinks, cursorTrail] =
    await Promise.all(Object.values(XTERM_BUNDLE).map((url) => import(url)));
  return {
    Terminal: xterm.Terminal,
    FitAddon: fit.FitAddon,
    ClipboardAddon: clipboard.ClipboardAddon,
    ImageAddon: image.ImageAddon,
    ProgressAddon: progress.ProgressAddon,
    Unicode11Addon: unicode11.Unicode11Addon,
    WebLinksAddon: webLinks.WebLinksAddon,
    CursorTrailAddon: cursorTrail.CursorTrailAddon,
  };
}

// Apply the wanix kernel's addon set to a freshly created xterm. Call
// after xterm.open(host) so the addons can bind to the DOM. The progress
// addon is always loaded: it only registers an OSC 9;4 escape handler and
// exposes an onChange event — it renders nothing itself, so a page that
// draws its own progress bar can load another ProgressAddon safely (xterm
// chains multiple handlers per OSC number) or listen to this one.
export function applyXtermAddons(xterm, libs) {
  xterm.loadAddon(new libs.ClipboardAddon());
  xterm.loadAddon(new libs.ImageAddon());
  xterm.loadAddon(new libs.CursorTrailAddon());
  xterm.loadAddon(new libs.Unicode11Addon());
  xterm.unicode.activeVersion = "11";
  xterm.loadAddon(new libs.WebLinksAddon());
  xterm.loadAddon(new libs.ProgressAddon());
}
