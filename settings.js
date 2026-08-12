// Settings panel: a manual configuration page for the active workspace,
// the Wanix runtime, task mounts, and the built-in terminal presets.
//
// This module owns the `settings` dockview panel end-to-end. The HTML
// structure (formerly a <template> in index.html) is inlined as a
// string constant below and cloned into the panel on mount, so the
// panel is fully self-contained and index.html stays free of feature-
// specific markup. The shell calls the various `setup*Form` helpers
// via the deps shim; those helpers migrate into this module in
// follow-up commits so each step stays small and reviewable.
//
// Dependency-injection shim: app.js calls `initSettings(dependencies)`
// from the bottom of its module body, populating a small lookup table
// that the helpers below read lazily via `settingsDep(name)`. Mirrors
// the pattern used by crush-runner.js and home.js so neither file
// has to know about the other's internals.

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from "lucide-react";

let __settingsDeps = null;
export function initSettings(dependencies) {
  __settingsDeps = dependencies;
}
function settingsDep(name) {
  if (__settingsDeps == null) {
    throw new Error('settings: initSettings() has not been called; ensure app.js wires it in.');
  }
  const value = __settingsDeps[name];
  if (value === undefined) {
    throw new Error(`settings: missing dependency ${name}`);
  }
  return value;
}

