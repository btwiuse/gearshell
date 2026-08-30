// Launcher ordering editor: drag-to-reorder the launcher menu.

import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from "lucide-react";
import { settingsDep } from "./settings-deps.js";
import htm from "htm";

const html = htm.bind(React.createElement);

function useLauncherState() {
  const [config, setConfig] = useState(() => settingsDep("loadConfig")());
  const [draggedComponent, setDraggedComponent] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  useEffect(() => {
    const syncConfig = () => setConfig(settingsDep("loadConfig")());
    window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), syncConfig);
    return () =>
      window.removeEventListener(
        settingsDep("WORKSPACE_CHANGED_EVENT"),
        syncConfig,
      );
  }, []);
  const order = settingsDep("normalizeLauncherOrder")(config.launcherOrder);
  const collapsedSet = new Set(config.collapsedLauncherItems);
  const visible = order.filter((component) => !collapsedSet.has(component));
  const collapsed = order.filter((component) => collapsedSet.has(component));
  const optionFor = (component) =>
    settingsDep("PANEL_CREATION_OPTIONS").find((option) =>
      option.component === component
    );
  return {
    config,
    setConfig,
    draggedComponent,
    setDraggedComponent,
    dropTarget,
    setDropTarget,
    visible,
    collapsed,
    optionFor,
  };
}

function useLauncherPersist({ config, setConfig }) {
  const persist = (
    nextVisible,
    nextCollapsed,
    nextStartupPanels = config.startupPanels,
  ) => {
    const nextOrder = [...nextVisible, ...nextCollapsed];
    const selected = new Set(nextStartupPanels);
    setConfig({
      ...settingsDep("loadConfig")(),
      launcherOrder: nextOrder,
      collapsedLauncherItems: nextCollapsed,
      startupPanels: nextOrder.filter((component) => selected.has(component)),
    });
  };
  return { persist };
}

function useLauncherActions(
  {
    config,
    visible,
    collapsed,
    draggedComponent,
    persist,
    setDraggedComponent,
    setDropTarget,
  },
) {
  const toggleStartup = (component) => {
    const selected = new Set(config.startupPanels);
    if (selected.has(component)) selected.delete(component);
    else selected.add(component);
    persist(visible, collapsed, [...selected]);
  };
  const setCollapsed = (component, shouldCollapse) => {
    if (shouldCollapse) {
      persist(visible.filter((item) => item !== component), [
        component,
        ...collapsed,
      ]);
    } else {
      persist(
        [...visible, component],
        collapsed.filter((item) => item !== component),
      );
    }
  };
  const moveWithinSection = (component, isCollapsed, direction) => {
    const section = [...(isCollapsed ? collapsed : visible)];
    const index = section.indexOf(component);
    const target = index + direction;
    if (target < 0 || target >= section.length) return;
    [section[index], section[target]] = [section[target], section[index]];
    persist(isCollapsed ? visible : section, isCollapsed ? section : collapsed);
  };
  const placeDragged = (
    targetComponent,
    targetCollapsed,
    placeAfter = true,
  ) => {
    const source = draggedComponent;
    if (!source) return;
    const nextVisible = visible.filter((component) => component !== source);
    const nextCollapsed = collapsed.filter((component) => component !== source);
    const destination = targetCollapsed ? nextCollapsed : nextVisible;
    const target = targetComponent
      ? destination.indexOf(targetComponent)
      : destination.length;
    destination.splice(
      target + (targetComponent && placeAfter ? 1 : 0),
      0,
      source,
    );
    persist(nextVisible, nextCollapsed);
    setDraggedComponent(null);
    setDropTarget(null);
  };
  return { toggleStartup, setCollapsed, moveWithinSection, placeDragged };
}

