// Render the Bonsai history side panel: list every persisted session
// with a small Open / Delete action. The host wiring lives in app.js,
// but DOM construction is self-contained so the panel can be re-rendered
// in isolation.

function buildSessionRow({ entry, sessionId, onOpen, onDelete }) {
  const row = document.createElement("div");
  row.className = "h-row" + (entry.id === sessionId ? " active" : "");

  const title = document.createElement("div");
  title.className = "h-title";
  title.textContent = entry.title || "Untitled chat";

  const meta = document.createElement("div");
  meta.className = "h-meta";
  meta.textContent = new Date(entry.updatedAt).toLocaleString();

  const actions = document.createElement("div");
  actions.className = "h-actions";
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Open";
  open.addEventListener("click", () => onOpen(entry.id));
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Delete";
  del.addEventListener("click", () => onDelete(entry.id));
  actions.append(open, del);

  row.append(title, meta, actions);
  return row;
}

export function renderHistoryPanel({ panel, sessionId, index, onOpen, onDelete }) {
  if (!panel) return;
  panel.replaceChildren();
  if (index.length === 0) {
    const empty = document.createElement("div");
    empty.className = "h-empty";
    empty.textContent = "No saved chats yet. Bonsai saves each conversation automatically.";
    panel.appendChild(empty);
    return;
  }
  for (const entry of index) {
    panel.appendChild(buildSessionRow({ entry, sessionId, onOpen, onDelete }));
  }
}