// Inlined HTML for the Settings panel. The original `<template
// id="settings-template">` element lived in index.html; moving it here
// keeps the panel structure next to the React component that consumes
// it, so future edits to either happen in the same file. The string
// is assigned to `wrapper.innerHTML` and the resulting DOM is queried
// the same way the original template was.
const SETTINGS_TEMPLATE_HTML = `      <div class="settings-panel panel-content">
        <div class="settings-content">
          <h1>Settings</h1>
          <p class="settings-lede">Manage the current workspace and its shell defaults.</p>
          <details class="workspace-form" open>
            <summary><span>Workspace</span></summary>
            <div class="body">
              <label for="workspace-active">Active workspace</label>
              <select id="workspace-active" data-workspace="active"></select>

              <label for="workspace-name">Workspace name</label>
              <div class="workspace-row">
                <input id="workspace-name" data-workspace="name" type="text" maxlength="80" autocomplete="off">
                <button type="button" data-workspace-action="rename">Rename</button>
              </div>

              <label for="workspace-preset">Create from preset</label>
              <div class="workspace-row">
                <select id="workspace-preset" data-workspace="preset"></select>
                <button type="button" data-workspace-action="create">Create</button>
              </div>

              <div class="workspace-actions">
                <button type="button" data-workspace-action="duplicate">Duplicate</button>
                <button type="button" data-workspace-action="delete">Delete</button>
              </div>

              <details class="workspace-json">
                <summary><span>Workspace JSON</span></summary>
                <div class="body">
                  <p class="hint">Review or edit JSON before creating a workspace or replacing the current one.</p>
                  <textarea data-workspace="json" spellcheck="false" aria-label="Workspace JSON"></textarea>
                  <div class="hint" data-workspace="json-status" role="status" aria-live="polite"></div>
                  <div class="workspace-actions">
                    <button type="button" data-workspace-action="json-reset">Reset to saved</button>
                    <button type="button" data-workspace-action="json-copy">Copy</button>
                    <button type="button" data-workspace-action="json-download">Download</button>
                    <label class="workspace-file-button">Load file<input type="file" accept="application/json,.json" data-workspace="json-file"></label>
                  </div>
                  <div class="workspace-actions">
                    <button type="button" data-workspace-action="json-create">Create new workspace</button>
                    <button type="button" data-workspace-action="json-replace">Replace current workspace</button>
                  </div>
                </div>
              </details>
              <div class="hint" data-workspace="status" role="status" aria-live="polite"></div>
            </div>
          </details>
          <details class="preset-library">
            <summary><span>Preset library</span></summary>
            <div class="body">
              <p class="hint">Save the current workspace as a reusable snapshot. Custom presets include its runtime, system mounts, task mounts, tasks, and terminal settings.</p>
              <div class="preset-library-list" data-preset-library-list></div>
              <div class="preset-library-fields">
                <label for="preset-library-name">Preset name</label>
                <input id="preset-library-name" data-preset-library="name" type="text" maxlength="80" autocomplete="off" placeholder="My playground">
                <label for="preset-library-description">Description</label>
                <textarea id="preset-library-description" data-preset-library="description" maxlength="240" placeholder="What this preset is for"></textarea>
              </div>
              <div class="workspace-actions">
                <button type="button" data-preset-library-action="save">Save current workspace as preset</button>
                <button type="button" data-preset-library-action="update" hidden>Update snapshot from current workspace</button>
                <button type="button" data-preset-library-action="cancel" hidden>Cancel edit</button>
              </div>
              <div class="hint" data-preset-library="status" role="status" aria-live="polite"></div>
            </div>
          </details>
          <details class="bind-form system-form" open>
            <summary><span>Runtime &amp; system</span></summary>
            <div class="body">
              <p class="hint">These mounts form the shared Wanix system filesystem. Every workspace task inherits them. Use File mounts for inline files such as startup scripts. Drag entries to set their mount order. Save, then restart the playground to apply changes.</p>
              <label for="system-module">Wanix runtime module URL</label>
              <input id="system-module" data-system="module" type="url" spellcheck="false">
              <label for="system-wasm">Wanix wasm URL</label>
              <input id="system-wasm" data-system="wasm" type="url" spellcheck="false">
              <label for="system-allow-origins">Allowed import origins</label>
              <input id="system-allow-origins" data-system="allow-origins" type="text" placeholder="https://playground.example or *" spellcheck="false">
              <label for="system-share-url">Namespace share URL</label>
              <div class="workspace-row">
                <input id="system-share-url" data-system="share-url" type="url" readonly spellcheck="false">
                <button type="button" data-system-action="copy-share">Copy</button>
              </div>
              <p class="hint">Allow the importing page origin, then restart. Add a Remote namespace System mount on the other workspace with this share URL as its source.</p>
              <div class="workspace-actions">
                <button type="button" data-system-action="save">Save system settings</button>
                <button type="button" data-system-action="restart">Apply &amp; restart</button>
              </div>

              <h3>System mounts</h3>
              <div class="bind-list" data-system-bind-list></div>
              <div class="bind-fields">
                <label for="system-bind-type">Type</label>
                <select id="system-bind-type" data-system-bind="type">
                  <option value="ns">Namespace</option>
                  <option value="file">File</option>
                  <option value="fetch">Fetch</option>
                  <option value="archive">Archive</option>
                  <option value="import">Remote namespace</option>
                </select>
                <label for="system-bind-dst">Destination</label>
                <input id="system-bind-dst" data-system-bind="dst" type="text" placeholder="hush or profile">
                <label for="system-bind-src">Source URL or namespace</label>
                <input id="system-bind-src" data-system-bind="src" type="text" placeholder="#ramfs, https://example.com/tool, or wss://host">
                <label for="system-bind-content">Inline file content</label>
                <textarea id="system-bind-content" data-system-bind="content" placeholder="Used by File mounts when no URL is supplied"></textarea>
                <label for="system-bind-mode">Permissions</label>
                <input id="system-bind-mode" data-system-bind="mode" type="text" value="0644" inputmode="numeric">
                <label for="system-bind-union">Union position</label>
                <select id="system-bind-union" data-system-bind="union">
                  <option value="after">After earlier mounts</option>
                  <option value="before">Before earlier mounts</option>
                </select>
              </div>
              <div class="workspace-actions">
                <button type="button" data-system-bind-action="add">Add system mount</button>
                <button type="button" data-system-bind-action="cancel" hidden>Cancel edit</button>
              </div>
              <div class="hint" data-system="status" role="status" aria-live="polite"></div>
            </div>
          </details>
          <details class="terminal-profile-form" open>
            <summary><span>Terminal launch presets</span></summary>
            <div class="body">
              <div data-terminal-profile-editor></div>
            </div>
          </details>
          <details class="bind-form" open>
            <summary><span>Task mounts</span></summary>
            <div class="body">
              <p class="hint">These mounts are applied after the inherited System mounts, only to tasks in this workspace. Use them for project files, archives, and task-specific overlays. Drag entries to set their mount order.</p>
              <div class="bind-list" data-bind-list></div>
              <div class="bind-fields">
                <label for="bind-type">Type</label>
                <select id="bind-type" data-bind="type">
                  <option value="ns">Namespace</option>
                  <option value="file">File</option>
                  <option value="fetch">Fetch</option>
                  <option value="archive">Archive</option>
                  <option value="import">Remote namespace</option>
                </select>
                <label for="bind-dst">Destination</label>
                <input id="bind-dst" data-bind="dst" type="text" placeholder="main.js or root">
                <label for="bind-src">Source URL or namespace</label>
                <input id="bind-src" data-bind="src" type="text" placeholder="#ramfs, https://example.com/app.wasm, or wss://host">
                <label for="bind-content">Inline file content</label>
                <textarea id="bind-content" data-bind="content" placeholder="Used by File mounts when no URL is supplied"></textarea>
                <label for="bind-perm">Permissions</label>
                <input id="bind-perm" data-bind="perm" type="text" value="0644" inputmode="numeric">
                <label for="bind-union">Union position</label>
                <select id="bind-union" data-bind="union">
                  <option value="after">After earlier mounts</option>
                  <option value="before">Before earlier mounts</option>
                </select>
              </div>
              <div class="workspace-actions">
                <button type="button" data-bind-action="add">Add mount</button>
                <button type="button" data-bind-action="cancel" hidden>Cancel edit</button>
              </div>
              <div class="hint" data-bind="status" role="status" aria-live="polite"></div>
            </div>
          </details>
          <details class="task-form" open>
            <summary><span>Tasks</span></summary>
            <div class="body">
              <p class="hint">Tasks run in a private namespace with this workspace's mounts.</p>
              <div class="task-list" data-task-list></div>
              <div class="task-fields">
                <label for="task-name">Name</label>
                <input id="task-name" data-task="name" type="text" placeholder="main.js">
                <label for="task-cmd">Command</label>
                <input id="task-cmd" data-task="cmd" type="text" placeholder="main.js" spellcheck="false">
                <label for="task-type">Type</label>
                <select id="task-type" data-task="type">
                  <option value="auto">Auto</option>
                  <option value="gojs">Go + JavaScript</option>
                  <option value="wasi">WASI</option>
                  <option value="js">JavaScript</option>
                </select>
                <label for="task-wd">Working directory</label>
                <input id="task-wd" data-task="wd" type="text" value="." placeholder=".">
                <label for="task-env">Environment variables</label>
                <textarea id="task-env" data-task="env" placeholder="KEY=value&#10;TERM=xterm-256color" spellcheck="false"></textarea>
                <label class="task-toggle">
                  <input data-task="term" type="checkbox" checked>
                  <span>Open an interactive terminal</span>
                </label>
                <label class="task-toggle">
                  <input data-task="auto-start" type="checkbox">
                  <span>Start this task when the playground loads</span>
                </label>
              </div>
              <div class="workspace-actions">
                <button type="button" data-task-action="add">Add task</button>
                <button type="button" data-task-action="cancel" hidden>Cancel edit</button>
              </div>
              <div class="hint" data-task="status" role="status" aria-live="polite"></div>
            </div>
          </details>
          <div class="config-form">
            <details open>
              <summary><span>Behavior</span></summary>
              <div class="body">
                <div class="launcher-order-list" data-config-launcher-order aria-label="Launcher item order"></div>
                <label class="cfg-toggle">
                  <input data-config="restore-tabs" type="checkbox">
                  <span>Restore tabs from the previous session</span>
                </label>
                <label class="cfg-toggle">
                  <input data-config="wagi-dog-enabled" type="checkbox">
                  <span>Show Wagi Dog</span>
                </label>
              </div>
            </details>

            <details>
              <summary><span>Wanix tools</span></summary>
              <div class="body">
                <p class="hint">New VM and Workbench panels use these workspace-local defaults. Existing panels keep their launch snapshot.</p>
                <label for="workbench-assets-url">Workbench assets URL or path</label>
                <input id="workbench-assets-url" data-config-value="workbenchAssetsUrl" type="text" spellcheck="false" placeholder="/wanix-workbench">
                <label for="vm-linux-url">Linux archive URL</label>
                <input id="vm-linux-url" data-config-value="vmLinuxUrl" type="url" spellcheck="false">
                <label for="vm-backend-url">v86 backend archive URL</label>
                <input id="vm-backend-url" data-config-value="vmBackendUrl" type="url" spellcheck="false">
                <label for="vm-memory">VM memory</label>
                <input id="vm-memory" data-config-value="vmMemory" type="text" inputmode="text" spellcheck="false" placeholder="512M">
                <label for="vm-network-mode">VM network</label>
                <select id="vm-network-mode" data-config-value="vmNetworkMode">
                  <option value="none">Disabled</option>
                  <option value="fetch">Browser fetch</option>
                  <option value="wisp">Wisp relay</option>
                </select>
                <div class="cfg-network-field">
                  <label for="vm-wisp-url">Wisp relay URL</label>
                  <input id="vm-wisp-url" data-config-value="vmWispUrl" type="url" spellcheck="false" placeholder="wisps://relay.example.com">
                  <p class="hint">Use <code>wisp://</code> or <code>wisps://</code>. New VM panels pass this URL to v86's built-in Wisp adapter.</p>
                </div>
              </div>
            </details>

            <div class="actions">
              <button class="primary" data-config-action="save">Save</button>
              <button data-config-action="reset">Reset</button>
            </div>
            <div class="hint" data-config="status" style="margin-top:6px"></div>
          </div>
        </div>
      </div>
`;

