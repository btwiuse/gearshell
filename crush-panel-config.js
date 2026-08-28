// The configuration section of the Crush Runner panel: a tab bar
// (Profile / crushrc / Env / JSON) over the matching editors. The tab
// bodies live in crush-panel-tabs.js; this module only builds the tab
// list and renders the active tab. It only ever reads the `ctl` object
// the panel controller returns.

import React from "react";
import { Braces, FileCode, KeyRound, User } from "lucide-react";
import {
  CrushCrushrcTab,
  CrushEnvTab,
  CrushJsonTab,
  CrushProfileTab,
} from "./crush-panel-tabs.js?v=20260828.1";

function tabArrowKeyNav(event, tabs, activeTab, setActiveTab) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const idx = tabs.findIndex((tab) => tab.id === activeTab);
  if (idx === -1) return;
  const nextIdx = event.key === "ArrowLeft"
    ? (idx - 1 + tabs.length) % tabs.length
    : (idx + 1) % tabs.length;
  event.preventDefault();
  setActiveTab(tabs[nextIdx].id);
}

function buildTabs(ctl) {
  return [
    {
      id: "profile",
      label: "Profile",
      Icon: User,
      dirty: ctl.profileDirty,
      render: () => React.createElement(CrushProfileTab, { ctl }),
    },
    {
      id: "config",
      label: "crushrc",
      Icon: FileCode,
      dirty: ctl.configDirty,
      render: () => React.createElement(CrushCrushrcTab, { ctl }),
    },
    {
      id: "env",
      label: "Env",
      Icon: KeyRound,
      dirty: ctl.envDirty,
      render: () => React.createElement(CrushEnvTab, { ctl }),
    },
    {
      id: "json",
      label: "JSON",
      Icon: Braces,
      dirty: ctl.jsonDraftDirty,
      render: () => React.createElement(CrushJsonTab, { ctl }),
    },
  ];
}

function CrushTabBar({ tabs, activeTab, setActiveTab }) {
  return React.createElement(
    "div",
    {
      className: "crush-runner-tabs",
      role: "tablist",
      "aria-label": "Crush configuration",
    },
    tabs.map((tab) => {
      const isActive = tab.id === activeTab;
      return React.createElement(
        "button",
        {
          key: tab.id,
          type: "button",
          role: "tab",
          id: `crush-runner-tab-${tab.id}`,
          "aria-selected": isActive,
          "aria-controls": "crush-runner-tab-panel",
          tabIndex: isActive ? 0 : -1,
          className: `crush-runner-tab${isActive ? " active" : ""}`,
          onClick: () => setActiveTab(tab.id),
          onKeyDown: (event) =>
            tabArrowKeyNav(event, tabs, activeTab, setActiveTab),
        },
        tab.Icon && React.createElement(tab.Icon, {
          size: 14,
          "aria-hidden": true,
        }),
        React.createElement("span", {
          className: "crush-runner-tab-label",
        }, tab.label),
        tab.dirty &&
          React.createElement("span", {
            className: "crush-runner-tab-dirty",
            "aria-label": "Unsaved changes",
            title: "Unsaved changes",
          }, "*"),
      );
    }),
  );
}

export function CrushConfigSection({ ctl }) {
  const { formExpanded, crushInstalled, activeTab, setActiveTab, savedMarker } =
    ctl;

  if (!(crushInstalled === true && formExpanded)) return null;

  const tabs = buildTabs(ctl);
  const activeEntry = tabs.find((tab) => tab.id === activeTab) ||
    tabs[0];

  return React.createElement(
    "section",
    {
      className: "crush-runner-config",
      id: "crush-runner-config",
    },
    React.createElement(CrushTabBar, { tabs, activeTab, setActiveTab }),
    React.createElement("div", {
      className: "crush-runner-section crush-runner-tab-section",
      role: "tabpanel",
      id: "crush-runner-tab-panel",
      "aria-labelledby": `crush-runner-tab-${activeEntry.id}`,
    }, activeEntry.render()),
    // The dedicated Terminal preview section was redundant with the
    // Launch / Restart CTAs in the hero: every preview path opens a
    // Crush session in a real dockview tab, so collapsing the inline
    // overlay left no UI to render here. The "Copy profile JSON"
    // action moved down to the crushrc tab footer next to the
    // reset button so debugging tools stay next to the data they dump.
    React.createElement(
      "p",
      { className: "crush-runner-footer" },
      `Profile last refreshed ${
        savedMarker === 0 ? "on first load" : "after the most recent save"
      }. Changes live in this panel until you press “Save as default”.`,
    ),
  );
}