function LauncherOrderItemActions(props) {
  const {
    option,
    isCollapsed,
    index,
    sectionLength,
    onToggleCollapsed,
    onMove,
  } = props;
  return html`
    <div className="launcher-order-actions">
      <button
        type="button"
        title=${isCollapsed
          ? `Uncollapse ${option.label}`
          : `Collapse ${option.label}`}
        aria-label=${isCollapsed
          ? `Uncollapse ${option.label}`
          : `Collapse ${option.label}`}
        onClick=${onToggleCollapsed}
      >
        <${isCollapsed ? EyeOff : Eye} size=${15} aria-hidden=${true}/>
      </button>
      <button
        type="button"
        title=${`Move ${option.label} up`}
        aria-label=${`Move ${option.label} up`}
        disabled=${index === 0}
        onClick=${() => onMove(-1)}
      >
        <${ArrowUp} size=${15} aria-hidden=${true}/>
      </button>
      <button
        type="button"
        title=${`Move ${option.label} down`}
        aria-label=${`Move ${option.label} down`}
        disabled=${index === sectionLength - 1}
        onClick=${() => onMove(1)}
      >
        <${ArrowDown} size=${15} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

function launcherItemDragHandlers({
  component,
  isCollapsed,
  draggedComponent,
  onPlace,
  setDraggedComponent,
  setDropTarget,
}) {
  return {
    onDragStart: (event) => {
      setDraggedComponent(component);
      event.dataTransfer?.setData("text/plain", component);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => {
      setDraggedComponent(null);
      setDropTarget(null);
    },
    onDragOver: (event) => {
      if (!draggedComponent || draggedComponent === component) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      setDropTarget({
        component,
        collapsed: isCollapsed,
        after: event.clientY > bounds.top + bounds.height / 2,
      });
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    },
    onDrop: (event) => {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      onPlace(
        component,
        isCollapsed,
        event.clientY > bounds.top + bounds.height / 2,
      );
    },
  };
}

function renderOrderItemBody({ option, isOpenByDefault, onToggleStartup }) {
  const Icon = option.icon;
  return html`
    <${React.Fragment}>
      <${Icon} className="launcher-order-icon" size=${16} aria-hidden=${true}/>
      <span className="launcher-order-label">${option.label}</span>
      <label className="launcher-order-startup">
        <input
          type="checkbox"
          checked=${isOpenByDefault}
          onChange=${onToggleStartup}
        />
        <span>Open by default</span>
      </label>
    </${React.Fragment}>
  `;
}

function launcherOrderRowProps({
  component,
  isCollapsed,
  draggedComponent,
  dropTarget,
  onPlace,
  setDraggedComponent,
  setDropTarget,
}) {
  const isDropTarget = dropTarget?.component === component &&
    dropTarget.collapsed === isCollapsed;
  return {
    className: [
      "launcher-order-item",
      draggedComponent === component && "dragging",
      isDropTarget && (dropTarget.after ? "drop-after" : "drop-before"),
    ].filter(Boolean).join(" "),
    draggable: true,
    ...launcherItemDragHandlers({
      component,
      isCollapsed,
      draggedComponent,
      onPlace,
      setDraggedComponent,
      setDropTarget,
    }),
  };
}

function LauncherOrderItem(props) {
  const {
    component,
    option,
    isCollapsed,
    index,
    sectionLength,
    draggedComponent,
    dropTarget,
    isOpenByDefault,
    onToggleStartup,
    onToggleCollapsed,
    onMove,
    onPlace,
    setDraggedComponent,
    setDropTarget,
  } = props;
  return html`
    <div ...${launcherOrderRowProps({
      component,
      isCollapsed,
      draggedComponent,
      dropTarget,
      onPlace,
      setDraggedComponent,
      setDropTarget,
    })}>
      <${GripVertical} className="launcher-order-handle" size=${16} aria-hidden=${true}/>
      ${renderOrderItemBody({ option, isOpenByDefault, onToggleStartup })}
      <${LauncherOrderItemActions} option=${option} isCollapsed=${isCollapsed} index=${index} sectionLength=${sectionLength} onToggleCollapsed=${onToggleCollapsed} onMove=${onMove}/>
    </div>
  `;
}

function LauncherOrderSection(props) {
  const { title, items, isCollapsed, draggedComponent, renderItem, onPlace } =
    props;
  return html`
    <section
      className=${`launcher-order-section${isCollapsed ? " collapsed" : ""}`}
      onDragOver=${(event) => {
        if (!draggedComponent) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      }}
      onDrop=${(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onPlace(null, isCollapsed);
      }}
    >
      <div className="launcher-order-section-heading">
        <${isCollapsed ? EyeOff : Eye} size=${15} aria-hidden=${true}/>
        <span>${title}</span>
      </div>
      <div className="launcher-order-section-items">
        ${items.length > 0
          ? items.map((component, index) =>
            renderItem(component, isCollapsed, index, items.length),
          )
          : html`<div className="launcher-order-empty">Drop items here</div>`}
      </div>
    </section>
  `;
}

function makeItemRenderer(state, actions) {
  return (component, isCollapsed, index, sectionLength) => {
    const option = state.optionFor(component);
    if (!option) return null;
    return html`<${LauncherOrderItem}
      component=${component}
      option=${option}
      isCollapsed=${isCollapsed}
      index=${index}
      sectionLength=${sectionLength}
      draggedComponent=${state.draggedComponent}
      dropTarget=${state.dropTarget}
      isOpenByDefault=${state.config.startupPanels.includes(component)}
      onToggleStartup=${() => actions.toggleStartup(component)}
      onToggleCollapsed=${() => actions.setCollapsed(component, !isCollapsed)}
      onMove=${(direction) =>
        actions.moveWithinSection(component, isCollapsed, direction)}
      onPlace=${actions.placeDragged}
      setDraggedComponent=${state.setDraggedComponent}
      setDropTarget=${state.setDropTarget}
    />`;
  };
}

export function LauncherOrderEditor() {
  const state = useLauncherState();
  const { persist } = useLauncherPersist({
    config: state.config,
    setConfig: state.setConfig,
  });
  const actions = useLauncherActions({
    config: state.config,
    visible: state.visible,
    collapsed: state.collapsed,
    draggedComponent: state.draggedComponent,
    persist,
    setDraggedComponent: state.setDraggedComponent,
    setDropTarget: state.setDropTarget,
  });
  const renderItem = makeItemRenderer(state, actions);

  return html`
    <${React.Fragment}>
      <p className="hint launcher-order-hint">Drag items to reorder them. Changes to visibility and default startup save immediately.</p>
      <${LauncherOrderSection} title="Visible" items=${state.visible} isCollapsed=${false} draggedComponent=${state.draggedComponent} renderItem=${renderItem} onPlace=${actions.placeDragged}/>
      <${LauncherOrderSection} title="Collapsed" items=${state.collapsed} isCollapsed=${true} draggedComponent=${state.draggedComponent} renderItem=${renderItem} onPlace=${actions.placeDragged}/>
    </${React.Fragment}>
  `;
}