function SettingsPanel({ containerApi }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.innerHTML = SETTINGS_TEMPLATE_HTML;
    const settingsContent = wrapper.firstElementChild;
    if (!settingsContent) return;

    const disposeConfigForm = setupConfigForm(settingsContent);
    const disposeTerminalProfileForm = settingsDep('setupTerminalProfileForm')(settingsContent);
    const disposeWorkspaceForm = settingsDep('setupWorkspaceForm')(settingsContent);
    const disposePresetLibrary = settingsDep('setupPresetLibrary')(settingsContent);
    const disposeSystemForm = settingsDep('setupSystemForm')(settingsContent);
    const disposeBindForm = settingsDep('setupBindForm')(settingsContent);
    const disposeTaskForm = settingsDep('setupTaskForm')(settingsContent, containerApi);
    return () => {
      disposeConfigForm?.();
      disposeTerminalProfileForm?.();
      disposeWorkspaceForm?.();
      disposePresetLibrary?.();
      disposeSystemForm?.();
      disposeBindForm?.();
      disposeTaskForm?.();
      if (wrapper.firstElementChild) wrapper.innerHTML = '';
    };
  }, [containerApi]);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}




// === Config form helpers ===
// `setupConfigForm` wires the "Behavior" / "Wanix tools" <details>
// blocks under the Settings panel: restore-tabs toggle, Wagi-Dog
// toggle, workbench/vm URL inputs, and the launcher ordering editor.
// All app.js globals it touches (config loaders, the panel-creation
// catalog, the workspace-changed event name, the Vm/Wisp URL
// normalizer) are passed via the dep shim so this helper stays
// loosely coupled to the rest of the shell.

