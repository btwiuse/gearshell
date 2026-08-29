// Terminal preset editor state hooks (split out of
// settings-terminal-editor.js so no file exceeds the 500-line
// budget). Pure React state + persistence helpers over the settings
// dep shim.

import React, { useEffect, useState } from "react";
import { settingsDep } from "./settings-deps.js?v=20260826.3";

function useConfigSync(setConfig) {
  useEffect(() => {
    const syncConfig = () => setConfig(settingsDep("loadConfig")());
    window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), syncConfig);
    return () =>
      window.removeEventListener(
        settingsDep("WORKSPACE_CHANGED_EVENT"),
        syncConfig,
      );
  }, [setConfig]);
}

export function useTerminalPresetState() {
  const [config, setConfig] = useState(() => settingsDep("loadConfig")());
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [draft, setDraft] = useState(settingsDep("blankTerminalPresetDraft"));
  const [status, setStatus] = useState({ message: "", isError: false });
  const [draggedId, setDraggedId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  useConfigSync(setConfig);
  const updateDraft = (field, value) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const resetDraft = () => {
    setEditingProfileId(null);
    setDraft(settingsDep("blankTerminalPresetDraft")());
  };
  const editProfile = (profile) => {
    setEditingProfileId(profile.id);
    setDraft({
      name: profile.name,
      icon: profile.icon,
      program: profile.program,
      args: profile.args,
      type: profile.type,
      wd: profile.wd,
      env: profile.env,
    });
    setStatus({ message: `Editing ${profile.name}.`, isError: false });
  };
  return {
    config,
    setConfig,
    editingProfileId,
    draft,
    status,
    setStatus,
    draggedId,
    setDraggedId,
    dropTarget,
    setDropTarget,
    updateDraft,
    resetDraft,
    editProfile,
  };
}

export function useTerminalPresetOrder(
  { config, profiles, draggedId, setDraggedId, setDropTarget },
) {
  const saveOrder = (nextOrder) => {
    settingsDep("saveTerminalProfiles")(
      config.terminalProfiles,
      config.defaultTerminalProfileId,
      nextOrder,
    );
  };
  const move = (profileId, direction) => {
    const nextOrder = profiles.map((profile) => profile.id);
    const index = nextOrder.indexOf(profileId);
    const target = index + direction;
    if (target < 0 || target >= nextOrder.length) return;
    [nextOrder[index], nextOrder[target]] = [
      nextOrder[target],
      nextOrder[index],
    ];
    saveOrder(nextOrder);
  };
  const drop = (targetId, placeAfter) => {
    if (!draggedId || draggedId === targetId) return;
    const nextOrder = profiles.map((profile) => profile.id).filter((id) =>
      id !== draggedId
    );
    const targetIndex = nextOrder.indexOf(targetId);
    nextOrder.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedId);
    saveOrder(nextOrder);
    setDraggedId(null);
    setDropTarget(null);
  };
  return { saveOrder, move, drop };
}

function validateTerminalProfileDraft({ draft, editingProfileId, profiles }) {
  const profile = settingsDep("normalizeTerminalProfile")({
    ...draft,
    id: editingProfileId || undefined,
  });
  if (!profile.program) throw new Error("A program is required.");
  if (
    profiles.some((item) =>
      item.id !== editingProfileId &&
      item.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase()
    )
  ) {
    throw new Error("A terminal preset with this name already exists.");
  }
  return profile;
}

function buildTerminalProfilesNext(config, editingProfileId, profile) {
  const existing = config.terminalProfiles.some((item) =>
    item.id === editingProfileId
  );
  return editingProfileId && existing
    ? config.terminalProfiles.map((item) =>
      item.id === editingProfileId ? profile : item
    )
    : [...config.terminalProfiles, profile];
}

function savePresetDraft(ctx) {
  const { config, profiles, editingProfileId, draft, setStatus, resetDraft } =
    ctx;
  try {
    const profile = validateTerminalProfileDraft({
      draft,
      editingProfileId,
      profiles,
    });
    const nextProfiles = buildTerminalProfilesNext(
      config,
      editingProfileId,
      profile,
    );
    const nextOrder = settingsDep("normalizeTerminalProfileOrder")(
      config.terminalProfileOrder,
      nextProfiles,
    );
    settingsDep("saveTerminalProfiles")(
      nextProfiles,
      config.defaultTerminalProfileId,
      nextOrder,
    );
    setStatus({
      message: `${editingProfileId ? "Updated" : "Added"} ${profile.name}.`,
      isError: false,
    });
    resetDraft();
  } catch (error) {
    setStatus({
      message: error.message || "Unable to save the terminal preset.",
      isError: true,
    });
  }
}

function removePresetProfile(ctx, profile) {
  const { config, editingProfileId, setStatus, resetDraft } = ctx;
  const nextProfiles = config.terminalProfiles.filter((item) =>
    item.id !== profile.id
  );
  const nextOrder = config.terminalProfileOrder.filter((id) =>
    id !== profile.id
  );
  settingsDep("saveTerminalProfiles")(
    nextProfiles,
    config.defaultTerminalProfileId === profile.id
      ? "bash"
      : config.defaultTerminalProfileId,
    nextOrder,
  );
  if (editingProfileId === profile.id) resetDraft();
  setStatus({ message: `Removed ${profile.name}.`, isError: false });
}

export function useTerminalPresetSave(props) {
  return {
    saveDraft: () => savePresetDraft(props),
    removeProfile: (profile) => removePresetProfile(props, profile),
  };
}
