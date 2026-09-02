// launcher-menu.js — the "+" panel-action menu: the tap/long-press/right-
// click Add control, the all-apps menu it opens, the Wagi-Dog toggle, and
// the keyboard-shortcut cheat sheet (split out of launcher.js for the
// 500-line rule). Deps come through launcher.js's launcherDep shim.

import React, { useEffect, useRef, useState } from "react";
import { Check, Dog, Keyboard, Plus } from "lucide-react";
import { launcherDep, TerminalLaunchPicker } from "./launcher.js";
import htm from "htm";

const html = htm.bind(React.createElement);

// === Plus button: tap creates a terminal, long-press opens the
// extensions menu. Renders the panel-action-menu next to the dockview
// tab strip, with launcher buttons for each enabled panel + a Wagi-Dog
// toggle. Reuses TerminalLaunchPicker above for the Terminal entry.

function usePanelActionMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Long-press feedback: the button highlights while the pointer is held
  // so desktop users can discover that holding opens the all-apps menu.
  const [pressing, setPressing] = useState(false);
  const controlRef = useRef(null);
  const pressTimer = useRef(null);
  const longPress = useRef(false);

  useEffect(() => {
    const groupView = controlRef.current?.closest(".dv-groupview");
    groupView?.classList.add("panel-action-host");
    return () => groupView?.classList.remove("panel-action-host");
  }, []);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setPressing(false);
  };

  const openMenu = () => {
    clearPressTimer();
    longPress.current = true;
    setMenuOpen(true);
  };

  const startPress = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPress.current = false;
    setPressing(true);
    pressTimer.current = setTimeout(openMenu, 450);
  };

  useCloseMenuOnOutsidePointer(menuOpen, setMenuOpen, setPressing, controlRef);

  return {
    menuOpen,
    setMenuOpen,
    controlRef,
    clearPressTimer,
    openMenu,
    startPress,
    longPress,
    pressing,
  };
}

// Close the all-apps menu on any pointer press outside the + control.
function useCloseMenuOnOutsidePointer(
  menuOpen,
  setMenuOpen,
  setPressing,
  controlRef,
) {
  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event) => {
      if (!controlRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setPressing(false);
      }
    };
    document.addEventListener("pointerdown", closeMenu, true);
    return () => document.removeEventListener("pointerdown", closeMenu, true);
  }, [menuOpen, setMenuOpen, setPressing, controlRef]);
}

function useWagiDogSync() {
  const [wagiDogEnabled, setWagiDogEnabledState] = useState(() =>
    launcherDep("loadConfig")().wagiDogEnabled
  );
  useEffect(() => {
    const syncWagiDog = () =>
      setWagiDogEnabledState(launcherDep("loadConfig")().wagiDogEnabled);
    window.addEventListener(
      launcherDep("WORKSPACE_CHANGED_EVENT"),
      syncWagiDog,
    );
    return () =>
      window.removeEventListener(
        launcherDep("WORKSPACE_CHANGED_EVENT"),
        syncWagiDog,
      );
  }, []);
  return wagiDogEnabled;
}

function renderWagiDogItem({ wagiDogEnabled }) {
  return html`
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked=${wagiDogEnabled}
      onClick=${() => launcherDep("setWagiDogEnabled")(!wagiDogEnabled)}
    >
      <${Dog} size=${16} aria-hidden=${true}/>
      <span>Wagi Dog</span>
      ${wagiDogEnabled &&
        html`<${Check} className="panel-action-menu-check" size=${15} aria-label="Enabled"/>`}
    </button>
  `;
}

function renderPanelOptionItems({ containerApi, group, setMenuOpen }) {
  return launcherDep("PANEL_CREATION_OPTIONS").filter((option) =>
    option.component !== "console"
  ).map((option) =>
    html`
      <button
        key=${option.component}
        type="button"
        role="menuitem"
        onClick=${(event) => {
          setMenuOpen(false);
          launcherDep("addPanelByComponent")(
            containerApi,
            option.component,
            group,
            event.shiftKey ? { direction: "right" } : undefined,
          );
        }}
      >
        <${option.icon} size=${16} aria-hidden=${true}/>
        <span>${option.label}</span>
      </button>
    `,
  );
}

// Keyboard-shortcut cheat sheet inside the all-apps menu (P7). Toggle
// rather than a modal so it works inside the dockview header overlay.
function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const rows = [
    ["Ctrl+Shift+M", "Move the panel between panes"],
    ["Shift+click", "Open an app in a new pane"],
    ["Long-press / right-click +", "Open the all-apps menu"],
    ["Arrow keys", "Navigate this menu"],
  ];
  return html`
    <div>
      <button
        type="button"
        role="menuitem"
        aria-expanded=${open}
        onClick=${() => setOpen((value) => !value)}
      >
        <${Keyboard} size=${16} aria-hidden=${true}/>
        <span>Keyboard shortcuts</span>
      </button>
      ${open &&
        html`
          <div className="panel-action-menu-shortcuts">
            ${rows.map(([kbd, label]) =>
              html`
                <div key=${kbd} className="panel-action-menu-shortcuts-row">
                  <kbd>${kbd}</kbd>
                  ${label}
                </div>
              `,
            )}
          </div>
        `}
    </div>
  `;
}

