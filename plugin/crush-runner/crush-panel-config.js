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
} from "./crush-panel-tabs.js?v=20260828.3";
import htm from "htm";

const html = htm.bind(React.createElement);

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
      render: () => html`<${CrushProfileTab} ctl=${ctl}/>`,
    },
    {
      id: "config",
      label: "crushrc",
      Icon: FileCode,
      dirty: ctl.configDirty,
      render: () => html`<${CrushCrushrcTab} ctl=${ctl}/>`,
    },
    {
      id: "env",
      label: "Env",
      Icon: KeyRound,
      dirty: ctl.envDirty,
      render: () => html`<${CrushEnvTab} ctl=${ctl}/>`,
    },
    {
      id: "json",
      label: "JSON",
      Icon: Braces,
      dirty: ctl.jsonDraftDirty,
      render: () => html`<${CrushJsonTab} ctl=${ctl}/>`,
    },
  ];
}

function CrushTabBar({ tabs, activeTab, setActiveTab }) {
  return html`
    <div
      className="crush-runner-tabs"
      role="tablist"
      aria-label="Crush configuration"
    >
      ${tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return html`
          <button
            key=${tab.id}
            type="button"
            role="tab"
            id=${`crush-runner-tab-${tab.id}`}
            aria-selected=${isActive}
            aria-controls="crush-runner-tab-panel"
            tabIndex=${isActive ? 0 : -1}
            className=${`crush-runner-tab${isActive ? " active" : ""}`}
            onClick=${() => setActiveTab(tab.id)}
            onKeyDown=${(event) =>
              tabArrowKeyNav(event, tabs, activeTab, setActiveTab)}
          >
            ${tab.Icon && html`<${tab.Icon} size=${14} aria-hidden=${true}/>`}
            <span className="crush-runner-tab-label">${tab.label}</span>
            ${tab.dirty &&
              html`<span
                className="crush-runner-tab-dirty"
                aria-label="Unsaved changes"
                title="Unsaved changes"
              >*</span>`}
          </button>
        `;
      })}
    </div>
  `;
}

export function CrushConfigSection({ ctl }) {
  const { formExpanded, crushInstalled, activeTab, setActiveTab, savedMarker } =
    ctl;

  if (!(crushInstalled === true && formExpanded)) return null;

  const tabs = buildTabs(ctl);
  const activeEntry = tabs.find((tab) => tab.id === activeTab) ||
    tabs[0];

  return html`
    <section className="crush-runner-config" id="crush-runner-config">
      <${CrushTabBar} tabs=${tabs} activeTab=${activeTab} setActiveTab=${setActiveTab}/>
      <div
        className="crush-runner-section crush-runner-tab-section"
        role="tabpanel"
        id="crush-runner-tab-panel"
        aria-labelledby=${`crush-runner-tab-${activeEntry.id}`}
      >${activeEntry.render()}</div>
      <p className="crush-runner-footer">
        Profile last refreshed ${
          savedMarker === 0 ? "on first load" : "after the most recent save"
        }. Changes live in this panel until you press “Save as default”.
      </p>
    </section>
  `;
}
