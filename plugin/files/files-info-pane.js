// files-info-pane.js — the Files info pane component (state + layout
// shell). The body renderers live in files-info-pane-body.js and the
// pure formatting/sorting helpers in files-info.js (500-line splits).
import React from "react";
import { sortFilesEntries } from "./files-info.js?v=20260826.42";
import {
  entryTypeLabel,
  makeChildInteraction,
  renderInfoFooter,
  renderPreviewBody,
  renderViewToolbar,
} from "./files-info-pane-body.js?v=20260826.42";

// Selection is in-pane: single click highlights a tile and shows its
// details in the footer; the grid stays put so a double click reliably
// reaches the same tile. Clears on navigation.
function useInfoSelectionReset(info) {
  const [selectedChild, setSelectedChild] = React.useState(null);
  React.useEffect(() => {
    setSelectedChild(null);
  }, [info && info.path]);
  return [selectedChild, setSelectedChild];
}

// The info pane is laid out like a mini page: a view/sort toolbar on
// top, the contents (media preview, text excerpt, or the directory
// listing tiled edge-to-edge) as the scrolling body, and the entry
// metadata in a footer strip at the bottom.
export function FilesInfoPane({
  info,
  onOpenChild,
  onSelectChild,
  finePointer = true,
  viewMode = "grid",
  onViewModeChange,
  sort = { by: "name", desc: false },
  onSortChange,
  columnWidths = { size: 80, mtime: 164 },
  onColumnWidthChange,
}) {
  const [selectedChild, setSelectedChild] = useInfoSelectionReset(info);
  if (!info) return null;
  const basePathText = String(info.path).replace(/^\/+/, "").replace(/^\.$/, "")
    .replace(/\/+$/, "");
  const typeLabel = entryTypeLabel(info);
  const showChildren = info.isDirectory && info.children != null;
  const children = showChildren ? sortFilesEntries(info.children, sort) : [];
  const makeInteraction = (child) =>
    makeChildInteraction({
      child,
      finePointer,
      onOpenChild,
      onSelectChild,
      setSelectedChild,
    });
  const previewInfo = {
    ...info,
    children,
    sort,
    onSortChange,
    columnWidths,
    onColumnWidthChange,
  };
  return React.createElement(
    "div",
    {
      className: "files-info",
      style: {
        "--files-col-size": `${columnWidths.size}px`,
        "--files-col-mtime": `${columnWidths.mtime}px`,
      },
    },
    showChildren &&
      renderViewToolbar({ viewMode, sort, onViewModeChange, onSortChange }),
    React.createElement(
      "div",
      { className: "files-info-body" },
      renderPreviewBody({
        info: previewInfo,
        isGrid: viewMode === "grid",
        makeInteraction,
        selectedChild,
        showChildren,
      }),
    ),
    renderInfoFooter({ info, selectedChild, basePathText, typeLabel }),
  );
}