function renderPanelActionMenu(
  { containerApi, group, setMenuOpen, wagiDogEnabled, menuRef },
) {
  return html`
    <div className="panel-action-menu" role="menu" ref=${menuRef}>
      <${TerminalLaunchPicker}
        className="panel-action-terminal-launch"
        iconSize=${16}
        inMenu=${true}
        onLaunch=${(profile) => {
          setMenuOpen(false);
          launcherDep("addTerminalPanel")(containerApi, group, profile);
        }}
      />
      <div className="panel-action-menu-divider" role="separator"></div>
      ${renderWagiDogItem({ wagiDogEnabled })}
      ${renderPanelOptionItems({ containerApi, group, setMenuOpen })}
      <div className="panel-action-menu-divider" role="separator"></div>
      <${ShortcutsHelp}/>
      <div className="panel-action-menu-hint">
        <span>Shift+click: open in a new pane</span>
      </div>
      <div className="panel-action-menu-hint">
        <span>Tip: long-press or right-click + for all apps</span>
      </div>
    </div>
  `;
}

// Menu keyboard pattern (P3): opening focuses the first item; arrows move
// between visible items, Home/End jump, Escape closes and returns focus to
// the + button.
function useMenuKeyboardNav(menuOpen, setMenuOpen, controlRef, menuRef) {
  useEffect(() => {
    if (!menuOpen) return;
    const menu = menuRef.current;
    if (!menu) return;
    const focusable = () =>
      [...menu.querySelectorAll("button")].filter(
        (el) => el.offsetParent !== null,
      );
    const items = focusable();
    items[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        controlRef.current?.querySelector(".panel-action-button")?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const list = focusable();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement);
      let next;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = list.length - 1;
      else {
        next = (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) %
          list.length;
      }
      event.preventDefault();
      list[next]?.focus();
    };
    menu.addEventListener("keydown", onKeyDown);
    return () => menu.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, setMenuOpen, controlRef, menuRef]);
}

// The + control itself. Tap creates a terminal; long-press, right-click or
// Arrow keys open the all-apps menu (the pressing highlight + title make
// the gesture discoverable — P2).
function AddPanelButton(
  { pressing, menuOpen, startPress, clearPressTimer, openMenu, createTerminal },
) {
  return html`
    <button
      className=${"panel-action-button" +
        (pressing || menuOpen ? " pressing" : "")}
      type="button"
      title="Add panel — long-press or right-click for all apps"
      aria-label="Add panel"
      aria-haspopup="menu"
      aria-expanded=${menuOpen}
      onPointerDown=${startPress}
      onPointerUp=${clearPressTimer}
      onPointerCancel=${clearPressTimer}
      onPointerLeave=${clearPressTimer}
      onKeyDown=${(event) => {
        // Keyboard entry into the menu (right-click/long-press are pointer
        // gestures; arrows give keyboard users the same path).
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openMenu();
        }
      }}
      onContextMenu=${(event) => {
        event.preventDefault();
        openMenu();
      }}
      onClick=${createTerminal}
    >
      <${Plus} size=${18} aria-hidden=${true}/>
    </button>
  `;
}

function AddTerminalButton({ containerApi, group }) {
  const {
    menuOpen,
    setMenuOpen,
    controlRef,
    clearPressTimer,
    openMenu,
    startPress,
    longPress,
    pressing,
  } = usePanelActionMenu();
  const wagiDogEnabled = useWagiDogSync();
  const menuRef = useRef(null);
  useMenuKeyboardNav(menuOpen, setMenuOpen, controlRef, menuRef);

  const createTerminal = (event) => {
    if (longPress.current) {
      event.preventDefault();
      longPress.current = false;
      return;
    }
    launcherDep("addTerminalPanel")(containerApi, group);
  };

  return html`
    <div ref=${controlRef} className="panel-actions">
      <${AddPanelButton} pressing=${pressing} menuOpen=${menuOpen} startPress=${startPress} clearPressTimer=${clearPressTimer} openMenu=${openMenu} createTerminal=${createTerminal}/>
      ${menuOpen &&
        renderPanelActionMenu({
          containerApi,
          group,
          setMenuOpen,
          wagiDogEnabled,
          menuRef,
        })}
    </div>
  `;
}

export { AddTerminalButton };

// === Plus button: tap creates a terminal, long-press opens the
// extensions menu. Renders the panel-action-menu next to the dockview
// tab strip, with launcher buttons for each enabled panel + a Wagi-Dog
// toggle. Reuses TerminalLaunchPicker above for the Terminal entry.