function setupConfigForm(settingsContent) {
  const launcherOrderList = settingsContent.querySelector('[data-config-launcher-order]');
  const restoreTabsEl = settingsContent.querySelector('[data-config="restore-tabs"]');
  const wagiDogEnabledEl = settingsContent.querySelector('[data-config="wagi-dog-enabled"]');
  const integrationEls = [...settingsContent.querySelectorAll('[data-config-value]')];
  const vmNetworkModeEl = settingsContent.querySelector('[data-config-value="vmNetworkMode"]');
  const vmWispUrlEl = settingsContent.querySelector('[data-config-value="vmWispUrl"]');
  const saveButton = settingsContent.querySelector('[data-config-action="save"]');
  const resetButton = settingsContent.querySelector('[data-config-action="reset"]');
  if (!saveButton || !resetButton) return;
  const launcherOrderRoot = launcherOrderList ? createRoot(launcherOrderList) : null;
  launcherOrderRoot?.render(React.createElement(LauncherOrderEditor));

  const populate = () => {
    const cfg = settingsDep("loadConfig")();
    if (restoreTabsEl) restoreTabsEl.checked = cfg.restoreTabs;
    if (wagiDogEnabledEl) wagiDogEnabledEl.checked = cfg.wagiDogEnabled;
    for (const input of integrationEls) input.value = cfg[input.dataset.configValue] || '';
    syncVmNetworkFields();
  };
  const syncVmNetworkFields = () => {
    if (!vmNetworkModeEl || !vmWispUrlEl) return;
    const enabled = vmNetworkModeEl.value === 'wisp';
    vmWispUrlEl.disabled = !enabled;
    vmWispUrlEl.closest('.cfg-network-field')?.classList.toggle('disabled', !enabled);
  };
  populate();

  vmNetworkModeEl?.addEventListener('change', syncVmNetworkFields);

  saveButton.addEventListener('click', () => {
    if (vmNetworkModeEl?.value === 'wisp' && !settingsDep("normalizeVmWispUrl")(vmWispUrlEl?.value)) {
      const s = settingsContent.querySelector('[data-config="status"]');
      s.textContent = 'Enter a valid Wisp server URL.';
      s.style.color = '#f85149';
      return;
    }
    const config = settingsDep("loadConfig")();
    settingsDep("saveConfig")({
      ...config,
      restoreTabs: restoreTabsEl?.checked === true,
      wagiDogEnabled: wagiDogEnabledEl?.checked !== false,
      ...Object.fromEntries(integrationEls.map((input) => [input.dataset.configValue, input.value])),
    });
    const s = settingsContent.querySelector('[data-config="status"]');
    s.textContent = 'Saved!';
    s.style.color = '#3fb950';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });

  resetButton.addEventListener('click', () => {
    const c = settingsDep("resetConfig")();
    if (restoreTabsEl) restoreTabsEl.checked = c.restoreTabs;
    if (wagiDogEnabledEl) wagiDogEnabledEl.checked = c.wagiDogEnabled;
    for (const input of integrationEls) input.value = c[input.dataset.configValue] || '';
    syncVmNetworkFields();
    const s = settingsContent.querySelector('[data-config="status"]');
    s.textContent = 'Reset to defaults.';
    s.style.color = '#8b949e';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), populate);
  return () => {
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), populate);
    launcherOrderRoot?.unmount();
  };
}

