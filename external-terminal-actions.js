const actions = new Map();

export function registerExternalTerminalAction(name, action) {
  actions.set(name, action);
}

export function getExternalTerminalAction(name) {
  return actions.get(name) ?? null;
}
