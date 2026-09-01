// Iframe / workbench / VM session management (500-line rule split; the
// workspace-task sessions live in app-workspace-task-sessions.js).

import {
  getWanixRoot,
  iframeSessions,
  systemReady,
  terminalLayer,
  vmDriverInstallations,
  vmSessions,
  workbenchSessions,
} from "./app-state.js";
import { HOME } from "./app-constants.js";
import {
  buildEnv,
  getDefaultTerminalProfile,
  terminalCommand,
} from "./app-terminal-profiles.js";
import { DEFAULT_CMD } from "./app-constants.js";
import { wanixSystem } from "./app-state.js";
import { createWanixBindElement } from "./app-wanix.js";
import { html } from "./dom-html.js";

export const DEFAULT_IFRAME_ALLOW = "clipboard-read; clipboard-write";

const IFRAME_POPOUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
  "</svg>";

export function createIframeSession(
  id,
  { src, title, allow = DEFAULT_IFRAME_ALLOW, allowFullscreen = false },
) {
  const popout = html`<button
    type="button"
    className="iframe-session-popout"
    title="Open in a new browser tab"
    aria-label="Open in a new browser tab"
    onclick=${() => window.open(src, "_blank", "noopener")}
  />`;
  popout.innerHTML = IFRAME_POPOUT_ICON;

  const wrapper = html`<div className="iframe-session">
    <iframe
      className="iframe-panel"
      src=${src}
      title=${title}
      allow=${allow}
      allowFullscreen=${allowFullscreen}
    />
    ${popout}
  </div>`;

  terminalLayer?.appendChild(wrapper);
  const iframe = wrapper.querySelector("iframe");

  const session = { id, wrapper, iframe, anchor: null, layout: null };
  iframeSessions.set(id, session);
  return session;
}

export function getIframeSession(id, params) {
  const session = iframeSessions.get(id);
  if (session) {
    if (params.title) session.iframe.title = params.title;
    if (params.allow) session.iframe.allow = params.allow;
    session.iframe.allowFullscreen = !!params.allowFullscreen;
    return session;
  }
  return createIframeSession(id, params);
}

export function destroyIframeSession(id) {
  const session = iframeSessions.get(id);
  if (!session) return;
  iframeSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

export function layoutIframeSession(session, anchor, isVisible) {
  if (!terminalLayer || !anchor || !isVisible) {
    session.wrapper.classList.remove("visible");
    session.layout = null;
    return false;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove("visible");
    session.layout = null;
    return false;
  }

  const nextLayout = {
    left: bounds.left - layerBounds.left,
    top: bounds.top - layerBounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  const previousLayout = session.layout;
  const layoutChanged = !previousLayout ||
    Object.keys(nextLayout).some((key) =>
      Math.abs(nextLayout[key] - previousLayout[key]) >= 0.5
    );

  const wasVisible = session.wrapper.classList.contains("visible");
  if (layoutChanged) {
    session.wrapper.style.left = `${nextLayout.left}px`;
    session.wrapper.style.top = `${nextLayout.top}px`;
    session.wrapper.style.width = `${nextLayout.width}px`;
    session.wrapper.style.height = `${nextLayout.height}px`;
    session.layout = nextLayout;
  }
  session.wrapper.classList.add("visible");
  return layoutChanged || !wasVisible;
}

export function attachIframeSession(id, params, anchor, api) {
  const session = getIframeSession(id, params);
  let updateFrame = 0;

  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 &&
      bounds.height > 0;
    layoutIframeSession(session, anchor, isVisible);
  };
  const scheduleUpdate = () => {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(anchor);
  const subscriptions = [
    api.onDidDimensionsChange(scheduleUpdate),
    api.onDidVisibilityChange(scheduleUpdate),
    api.onDidLocationChange(scheduleUpdate),
    api.onDidGroupChange(scheduleUpdate),
  ];

  scheduleUpdate();

  return () => {
    observer.disconnect();
    if (updateFrame) cancelAnimationFrame(updateFrame);
    for (const subscription of subscriptions) subscription.dispose();
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutIframeSession(session, null, false);
    }
  };
}

export function createOverlayAttachment(session, anchor, api) {
  let updateFrame = 0;
  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 &&
      bounds.height > 0;
    const layoutChanged = layoutIframeSession(session, anchor, isVisible);
    // VS Code's embedded Workbench listens to the window resize event rather
    // than exposing a public layout API. Forward Dockview's coalesced pane
    // updates after the overlay has received its new dimensions.
    if (layoutChanged && session.workbench) {
      window.dispatchEvent(new Event("resize"));
    }
  };
  const scheduleUpdate = () => {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(anchor);
  const subscriptions = [
    api.onDidDimensionsChange(scheduleUpdate),
    api.onDidVisibilityChange(scheduleUpdate),
    api.onDidLocationChange(scheduleUpdate),
    api.onDidGroupChange(scheduleUpdate),
  ];
  scheduleUpdate();
  return () => {
    observer.disconnect();
    if (updateFrame) cancelAnimationFrame(updateFrame);
    for (const subscription of subscriptions) subscription.dispose();
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutIframeSession(session, null, false);
    }
  };
}

