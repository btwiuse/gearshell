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
} from "./app-state.js?v=20260826.2";
import { HOME } from "./app-constants.js?v=20260828.9";
import {
  buildEnv,
  getDefaultTerminalProfile,
  terminalCommand,
} from "./app-terminal-profiles.js?v=20260826.7";
import { DEFAULT_CMD } from "./app-constants.js?v=20260828.9";
import { wanixSystem } from "./app-state.js?v=20260826.2";
import { createWanixBindElement } from "./app-wanix.js?v=20260826.7";

export const DEFAULT_IFRAME_ALLOW = "clipboard-read; clipboard-write";

export function createIframeSession(
  id,
  { src, title, allow = DEFAULT_IFRAME_ALLOW, allowFullscreen = false },
) {
  const wrapper = document.createElement("div");
  wrapper.className = "iframe-session";

  const iframe = document.createElement("iframe");
  iframe.className = "iframe-panel";
  iframe.src = src;
  iframe.title = title;
  iframe.allow = allow;
  iframe.allowFullscreen = allowFullscreen;

  wrapper.appendChild(iframe);
  terminalLayer?.appendChild(wrapper);

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
  const wrapper = document.createElement("div");
  wrapper.className = "workbench-session";

  const workbench = document.createElement("wanix-workbench");
  workbench.setAttribute("for", "wanix-system");
  workbench.setAttribute("assets", config.assetsUrl);
  workbench.setAttribute("term", "");
  // Hush consumes an interactive terminal stream, including control and
  // escape sequences. Let xterm forward each key instead of line-buffering.
  workbench.setAttribute("raw", "");
  workbench.setAttribute("sidebar", "always");
  const profile = getDefaultTerminalProfile();
  const shell = document.createElement("wanix-task");
  shell.setAttribute("role", "shell");
  shell.setAttribute("cmd", terminalCommand(profile) || DEFAULT_CMD);
  shell.setAttribute("type", profile.type || "gojs");
  shell.setAttribute("env", buildEnv(profile.env));
  // Workbench creates the task through the task control filesystem instead
  // of a wanix-task element. Its runtime requires a concrete directory, while
  // a blank `dir` is interpreted as an invalid path.
  shell.setAttribute("wd", profile.wd || HOME);
  workbench.appendChild(shell);
  wrapper.appendChild(workbench);
  terminalLayer?.appendChild(wrapper);

  const session = { id, wrapper, workbench, anchor: null, layout: null };
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
    const bindings = document.createElement("div");
    bindings.appendChild(bind);
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
  const wrapper = document.createElement("div");
  wrapper.className = "vm-session";
  wrapper.textContent = "Preparing VM…";
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

export function startVmSession(session) {
  if (session.startPromise) return session.startPromise;
  session.startPromise = ensureVmDriver(session.config.backendUrl).then(() => {
    if (session.destroyed) return;
    const vmId = `vm-panel-${session.id}`;
    const vm = document.createElement("wanix-vm");
    vm.setAttribute("for", "wanix-system");
    vm.setAttribute("id", vmId);
    vm.setAttribute("export", "ttyS0");
    vm.setAttribute("mem", session.config.memory);
    if (session.config.netdev) vm.setAttribute("netdev", session.config.netdev);
    vm.setAttribute("term", "");
    vm.setAttribute("start", "");
    vm.appendChild(
      createWanixBindElement({
        type: "archive",
        dst: ".",
        src: session.config.linuxUrl,
      }),
    );

    const term = document.createElement("wanix-term");
    term.setAttribute("for", "wanix-system");
    term.setAttribute("path", `#vm/${vmId}/term`);
    term.setAttribute("raw", "");
    term.setAttribute("no-scrollbar", "");
    session.vm = vm;
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
