// JSON editor state for the Crush Runner panel: serialises the whole
// preset (profile fields + crushrc) into a pretty-printed buffer so users
// can edit the snapshot in one place. Edits round-trip back into the
// per-field state through applyJsonEdit so the other tabs stay in sync
// with whatever the user types here.

import React, { useEffect, useRef, useState } from "react";

import { crushRunnerDep } from "./crush-deps.js?v=20260825.1";

const SUPPORTED_TASK_TYPES = ["auto", "gojs", "wasi", "js"];

export function useCrushJsonEdit({
  draft,
  setDraft,
  activePreset,
  crushrcContent,
  setCrushrcContent,
  setStatus,
}) {
  const buildJsonSnapshot = () => ({
    id: (activePreset && activePreset.id) || "crush",
    name: draft.name || "",
    icon: draft.icon || "bot",
    program: draft.program || "",
    args: draft.args || "",
    type: draft.type || "gojs",
    env: draft.env || "",
    wd: draft.wd || "",
    crushrc: crushrcContent || "",
  });
  const jsonSnapshot = JSON.stringify(buildJsonSnapshot(), null, 2);
  const [jsonDraft, setJsonDraft] = useState(jsonSnapshot);
  // Keep the buffer in sync whenever the user edits one of the per-field
  // tabs; we only overwrite the local copy if it currently matches what
  // we last computed, so we don't trample an in-flight JSON edit.
  const jsonSnapshotPrevRef = useRef(jsonSnapshot);
  useEffect(() => {
    if (jsonSnapshot === jsonSnapshotPrevRef.current) return;
    if (jsonDraft === jsonSnapshotPrevRef.current) {
      setJsonDraft(jsonSnapshot);
    }
    jsonSnapshotPrevRef.current = jsonSnapshot;
  }, [jsonSnapshot, jsonDraft]);
  const jsonDraftDirty = jsonDraft !== jsonSnapshot;

  const parseJsonDraft = (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: `Invalid JSON: ${error.message}` };
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "JSON must describe an object." };
    }
    const stringField = (key) => {
      const value = parsed[key];
      if (value == null) return "";
      if (typeof value !== "string") {
        return { ok: false, error: `Field "${key}" must be a string.` };
      }
      return value;
    };
    const name = stringField("name");
    const icon = stringField("icon");
    const program = stringField("program");
    const args = stringField("args");
    const type = stringField("type");
    const env = stringField("env");
    const wd = stringField("wd");
    const crushrc = stringField("crushrc");
    for (const result of [name, icon, program, args, type, env, wd, crushrc]) {
      if (typeof result !== "string") return result;
    }
    if (!SUPPORTED_TASK_TYPES.includes(type)) {
      return {
        ok: false,
        error: `Field "type" must be one of ${
          SUPPORTED_TASK_TYPES.join(", ")
        }.`,
      };
    }
    const iconTable = crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID");
    if (icon && !iconTable[icon]) {
      return { ok: false, error: `Unknown icon "${icon}".` };
    }
    return {
      ok: true,
      value: { name, icon, program, args, type, env, wd, crushrc },
    };
  };

  const applyJsonEdit = (raw) => {
    setJsonDraft(raw);
    const result = parseJsonDraft(raw);
    if (!result.ok) {
      setStatus({ message: result.error, isError: true });
      return;
    }
    setStatus({ message: "", isError: false });
    setDraft((current) => ({
      ...current,
      name: result.value.name,
      icon: result.value.icon || "bot",
      program: result.value.program || "crush",
      args: result.value.args,
      type: result.value.type,
      env: result.value.env,
      wd: result.value.wd,
    }));
    setCrushrcContent(result.value.crushrc);
    setStatus({ message: "Synced JSON into the form.", isError: false });
  };

  const resetJsonDraft = () => {
    setJsonDraft(JSON.stringify(buildJsonSnapshot(), null, 2));
    setStatus({
      message: "Reset JSON to the current form state.",
      isError: false,
    });
  };

  return { jsonDraft, setJsonDraft, jsonDraftDirty, applyJsonEdit, resetJsonDraft };
}
