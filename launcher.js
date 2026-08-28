// Launcher: the empty-workspace Task Launcher card, plus the
// terminal-preset picker that shows the available terminal profiles
// when the user expands the Terminal launcher button.
//
// This module owns the `fallback` dockview panel. The Terminal
// launch picker, the empty-workspace launcher card, and the
// fallback / launcher panel registration all live here. The panel
// reads a lot of app.js globals (workspace config, panel-creation
// catalog, terminal profile helpers, dockview dispatch) so the
// dep shim is the load-bearing piece.
//
// Dependency-injection shim: app.js calls `initLauncher(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `launcherDep(name)`.
// Mirrors the same pattern used by home.js / settings.js /
// crush-runner.js / files.js / runtime.js / deck.js.

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Dog, Ellipsis, Plus } from "lucide-react";

let __launcherDeps = null;
export function initLauncher(dependencies) {
  __launcherDeps = dependencies;
}
function launcherDep(name) {
  if (__launcherDeps == null) {
    throw new Error(
      "launcher: initLauncher() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __launcherDeps[name];
  if (value === undefined) {
    throw new Error(`launcher: missing dependency ${name}`);
  }
  return value;
}

// Fallback launcher body for TerminalLaunchPicker:
function TerminalLaunchPrimary({ iconSize, menuRole, onLaunch }) {
  const defaultProfile = launcherDep("getDefaultTerminalProfile")();
  const DefaultIcon = launcherDep("getTerminalPresetIcon")(defaultProfile);
  return React.createElement(
    "button",
    {
      className: "terminal-launch-primary",
      type: "button",
      role: menuRole,
      title: launcherDep("terminalCommand")(defaultProfile),
      onClick: () => onLaunch(defaultProfile),
    },
    React.createElement(DefaultIcon, { size: iconSize, "aria-hidden": true }),
    React.createElement("span", null, "Terminal"),
  );
}

function TerminalProfileOptions({ iconSize, menuRole, onLaunch }) {
  return React.createElement(
    "div",
    {
      className: "terminal-launch-options",
      role: menuRole ? "menu" : undefined,
    },
    ...launcherDep("getTerminalProfiles")().map((profile) => {
      const Icon = launcherDep("getTerminalPresetIcon")(profile);
      return React.createElement(
        "button",
        {
          key: profile.id,
          type: "button",
          role: menuRole,
          title: launcherDep("terminalCommand")(profile),
          onClick: () => onLaunch(profile),
        },
        React.createElement(Icon, { size: iconSize, "aria-hidden": true }),
        React.createElement("span", null, profile.name),
      );
    }),
  );
}

function TerminalLaunchPicker(
  { className, iconSize, inMenu = false, onLaunch },
) {
  const [expanded, setExpanded] = useState(false);
  const menuRole = inMenu ? "menuitem" : undefined;

  return React.createElement(
    "div",
    { className: `terminal-launch-picker ${className}` },
    React.createElement(
      "div",
      { className: "terminal-launch-row" },
      React.createElement(TerminalLaunchPrimary, {
        iconSize,
        menuRole,
        onLaunch,
      }),
      React.createElement(
        "button",
        {
          className: "terminal-launch-toggle",
          type: "button",
          "aria-label": expanded
            ? "Hide terminal presets"
            : "Show terminal presets",
          "aria-expanded": expanded,
          onClick: () => setExpanded((open) => !open),
        },
        React.createElement(ChevronDown, {
          className: expanded
            ? "terminal-launch-chevron open"
            : "terminal-launch-chevron",
          size: 14,
          "aria-hidden": true,
        }),
      ),
    ),
    expanded &&
      React.createElement(TerminalProfileOptions, {
        iconSize,
        menuRole,
        onLaunch,
      }),
  );
}

// Fallback launcher body for FallbackPage:
function useLauncherCollapsedState() {
  const [showMore, setShowMore] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState(() =>
    launcherDep("loadConfig")().collapsedLauncherItems
  );

  useEffect(() => {
    const updateCollapsedItems = () => {
      setCollapsedItems(launcherDep("loadConfig")().collapsedLauncherItems);
      setShowMore(false);
    };
    window.addEventListener(
      launcherDep("WORKSPACE_CHANGED_EVENT"),
      updateCollapsedItems,
    );
    return () =>
      window.removeEventListener(
        launcherDep("WORKSPACE_CHANGED_EVENT"),
        updateCollapsedItems,
      );
  }, []);

  return { showMore, setShowMore, collapsedItems };
}

function renderLauncherOption(option, containerApi, addPanel) {
  return option.component === "terminal"
    ? React.createElement(TerminalLaunchPicker, {
      key: option.component,
      className: "empty-terminal-launch",
      iconSize: 18,
      onLaunch: (profile) =>
        containerApi &&
        launcherDep("addTerminalPanel")(containerApi, undefined, profile),
    })
    : React.createElement(
      "button",
      {
        key: option.component,
        type: "button",
        onClick: () => addPanel(option.component),
      },
      React.createElement(option.icon, { size: 18, "aria-hidden": true }),
      React.createElement("span", null, option.label),
    );
}

function LauncherMoreToggle({ showMore, setShowMore }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "launcher-more-toggle",
      "aria-expanded": showMore,
      onClick: () => setShowMore((expanded) => !expanded),
    },
    React.createElement(Ellipsis, { size: 18, "aria-hidden": true }),
    React.createElement("span", null, showMore ? "Less" : "More"),
  );
}

