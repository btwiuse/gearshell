// app-panel-ids.js — central panel id counter registry.
//
// Every panel adder mints its dockview panel id through nextPanelId, so
// there is exactly one counter per id prefix (home-, terminal-,
// workspace-task-, …). After a dockview fromJSON restore brings panels
// back with their saved ids, reservePanelIds lifts every counter past
// the largest restored id — otherwise the module counters (which reset
// on reload) would mint e.g. terminal-1 again while a restored
// terminal-1 already exists, and dockview would reject the duplicate.

const counters = new Map();

export function nextPanelId(prefix) {
  const next = (counters.get(prefix) || 0) + 1;
  counters.set(prefix, next);
  return `${prefix}-${next}`;
}

export function nextPanelIndex(prefix) {
  const next = (counters.get(prefix) || 0) + 1;
  counters.set(prefix, next);
  return next;
}

// Lift counters past the ids already present (e.g. panels restored from
// a saved layout). Ids must look like "<prefix>-<number>" ("home-1",
// "workspace-task-3"); anything else is ignored.
export function reservePanelIds(panels) {
  for (const panel of panels) {
    const match = /^([a-z-]+)-(\d+)$/.exec(panel.id);
    if (!match) continue;
    const number = Number(match[2]);
    if (Number.isFinite(number) && number > (counters.get(match[1]) || 0)) {
      counters.set(match[1], number);
    }
  }
}