export function createWorkbenchSession(id, config) {
  const profile = getDefaultTerminalProfile();
  // Hush consumes an interactive terminal stream, including control and
  // escape sequences. Let xterm forward each key instead of line-buffering.
  // Workbench creates the task through the task control filesystem instead
  // of a wanix-task element. Its runtime requires a concrete directory,
  // while a blank `dir` is interpreted as an invalid path.
  const wrapper = html`<div className="workbench-session">
    <wanix-workbench
      for="wanix-system"
      assets=${config.assetsUrl}
      term=""
      raw=""
      sidebar="always"
    >
      <wanix-task
        role="shell"
        cmd=${terminalCommand(profile) || DEFAULT_CMD}
        type=${profile.type || "gojs"}
        env=${buildEnv(profile.env)}
        wd=${profile.wd || HOME}
      />
    </wanix-workbench>
  </div>`;
  terminalLayer?.appendChild(wrapper);

  const session = {
    id,
    wrapper,
    workbench: wrapper.firstElementChild,
    anchor: null,
    layout: null,
  };
  workbenchSessions.set(id, session);
  return session;
}

export function getWorkbenchSession(id, config) {
  return workbenchSessions.get(id) || createWorkbenchSession(id, config);
}

export function destroyWorkbenchSession(id) {
  const session = workbenchSessions.get(id);
  if (!session) return;
  workbenchSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

export function attachWorkbenchSession(id, config, anchor, api) {
  return createOverlayAttachment(getWorkbenchSession(id, config), anchor, api);
}

export function waitForWanixSystem() {
  if (systemReady && wanixSystem?._kernel) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = (event) => {
      if (event.target !== wanixSystem) return;
      wanixSystem.removeEventListener("ready", onReady);
      wanixSystem.removeEventListener("error", onError);
      resolve();
    };
    const onError = (event) => {
      wanixSystem?.removeEventListener("error", onError);
      reject(event.detail?.error || new Error("Wanix system failed to start."));
    };
    wanixSystem?.addEventListener("ready", onReady);
    wanixSystem?.addEventListener("error", onError, { once: true });
  });
}

export function ensureVmDriver(backendUrl) {
  const existing = vmDriverInstallations.get(backendUrl);
  if (existing) return existing;
  const install = (async () => {
    await waitForWanixSystem();
    const bind = createWanixBindElement({
      type: "archive",
      dst: "#vm/v86",
      src: backendUrl,
    });
    const bindings = html`<div>${bind}</div>`;
    terminalLayer?.appendChild(bindings);
    try {
      await wanixSystem._kernel._setupNamespace(
        "1",
        "",
        bindings.querySelectorAll(":scope > wanix-bind"),
      );
    } finally {
      bindings.remove();
    }
  })();
  vmDriverInstallations.set(backendUrl, install);
  install.catch(() => vmDriverInstallations.delete(backendUrl));
  return install;
}

export function createVmSession(id, config) {
  const wrapper = html`<div className="vm-session">Preparing VM…</div>`;
  terminalLayer?.appendChild(wrapper);

  const session = {
    id,
    wrapper,
    config,
    vm: null,
    term: null,
    anchor: null,
    layout: null,
    startPromise: null,
    destroyed: false,
  };
  vmSessions.set(id, session);
  return session;
}

export function getVmSession(id, config) {
  return vmSessions.get(id) || createVmSession(id, config);
}

export function destroyVmSession(id) {
  const session = vmSessions.get(id);
  if (!session) return;
  vmSessions.delete(id);
  session.destroyed = true;
  session.anchor = null;
  const taskPath = session.vm?.task?.rid ? session.vm.task.path : null;
  if (taskPath && session.vm?._kernel) {
    session.vm._kernel.root.writeFile(`${taskPath}/ctl`, "terminate").catch(
      () => {},
    );
  }
  session.wrapper.remove();
}

// Binds mounted into the VM task namespace over the rootfs image: the
// archive itself plus the guest boot overlay (auto-network + tmpfs for
// unix sockets, see plugin/vm/guest-boot-rc). Later binds win, so the
// file overlays shadow nothing but their own paths.
function createVmGuestBinds(config) {
  return [
    createWanixBindElement({
      type: "archive",
      dst: ".",
      src: config.linuxUrl,
    }),
    createWanixBindElement({
      type: "file",
      dst: "boot/rc",
      src: config.bootRc || (config.netdev
        ? "/plugin/vm/guest-boot-network-rc"
        : "/plugin/vm/guest-boot-rc"),
      mode: "0755",
    }),
    createWanixBindElement({
      type: "file",
      dst: "bin/post-dhcp",
      src: config.postDhcp || "/plugin/vm/guest-post-dhcp",
      mode: "0755",
    }),
  ];
}

export function startVmSession(session, options = {}) {
  if (session.startPromise) return session.startPromise;
  session.startPromise = ensureVmDriver(session.config.backendUrl).then(() => {
    if (session.destroyed) return;
    const vmId = `vm-panel-${session.id}`;
    const vm = html`<wanix-vm
      for="wanix-system"
      id=${vmId}
      export="ttyS0"
      mem=${session.config.memory}
      netdev=${session.config.netdev || null}
      term=""
      start=""
    >
      ${createVmGuestBinds(session.config)}
    </wanix-vm>`;

    session.vm = vm;
    if (options.renderTerm === false) {
      // Bridge-attached sessions (bare-xterm plugin pages) keep only the
      // VM; the plugin renders its own terminal over the term device.
      session.wrapper.replaceChildren(vm);
      return;
    }

    const term = html`<wanix-term
      for="wanix-system"
      path=${`#vm/${vmId}/term`}
      raw=""
      no-scrollbar=""
    />`;
    session.term = term;
    session.wrapper.replaceChildren(vm, term);
  }).catch((error) => {
    if (session.destroyed) return;
    console.error("VM driver setup failed", error);
    session.wrapper.textContent = `VM failed to start: ${
      error.message || error
    }`;
    session.wrapper.classList.add("vm-session-error");
  });
  return session.startPromise;
}

export function attachVmSession(id, config, anchor, api) {
  const session = getVmSession(id, config);
  startVmSession(session);
  return createOverlayAttachment(session, anchor, api);
}