function LauncherOrderEditor() {
  const [config, setConfig] = useState(() => settingsDep("loadConfig")());
  const [draggedComponent, setDraggedComponent] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    const syncConfig = () => setConfig(settingsDep("loadConfig")());
    window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), syncConfig);
    return () => window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), syncConfig);
  }, []);

  const order = settingsDep("normalizeLauncherOrder")(config.launcherOrder);
  const collapsedSet = new Set(config.collapsedLauncherItems);
  const visible = order.filter((component) => !collapsedSet.has(component));
  const collapsed = order.filter((component) => collapsedSet.has(component));
  const optionFor = (component) => settingsDep("PANEL_CREATION_OPTIONS").find((option) => option.component === component);

  const persist = (nextVisible, nextCollapsed, nextStartupPanels = config.startupPanels) => {
    const nextOrder = [...nextVisible, ...nextCollapsed];
    const selected = new Set(nextStartupPanels);
    settingsDep("saveConfig")({
      ...settingsDep("loadConfig")(),
      launcherOrder: nextOrder,
      collapsedLauncherItems: nextCollapsed,
      startupPanels: nextOrder.filter((component) => selected.has(component)),
    });
  };

  const toggleStartup = (component) => {
    const selected = new Set(config.startupPanels);
    if (selected.has(component)) selected.delete(component);
    else selected.add(component);
    persist(visible, collapsed, [...selected]);
  };

  const setCollapsed = (component, shouldCollapse) => {
    if (shouldCollapse) persist(visible.filter((item) => item !== component), [component, ...collapsed]);
    else persist([...visible, component], collapsed.filter((item) => item !== component));
  };

  const moveWithinSection = (component, isCollapsed, direction) => {
    const section = [...(isCollapsed ? collapsed : visible)];
    const index = section.indexOf(component);
    const target = index + direction;
    if (target < 0 || target >= section.length) return;
    [section[index], section[target]] = [section[target], section[index]];
    persist(isCollapsed ? visible : section, isCollapsed ? section : collapsed);
  };

  const placeDragged = (targetComponent, targetCollapsed, placeAfter = true) => {
    const source = draggedComponent;
    if (!source) return;
    const nextVisible = visible.filter((component) => component !== source);
    const nextCollapsed = collapsed.filter((component) => component !== source);
    const destination = targetCollapsed ? nextCollapsed : nextVisible;
    const target = targetComponent ? destination.indexOf(targetComponent) : destination.length;
    destination.splice(target + (targetComponent && placeAfter ? 1 : 0), 0, source);
    persist(nextVisible, nextCollapsed);
    setDraggedComponent(null);
    setDropTarget(null);
  };

  const renderItem = (component, isCollapsed, index, sectionLength) => {
    const option = optionFor(component);
    if (!option) return null;
    const Icon = option.icon;
    const isDropTarget = dropTarget?.component === component && dropTarget.collapsed === isCollapsed;
    const isOpenByDefault = config.startupPanels.includes(component);
    return React.createElement('div', {
      key: component,
      className: [
        'launcher-order-item',
        draggedComponent === component && 'dragging',
        isDropTarget && (dropTarget.after ? 'drop-after' : 'drop-before'),
      ].filter(Boolean).join(' '),
      draggable: true,
      onDragStart: (event) => {
        setDraggedComponent(component);
        event.dataTransfer?.setData('text/plain', component);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: () => {
        setDraggedComponent(null);
        setDropTarget(null);
      },
      onDragOver: (event) => {
        if (!draggedComponent || draggedComponent === component) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        setDropTarget({ component, collapsed: isCollapsed, after: event.clientY > bounds.top + bounds.height / 2 });
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      },
      onDrop: (event) => {
        event.preventDefault();
        placeDragged(component, isCollapsed, event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2);
      },
    },
    React.createElement(GripVertical, { className: 'launcher-order-handle', size: 16, 'aria-hidden': true }),
    React.createElement(Icon, { className: 'launcher-order-icon', size: 16, 'aria-hidden': true }),
    React.createElement('span', { className: 'launcher-order-label' }, option.label),
    React.createElement('label', { className: 'launcher-order-startup' },
      React.createElement('input', {
        type: 'checkbox',
        checked: isOpenByDefault,
        onChange: () => toggleStartup(component),
      }),
      React.createElement('span', null, 'Open by default'),
    ),
    React.createElement('div', { className: 'launcher-order-actions' },
      React.createElement('button', {
        type: 'button',
        title: isCollapsed ? `Uncollapse ${option.label}` : `Collapse ${option.label}`,
        'aria-label': isCollapsed ? `Uncollapse ${option.label}` : `Collapse ${option.label}`,
        onClick: () => setCollapsed(component, !isCollapsed),
      }, React.createElement(isCollapsed ? EyeOff : Eye, { size: 15, 'aria-hidden': true })),
      React.createElement('button', {
        type: 'button',
        title: `Move ${option.label} up`,
        'aria-label': `Move ${option.label} up`,
        disabled: index === 0,
        onClick: () => moveWithinSection(component, isCollapsed, -1),
      }, React.createElement(ArrowUp, { size: 15, 'aria-hidden': true })),
      React.createElement('button', {
        type: 'button',
        title: `Move ${option.label} down`,
        'aria-label': `Move ${option.label} down`,
        disabled: index === sectionLength - 1,
        onClick: () => moveWithinSection(component, isCollapsed, 1),
      }, React.createElement(ArrowDown, { size: 15, 'aria-hidden': true })),
    ),
    );
  };

  const renderSection = (title, items, isCollapsed) => React.createElement('section', {
    className: `launcher-order-section${isCollapsed ? ' collapsed' : ''}`,
    onDragOver: (event) => {
      if (!draggedComponent) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    },
    onDrop: (event) => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      placeDragged(null, isCollapsed);
    },
  },
  React.createElement('div', { className: 'launcher-order-section-heading' },
    React.createElement(isCollapsed ? EyeOff : Eye, { size: 15, 'aria-hidden': true }),
    React.createElement('span', null, title),
  ),
  React.createElement('div', { className: 'launcher-order-section-items' },
    items.length > 0
      ? items.map((component, index) => renderItem(component, isCollapsed, index, items.length))
      : React.createElement('div', { className: 'launcher-order-empty' }, 'Drop items here'),
  ),
  );

  return React.createElement(React.Fragment, null,
    React.createElement('p', { className: 'hint launcher-order-hint' }, 'Drag items to reorder them. Changes to visibility and default startup save immediately.'),
    renderSection('Visible', visible, false),
    renderSection('Collapsed', collapsed, true),
  );
}

// Counter for unique Settings panel ids. The counter is module-scoped
// so it survives React re-renders but resets on page reload.
let settingsIdCounter = 0;

// Register a new Settings panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Settings from the panel
// menu, and from the restore-saved-panels path on boot.
export function addSettingsPanel(api, group) {
  const id = ++settingsIdCounter;
  const panel = api.addPanel({
    id: `settings-${id}`,
    component: 'settings',
    params: { settingsId: id, panelType: 'settings' },
    title: 'Settings',
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = settingsDep('rememberOpenPanel');
  rememberOpenPanel(panel, { component: 'settings' });
  panel.api.setActive();
  return panel;
}

export { SettingsPanel };
