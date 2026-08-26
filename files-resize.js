// files-resize.js — sidebar resize logic for the Files panel: pointer
// dragging (mouse + touch) and keyboard arrow stepping. Split out of
// files.js so the panel module stays under the 500-line rule.
import { useEffect, useRef, useState } from "react";

export function useFilesSidebarResize({ stackedLayout, panelRef }) {
  const sidebarResizeRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarHeight, setSidebarHeight] = useState(220);

  useEffect(() => () => {
    document.body.classList.remove("files-resizing", "files-resizing-row");
  }, []);

  const startSidebarResize = (event) => {
    if (event.button !== 0) return;
    const panelBounds = panelRef.current?.getBoundingClientRect();
    if (!panelBounds) return;
    event.preventDefault();
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      stacked: stackedLayout,
      panelLeft: panelBounds.left,
      panelTop: panelBounds.top,
      maxSize: stackedLayout
        ? Math.max(130, panelBounds.height - 180)
        : Math.max(190, panelBounds.width - 240),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add(
      stackedLayout ? "files-resizing-row" : "files-resizing",
    );
  };

  const resizeSidebar = (event) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextSize = resize.stacked
      ? event.clientY - resize.panelTop
      : event.clientX - resize.panelLeft;
    if (resize.stacked) {
      setSidebarHeight(Math.max(130, Math.min(resize.maxSize, nextSize)));
    } else {
      setSidebarWidth(Math.max(190, Math.min(resize.maxSize, nextSize)));
    }
  };

  const stopSidebarResize = (event) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    sidebarResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove("files-resizing", "files-resizing-row");
  };

  const resizeSidebarBy = (delta) => {
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    if (stackedLayout) {
      const max = Math.max(130, bounds.height - 180);
      setSidebarHeight((height) => Math.max(130, Math.min(max, height + delta)));
    } else {
      const max = Math.max(190, bounds.width - 240);
      setSidebarWidth((width) => Math.max(190, Math.min(max, width + delta)));
    }
  };

  return {
    sidebarWidth,
    sidebarHeight,
    startSidebarResize,
    resizeSidebar,
    stopSidebarResize,
    resizeSidebarBy,
  };
}
