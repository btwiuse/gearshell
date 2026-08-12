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
    const disposeWorkspaceForm = setupWorkspaceForm(settingsContent);
    const disposePresetLibrary = setupPresetLibrary(settingsContent);
    const disposeSystemForm = setupSystemForm(settingsContent);
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


// === Workspace / Preset / System forms ===
// `setupPresetLibrary`, `setupWorkspaceForm`, and `setupSystemForm`
// wire the Workspace / Preset library / Runtime & system <details>
// blocks. All app.js globals they touch (the workspace store + system
// bind helpers, the workspace-changed event name, the Wanix runtime
// constant) are passed via the dep shim so these helpers stay loosely
// coupled to the rest of the shell.

function setupPresetLibrary(settingsContent) {
  const list = settingsContent.querySelector('[data-preset-library-list]');
  const nameEl = settingsContent.querySelector('[data-preset-library="name"]');
  const descriptionEl = settingsContent.querySelector('[data-preset-library="description"]');
  const status = settingsContent.querySelector('[data-preset-library="status"]');
  const saveButton = settingsContent.querySelector('[data-preset-library-action="save"]');
  const updateButton = settingsContent.querySelector('[data-preset-library-action="update"]');
  const cancelButton = settingsContent.querySelector('[data-preset-library-action="cancel"]');
  if (!list || !nameEl || !descriptionEl || !status || !saveButton || !updateButton || !cancelButton) return;

  let editingPresetId = null;
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const resetFields = () => {
    editingPresetId = null;
    const workspace = settingsDep("loadActiveWorkspace")();
    nameEl.value = settingsDep("uniqueWorkspacePresetName")(`${workspace.name} preset`);
    descriptionEl.value = workspace.description || '';
    saveButton.textContent = 'Save current workspace as preset';
    updateButton.hidden = true;
    cancelButton.hidden = true;
  };
  const startEditing = (preset) => {
    editingPresetId = preset.id;
    nameEl.value = preset.name;
    descriptionEl.value = preset.description;
    saveButton.textContent = 'Save preset details';
    updateButton.hidden = false;
    cancelButton.hidden = false;
    setStatus(`Editing ${preset.name}.`);
    nameEl.focus();
  };
  const render = () => {
    list.replaceChildren();
    const presets = settingsDep("listWorkspacePresets")().filter((preset) => !preset.builtin);
    if (presets.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hint';
      empty.textContent = 'No custom presets yet.';
      list.appendChild(empty);
      return;
    }
    for (const preset of presets) {
      const item = document.createElement('div');
      item.className = 'preset-library-item';
      const details = document.createElement('div');
      const name = document.createElement('span');
      name.className = 'preset-library-name';
      name.textContent = preset.name;
      const meta = document.createElement('span');
      meta.className = 'preset-library-meta';
      meta.textContent = preset.description || 'Reusable workspace snapshot';
      details.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'preset-library-actions';
      const create = document.createElement('button');
      create.type = 'button';
      create.textContent = 'Create';
      create.addEventListener('click', () => {
        const workspace = settingsDep("createWorkspaceFromPreset")(preset.id);
        if (workspace) setStatus(`Created ${workspace.name} from ${preset.name}.`);
        else setStatus('Unable to create a workspace from this preset.', true);
      });
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        const current = settingsDep("loadCustomWorkspacePreset")(preset.id);
        if (current) startEditing(current);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Remove preset ${preset.name}? Existing workspaces will not be affected.`)) return;
        if (editingPresetId === preset.id) resetFields();
        if (settingsDep("removeCustomWorkspacePreset")(preset.id)) setStatus(`Removed ${preset.name}.`);
        else setStatus('Unable to remove the preset.', true);
      });
      actions.append(create, edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };

  saveButton.addEventListener('click', () => {
    try {
      const preset = settingsDep("saveCustomWorkspacePreset")(editingPresetId, {
        name: nameEl.value,
        description: descriptionEl.value,
        workspace: editingPresetId ? undefined : settingsDep("loadActiveWorkspace")(),
      });
      const message = editingPresetId ? `Saved details for ${preset.name}.` : `Saved ${preset.name}.`;
      resetFields();
      setStatus(message);
    } catch (error) {
      setStatus(error.message || 'Unable to save the preset.', true);
    }
  });
  updateButton.addEventListener('click', () => {
    try {
      const preset = settingsDep("saveCustomWorkspacePreset")(editingPresetId, {
        name: nameEl.value,
        description: descriptionEl.value,
        workspace: settingsDep("loadActiveWorkspace")(),
      });
      setStatus(`Updated ${preset.name} from the current workspace.`);
    } catch (error) {
      setStatus(error.message || 'Unable to update the preset.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetFields();
    setStatus('Edit cancelled.');
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  resetFields();
  render();
  return () => window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}

function setupWorkspaceForm(settingsContent) {
  const activeSelect = settingsContent.querySelector('[data-workspace="active"]');
  const nameInput = settingsContent.querySelector('[data-workspace="name"]');
  const presetSelect = settingsContent.querySelector('[data-workspace="preset"]');
  const status = settingsContent.querySelector('[data-workspace="status"]');
  const jsonEl = settingsContent.querySelector('[data-workspace="json"]');
  const jsonStatus = settingsContent.querySelector('[data-workspace="json-status"]');
  const jsonFileInput = settingsContent.querySelector('[data-workspace="json-file"]');
  const deleteButton = settingsContent.querySelector('[data-workspace-action="delete"]');
  if (!activeSelect || !nameInput || !presetSelect || !status || !jsonEl || !jsonStatus || !jsonFileInput) return;

  let jsonDirty = false;
  let jsonWorkspaceId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const setJsonStatus = (message, isError = false) => {
    jsonStatus.textContent = message;
    jsonStatus.style.color = isError ? '#f85149' : '#8b949e';
  };
  const validateJson = () => {
    try {
      const workspace = settingsDep("parseWorkspaceJson")(jsonEl.value);
      setJsonStatus(`${workspace.name} · v${workspace.version} · ${workspace.system.binds.length} system mounts · ${workspace.binds.length} mounts · ${workspace.tasks.length} tasks`);
      return workspace;
    } catch (error) {
      setJsonStatus(error.message || 'Workspace JSON is invalid.', true);
      return null;
    }
  };
  const loadCurrentJson = () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    jsonEl.value = JSON.stringify(workspace, null, 2);
    jsonWorkspaceId = workspace.id;
    jsonDirty = false;
    validateJson();
  };
  const addOption = (select, value, label, selected) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
  };
  const render = () => {
    const activeId = settingsDep("getActiveWorkspaceId")();
    activeSelect.replaceChildren();
    for (const workspace of settingsDep("ensureWorkspaceStore")()) {
      addOption(activeSelect, workspace.id, workspace.name, workspace.id === activeId);
    }
    const workspace = settingsDep("loadActiveWorkspace")();
    nameInput.value = workspace.name;
    if (!jsonDirty || jsonWorkspaceId !== workspace.id) loadCurrentJson();
    presetSelect.replaceChildren();
    for (const preset of settingsDep("listWorkspacePresets")()) {
      addOption(presetSelect, preset.id, preset.name, preset.id === 'hush-shell');
    }
    if (deleteButton) {
      deleteButton.disabled = activeId === 'hush-shell' || activeSelect.options.length <= 1;
    }
  };

  activeSelect.addEventListener('change', () => {
    if (settingsDep("setActiveWorkspaceId")(activeSelect.value)) setStatus('Workspace selected.');
    else setStatus('Unable to select this workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="rename"]').addEventListener('click', () => {
    try {
      const workspace = settingsDep("renameWorkspace")(settingsDep("getActiveWorkspaceId")(), nameInput.value);
      setStatus(`Renamed workspace to ${workspace.name}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to rename workspace.', true);
    }
  });
  settingsContent.querySelector('[data-workspace-action="create"]').addEventListener('click', () => {
    const workspace = settingsDep("createWorkspaceFromPreset")(presetSelect.value);
    if (workspace) setStatus(`Created ${workspace.name}.`);
    else setStatus('Unable to create workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="duplicate"]').addEventListener('click', () => {
    const workspace = settingsDep("duplicateWorkspace")(settingsDep("getActiveWorkspaceId")());
    if (workspace) setStatus(`Created ${workspace.name}.`);
    else setStatus('Unable to duplicate workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="delete"]').addEventListener('click', () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    if (!window.confirm(`Delete ${workspace.name}?`)) return;
    if (settingsDep("deleteWorkspace")(workspace.id)) setStatus(`Deleted ${workspace.name}.`);
    else setStatus('The default workspace cannot be deleted.', true);
  });
  settingsContent.querySelector('[data-workspace-action="json-reset"]').addEventListener('click', () => {
    loadCurrentJson();
    setStatus('Loaded the saved workspace JSON.');
  });
  settingsContent.querySelector('[data-workspace-action="json-copy"]').addEventListener('click', async () => {
    if (!validateJson()) return;
    try {
      await navigator.clipboard.writeText(jsonEl.value);
      setStatus('Workspace JSON copied.');
    } catch {
      setStatus('Unable to copy. Select the JSON and copy it manually.', true);
      jsonEl.focus();
      jsonEl.select();
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-download"]').addEventListener('click', () => {
    const workspace = validateJson();
    if (!workspace) return;
    const blob = new Blob([jsonEl.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `${workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workspace'}.json`;
    download.click();
    URL.revokeObjectURL(url);
    setStatus('Workspace JSON downloaded.');
  });
  jsonEl.addEventListener('input', () => {
    jsonDirty = true;
    validateJson();
  });
  jsonFileInput.addEventListener('change', async () => {
    const [file] = jsonFileInput.files || [];
    if (!file) return;
    try {
      jsonEl.value = await file.text();
      jsonDirty = true;
      const workspace = validateJson();
      if (workspace) setStatus(`Loaded ${workspace.name}. Review it, then choose how to apply it.`);
    } catch (error) {
      setStatus(error.message || 'Unable to read workspace JSON.', true);
    } finally {
      jsonFileInput.value = '';
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-create"]').addEventListener('click', () => {
    try {
      const workspace = settingsDep("importWorkspace")(jsonEl.value);
      jsonDirty = false;
      setStatus(`Created ${workspace.name} from JSON.`);
    } catch (error) {
      setStatus(error.message || 'Unable to create workspace.', true);
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-replace"]').addEventListener('click', () => {
    const current = settingsDep("loadActiveWorkspace")();
    if (!window.confirm(`Replace ${current.name} with the JSON in this editor?`)) return;
    try {
      const workspace = settingsDep("replaceActiveWorkspace")(jsonEl.value);
      jsonDirty = false;
      setStatus(`Replaced the current workspace with ${workspace.name}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to replace workspace.', true);
    }
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () => window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}

function setupSystemForm(settingsContent) {
  const moduleEl = settingsContent.querySelector('[data-system="module"]');
  const wasmEl = settingsContent.querySelector('[data-system="wasm"]');
  const allowOriginsEl = settingsContent.querySelector('[data-system="allow-origins"]');
  const shareUrlEl = settingsContent.querySelector('[data-system="share-url"]');
  const list = settingsContent.querySelector('[data-system-bind-list]');
  const typeEl = settingsContent.querySelector('[data-system-bind="type"]');
  const dstEl = settingsContent.querySelector('[data-system-bind="dst"]');
  const srcEl = settingsContent.querySelector('[data-system-bind="src"]');
  const contentEl = settingsContent.querySelector('[data-system-bind="content"]');
  const modeEl = settingsContent.querySelector('[data-system-bind="mode"]');
  const unionEl = settingsContent.querySelector('[data-system-bind="union"]');
  const status = settingsContent.querySelector('[data-system="status"]');
  const saveButton = settingsContent.querySelector('[data-system-action="save"]');
  const restartButton = settingsContent.querySelector('[data-system-action="restart"]');
  const copyShareButton = settingsContent.querySelector('[data-system-action="copy-share"]');
  const addButton = settingsContent.querySelector('[data-system-bind-action="add"]');
  const cancelButton = settingsContent.querySelector('[data-system-bind-action="cancel"]');
  if (!moduleEl || !wasmEl || !allowOriginsEl || !shareUrlEl || !list || !typeEl || !dstEl || !srcEl || !contentEl || !modeEl || !unionEl || !status || !saveButton || !restartButton || !copyShareButton || !addButton || !cancelButton) return;

  let editingBindId = null;
  let draggedBindId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const resetBindFields = () => {
    editingBindId = null;
    typeEl.value = 'ns';
    dstEl.value = '';
    srcEl.value = '';
    contentEl.value = '';
    modeEl.value = '';
    unionEl.value = 'after';
    addButton.textContent = 'Add system mount';
    cancelButton.hidden = true;
  };
  const render = () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    moduleEl.value = workspace.runtime.moduleUrl || settingsDep("WANIX_RUNTIME").moduleUrl;
    wasmEl.value = workspace.runtime.wasmUrl || settingsDep("WANIX_RUNTIME").wasmUrl;
    allowOriginsEl.value = workspace.system.allowOrigins || '';
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = 'wanix-system';
    shareUrlEl.value = shareUrl.href;
    list.replaceChildren();
    for (const bind of workspace.system.binds) {
      const item = document.createElement('div');
      item.className = 'bind-item';
      settingsDep("makeBindItemDraggable")(item, bind, {
        list,
        getDraggedId: () => draggedBindId,
        setDraggedId: (id) => { draggedBindId = id; },
        reorder: settingsDep("reorderWorkspaceSystemBinds"),
        onReordered: () => setStatus('System mount order saved. Restart to apply changes.'),
      });
      const details = document.createElement('div');
      const path = document.createElement('span');
      path.className = 'bind-item-path';
      path.textContent = `${bind.dst} ← ${bind.src || 'inline content'}`;
      path.title = path.textContent;
      const meta = document.createElement('span');
      meta.className = 'bind-item-meta';
      meta.textContent = `${bind.type}${bind.mode ? ` · ${bind.mode}` : ''} · ${bind.union}`;
      details.append(path, meta);
      const actions = document.createElement('div');
      actions.className = 'bind-item-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingBindId = bind.id;
        typeEl.value = bind.type;
        dstEl.value = bind.dst;
        srcEl.value = bind.src;
        contentEl.value = bind.content;
        modeEl.value = bind.mode;
        unionEl.value = bind.union;
        addButton.textContent = 'Save system mount';
        cancelButton.hidden = false;
        setStatus(`Editing ${bind.dst}. Save and restart to apply changes.`);
        dstEl.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (editingBindId === bind.id) resetBindFields();
        settingsDep("removeWorkspaceSystemBind")(bind.id);
        setStatus(`Removed ${bind.dst}. Restart to apply changes.`);
      });
      actions.append(edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const saveSettings = () => {
    settingsDep("saveWorkspaceSystemSettings")({ moduleUrl: moduleEl.value, wasmUrl: wasmEl.value, allowOrigins: allowOriginsEl.value });
    setStatus('System settings saved. Restart the playground to apply changes.');
  };

  saveButton.addEventListener('click', () => {
    try {
      saveSettings();
    } catch (error) {
      setStatus(error.message || 'Unable to save system settings.', true);
    }
  });
  restartButton.addEventListener('click', () => {
    try {
      saveSettings();
      window.location.reload();
    } catch (error) {
      setStatus(error.message || 'Unable to save system settings.', true);
    }
  });
  copyShareButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrlEl.value);
      setStatus('Namespace share URL copied.');
    } catch {
      shareUrlEl.focus();
      shareUrlEl.select();
      setStatus('Select the share URL and copy it manually.', true);
    }
  });
  addButton.addEventListener('click', () => {
    try {
      const bind = {
        type: typeEl.value,
        dst: dstEl.value,
        src: srcEl.value,
        content: contentEl.value,
        mode: modeEl.value,
        union: unionEl.value,
      };
      if (editingBindId) settingsDep("updateWorkspaceSystemBind")(editingBindId, bind);
      else settingsDep("addWorkspaceSystemBind")(bind);
      setStatus(`${editingBindId ? 'Updated' : 'Added'} ${dstEl.value.trim()}. Restart to apply changes.`);
      resetBindFields();
    } catch (error) {
      setStatus(error.message || 'Unable to save the system mount.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetBindFields();
    setStatus('Edit cancelled.');
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () => window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
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
