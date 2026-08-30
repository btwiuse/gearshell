// Crush Runner panel parts: the hero, install banner, preset tiles,
// editor toggle, CTA row and status line as standalone components
// (split out of crush-panel.js so no component exceeds 50 lines and
// no file exceeds the 500-line budget). All state and handlers come
// from the controller via props.

import React from "react";
import {
  ArrowRight,
  Download,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { crushRunnerDep } from "./crush-deps.js?v=20260828.4";
import { detectCrushInstallation } from "./crush-install.js?v=20260828.141";
import htm from "htm";

const html = htm.bind(React.createElement);

function CrushInstallBody({
  crushInstalled,
  detectSource,
  installing,
  handleInstall,
}) {
  const via = (detectSource.split(" → ")[0]) || "which crush";
  const path = (detectSource.split(" → ")[1]) || "crush";
  return html`
    <div className="crush-runner-install-body">
      <div className="crush-runner-install-title">
        ${crushInstalled === null
          ? "Checking Crush installation…"
          : crushInstalled
          ? `Crush is installed and ready to launch · ${via}`
          : "Crush is not installed"}
      </div>
      <p className="crush-runner-install-copy">
        ${crushInstalled === null
          ? "Probing the kernel environment with \\`command -v crush\\`."
          : crushInstalled
          ? html`
              <span>
                Resolved at <code>${path}</code>. Press Launch below to open a session with the configured profile.
              </span>
            `
          : html`
              <span>
                \`which crush\` returned no match. Trigger <code>w9y mod apply crush</code> to download and bind the Crush binary, then come back to launch it.
              </span>
            `}
      </p>
      ${crushInstalled !== true &&
        html`<${CrushInstallActions} crushInstalled=${crushInstalled} installing=${installing} handleInstall=${handleInstall}/>`}
    </div>
  `;
}

function CrushInstallIcon({ crushInstalled }) {
  return html`
    <div className="crush-runner-install-icon" aria-hidden=${true}>
      ${crushInstalled === null
        ? html`<${RefreshCw} size=${18} className="crush-runner-install-spin"/>`
        : crushInstalled
        ? html`<${Rocket} size=${18}/>`
        : html`<${Download} size=${18}/>`}
    </div>
  `;
}

function CrushInstallActions({ crushInstalled, installing, handleInstall }) {
  return html`
    <div className="crush-runner-install-actions">
      <code className="crush-runner-install-cmd">$ w9y mod apply crush</code>
      <button
        className="mkt-btn mkt-btn-primary crush-runner-install-btn"
        type="button"
        onClick=${handleInstall}
        disabled=${installing || crushInstalled === null}
        aria-label="Install Crush"
        title=${crushInstalled === null
          ? "Waiting for detection to finish"
          : "Run w9y mod apply crush"}
      >
        <${installing ? RefreshCw : Download}
          size=${14}
          aria-hidden=${true}
          className=${installing ? "crush-runner-install-spin" : undefined}
        />
        <span>${installing ? "Installing…" : "Install Crush"}</span>
      </button>
    </div>
  `;
}

async function recheckInstall(ctx) {
  ctx.programAutoManagedRef.current = true;
  ctx.setCrushInstalled(null);
  ctx.setDetectSource("re-detecting via which crush…");
  const result = await detectCrushInstallation();
  if (result) {
    ctx.setCrushInstalled(result.installed);
    ctx.setDetectSource(
      result.path
        ? `${result.via} → ${result.path}`
        : (result.via || "which crush"),
    );
    if (result.installed && result.path) {
      ctx.applyDetectedProgram(result.path);
    }
  }
}

function CrushBannerControls(
  { installing, setInstallBannerDismissed, recheckCtx },
) {
  return html`
    <${React.Fragment}>
      ${!installing &&
        html`<button
          type="button"
          className="mkt-btn mkt-btn-ghost crush-runner-install-recheck"
          onClick=${() => recheckInstall(recheckCtx)}
          title="Re-run which crush and sync the program field to the resolved path"
          aria-label="Re-check Crush installation"
        >
          <${RefreshCw} size=${11} aria-hidden=${true}/>
        </button>`}
      <button
        type="button"
        className="crush-runner-install-close"
        onClick=${() => setInstallBannerDismissed(true)}
        title="Hide the install banner for this session"
        aria-label="Hide the install banner"
      >
        <${X} size=${12} aria-hidden=${true}/>
      </button>
    </${React.Fragment}>
  `;
}

export function CrushInstallBanner(props) {
  const {
    crushInstalled,
    installing,
    detectSource,
    setInstallBannerDismissed,
    handleInstall,
    recheckCtx,
  } = props;
  return html`
    <div
      className="crush-runner-install"
      data-state=${crushInstalled === null
        ? "checking"
        : crushInstalled
        ? "installed"
        : "missing"}
    >
      <${CrushBannerControls} installing=${installing} setInstallBannerDismissed=${setInstallBannerDismissed} recheckCtx=${recheckCtx}/>
      <${CrushInstallIcon} crushInstalled=${crushInstalled}/>
      <${CrushInstallBody} crushInstalled=${crushInstalled} detectSource=${detectSource} installing=${installing} handleInstall=${handleInstall}/>
    </div>
  `;
}

export function CrushPresetTile({ preset, isActive, isDirty, onActivate }) {
  const iconCatalog = crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID");
  const Icon = (iconCatalog[preset.icon] || iconCatalog.bot ||
    iconCatalog.terminal).icon;
  return html`
    <button
      key=${preset.id}
      type="button"
      role="radio"
      aria-checked=${isActive}
      aria-label=${isActive
        ? `Currently editing ${preset.name}`
        : `Switch to ${preset.name}`}
      className=${`crush-runner-preset-tile${isActive ? " selected" : ""}${
        preset.builtin ? " builtin" : ""
      }`}
      title=${preset.builtin
        ? `Built-in ${preset.name}`
        : `${preset.name} preset`}
      onClick=${() => onActivate(preset)}
    >
      <${Icon} size=${22} aria-hidden=${true}/>
      <span className="crush-runner-preset-tile-name">${preset.name}</span>
      ${isActive && isDirty &&
        html`<span
          className="crush-runner-preset-tile-dirty"
          aria-label="Modified"
          title="Form differs from this preset"
        >•</span>`}
    </button>
  `;
}

export function CrushPresetBar({
  presets,
  activePreset,
  isDirty,
  activatePreset,
  saveAsNewPreset,
}) {
  return html`
    <div
      className="crush-runner-presets"
      role="radiogroup"
      aria-label="Crush presets"
    >
      ${presets.map((preset) =>
        html`<${CrushPresetTile}
          key=${preset.id}
          preset=${preset}
          isActive=${preset.id === activePreset.id}
          isDirty=${isDirty}
          onActivate=${activatePreset}
        />`,
      )}
      <button
        type="button"
        className="crush-runner-preset-tile crush-runner-preset-tile-add"
        title="Save current form as a new preset"
        aria-label="Save current form as a new preset"
        onClick=${saveAsNewPreset}
      >
        <${Plus} size=${22} aria-hidden=${true}/>
        <span>New</span>
      </button>
    </div>
  `;
}

export function CrushEditorToggle({ formExpanded, setFormExpanded }) {
  return html`
    <button
      type="button"
      className="crush-runner-editor-toggle"
      aria-expanded=${formExpanded}
      aria-controls="crush-runner-config"
      onClick=${() => setFormExpanded((value) => !value)}
    >
      <${SlidersHorizontal} size=${14} aria-hidden=${true}/>
      <span>${formExpanded ? "Hide editor" : "Edit preset"}</span>
    </button>
  `;
}

function CrushLaunchButton({
  crushInstalled,
  installing,
  commandPreview,
  launchCrush,
}) {
  return html`
    <button
      className="mkt-btn mkt-btn-primary crush-runner-launch"
      type="button"
      onClick=${launchCrush}
      disabled=${crushInstalled !== true || installing}
      title=${crushInstalled === null
        ? "Checking…"
        : crushInstalled === true
        ? (commandPreview || "crush")
        : "Install Crush first to enable launching"}
      aria-label="Launch"
    >
      <${crushInstalled === null ? RefreshCw : Zap}
        size=${16}
        aria-hidden=${true}
        className=${crushInstalled === null
          ? "crush-runner-install-spin"
          : undefined}
      />
      <span>${crushInstalled === null ? "Checking…" : "Launch"}</span>
      ${crushInstalled !== null &&
        html`<${ArrowRight} size=${14} aria-hidden=${true}/>`}
    </button>
  `;
}

function CrushRemoveButton({ activePreset, deleteActivePreset }) {
  return html`
    <button
      type="button"
      className="crush-runner-preset-remove"
      title=${`Remove "${activePreset.name}" preset`}
      onClick=${() => {
        if (
          window.confirm(
            `Remove preset "${activePreset.name}"? Built-in Crush will become active again.`,
          )
        ) {
          deleteActivePreset();
        }
      }}
    >
      <${RefreshCw} size=${13} aria-hidden=${true}/>
      <span>Remove</span>
    </button>
  `;
}

export function CrushCtaRow({
  activePreset,
  isDirty,
  crushInstalled,
  installing,
  commandPreview,
  deleteActivePreset,
  saveUpdates,
  launchCrush,
}) {
  return html`
    <div className="crush-runner-cta">
      ${!activePreset.builtin && html`<${CrushRemoveButton} activePreset=${activePreset} deleteActivePreset=${deleteActivePreset}/>`}
      <div className="crush-runner-cta-actions">
        <button
          className="mkt-btn mkt-btn-ghost"
          type="button"
          onClick=${saveUpdates}
          disabled=${!isDirty}
          title=${`Save updates to the active preset "${activePreset.name}"`}
        >
          <${Save} size=${16} aria-hidden=${true}/>
          <span>Save</span>
        </button>
        <${CrushLaunchButton} crushInstalled=${crushInstalled} installing=${installing} commandPreview=${commandPreview} launchCrush=${launchCrush}/>
      </div>
    </div>
  `;
}

export function CrushRunnerStatus({ status }) {
  return html`
    <p
      className="crush-runner-status"
      role="status"
      aria-live="polite"
      data-error=${status.isError || undefined}
      hidden=${!status.message}
    >${status.message}</p>
  `;
}