function FallbackPage({ containerApi, className }) {
  const { showMore, setShowMore, collapsedItems } = useLauncherCollapsedState();
  const addPanel = (component) => {
    if (!containerApi) return;
    launcherDep("addPanelByComponent")(containerApi, component);
  };
  const collapsed = new Set(collapsedItems);
  const options = launcherDep("normalizeLauncherOrder")(
    launcherDep("loadConfig")().launcherOrder,
  )
    .map((component) =>
      launcherDep("PANEL_CREATION_OPTIONS").find((option) =>
        option.component === component
      )
    )
    .filter(Boolean);
  const primaryOptions = options.filter((option) =>
    !collapsed.has(option.component)
  );
  const moreOptions = options.filter((option) =>
    collapsed.has(option.component)
  );
  return React.createElement(
    "div",
    { className },
    React.createElement(
      "div",
      { className: "empty-workspace-card" },
      React.createElement("p", null, "Task Launcher"),
      React.createElement(
        "div",
        { className: "empty-workspace-actions" },
        primaryOptions.map((option) =>
          renderLauncherOption(option, containerApi, addPanel)
        ),
        moreOptions.length > 0 &&
          React.createElement(LauncherMoreToggle, { showMore, setShowMore }),
        showMore &&
          React.createElement(
            "div",
            { className: "launcher-more-options" },
            moreOptions.map((option) =>
              renderLauncherOption(option, containerApi, addPanel)
            ),
          ),
      ),
    ),
  );
}

// Fallback launcher body for FallbackPanel:
function FallbackPanel({ containerApi }) {
  return React.createElement(FallbackPage, {
    containerApi,
    className: "fallback-panel panel-content",
  });
}

// === Panel registration ===
// Counter for unique fallback / launcher panel ids. The counter is
// module-scoped so it survives React re-renders but resets on page
// reload.
let fallbackIdCounter = 0;

// Register a new Fallback (Launcher) panel with dockview. Called from
// app.js's `addPanelByComponent` when the user picks Launcher from
// the panel menu, and from the restore-saved-panels path on boot.
export function addFallbackPanel(api, group) {
  const id = ++fallbackIdCounter;
  const panel = api.addPanel({
    id: `fallback-${id}`,
    component: "fallback",
    params: { fallbackId: id, panelType: "fallback" },
    title: "Launcher",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = launcherDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "fallback" });
  panel.api.setActive();
  return panel;
}

export { AddTerminalButton, FallbackPage, FallbackPanel, TerminalLaunchPicker };
function AddTerminalButton({ containerApi, group }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [wagiDogEnabled, setWagiDogEnabledState] = useState(() =>
    launcherDep("loadConfig")().wagiDogEnabled
  );
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
  };

  const openMenu = () => {
    clearPressTimer();
    longPress.current = true;
    setMenuOpen(true);
  };

  const startPress = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPress.current = false;
    pressTimer.current = setTimeout(openMenu, 450);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event) => {
      if (!controlRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu, true);
    return () => document.removeEventListener("pointerdown", closeMenu, true);
  }, [menuOpen]);

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

  const createTerminal = (event) => {
    if (longPress.current) {
      event.preventDefault();
      longPress.current = false;
      return;
    }
    launcherDep("addTerminalPanel")(containerApi, group);
  };

  return React.createElement(
    "div",
    { ref: controlRef, className: "panel-actions" },
    React.createElement("button", {
      className: "panel-action-button",
      type: "button",
      title: "Add",
      "aria-label": "Add panel",
      "aria-haspopup": "menu",
      "aria-expanded": menuOpen,
      onPointerDown: startPress,
      onPointerUp: clearPressTimer,
      onPointerCancel: clearPressTimer,
      onPointerLeave: clearPressTimer,
      onContextMenu: (event) => {
        event.preventDefault();
        openMenu();
      },
      onClick: createTerminal,
    }, React.createElement(Plus, { size: 18, "aria-hidden": true })),
    menuOpen &&
      React.createElement(
        "div",
        { className: "panel-action-menu", role: "menu" },
        React.createElement(TerminalLaunchPicker, {
          className: "panel-action-terminal-launch",
          iconSize: 16,
          inMenu: true,
          onLaunch: (profile) => {
            setMenuOpen(false);
            launcherDep("addTerminalPanel")(containerApi, group, profile);
          },
        }),
        React.createElement("div", {
          className: "panel-action-menu-divider",
          role: "separator",
        }),
        React.createElement(
          "button",
          {
            type: "button",
            role: "menuitemcheckbox",
            "aria-checked": wagiDogEnabled,
            onClick: () => launcherDep("setWagiDogEnabled")(!wagiDogEnabled),
          },
          React.createElement(Dog, { size: 16, "aria-hidden": true }),
          React.createElement("span", null, "Wagi Dog"),
          wagiDogEnabled &&
            React.createElement(Check, {
              className: "panel-action-menu-check",
              size: 15,
              "aria-label": "Enabled",
            }),
        ),
        launcherDep("PANEL_CREATION_OPTIONS").filter((option) =>
          option.component !== "terminal"
        ).map((option) =>
          React.createElement(
            "button",
            {
              key: option.component,
              type: "button",
              role: "menuitem",
              onClick: (event) => {
                setMenuOpen(false);
                launcherDep("addPanelByComponent")(
                  containerApi,
                  option.component,
                  group,
                  event.shiftKey ? { direction: "right" } : undefined,
                );
              },
            },
            React.createElement(option.icon, { size: 16, "aria-hidden": true }),
            React.createElement("span", null, option.label),
          )
        ),
        React.createElement(
          "div",
          { className: "panel-action-menu-hint" },
          React.createElement("span", null, "Shift+click: open in a new pane"),
        ),
      ),
  );
}

// === Plus button: tap creates a terminal, long-press opens the
// extensions menu. Renders the panel-action-menu next to the dockview
// tab strip, with launcher buttons for each enabled panel + a Wagi-Dog
// toggle. Reuses TerminalLaunchPicker above for the Terminal entry.
