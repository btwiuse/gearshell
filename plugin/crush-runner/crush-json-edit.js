// JSON editor state for the Crush Runner panel: serialises the whole
// preset (profile fields + crushrc) into a pretty-printed buffer so users
// can edit the snapshot in one place. Edits round-trip back into the
// per-field state through applyJsonEdit so the other tabs stay in sync
// with whatever the user types here.

import React, { useEffect, useRef, useState } from "react";

import { crushRunnerDep } from "./crush-deps.js?v=20260828.4";

const SUPPORTED_TASK_TYPES = ["auto", "gojs", "wasi", "js"];

function buildJsonSnapshot({ activePreset, draft, crushrcContent }) {
  return {
    id: (activePreset && activePreset.id) || "crush",
    name: draft.name || "",
    icon: draft.icon || "bot",
    program: draft.program || "",
    args: draft.args || "",
    type: draft.type || "gojs",
    env: draft.env || "",
    wd: draft.wd || "",
    crushrc: crushrcContent || "",
  };
}

function stringField(parsed, key) {
  const value = parsed[key];
  if (value == null) return "";
  if (typeof value !== "string") {
    return { ok: false, error: `Field "${key}" must be a string.` };
  }
  return value;
}

function parseJsonDraft(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error.message}` };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "JSON must describe an object." };
  }
  const name = stringField(parsed, "name");
  const icon = stringField(parsed, "icon");
  const program = stringField(parsed, "program");
  const args = stringField(parsed, "args");
  const type = stringField(parsed, "type");
  const env = stringField(parsed, "env");
  const wd = stringField(parsed, "wd");
  const crushrc = stringField(parsed, "crushrc");
  for (const result of [name, icon, program, args, type, env, wd, crushrc]) {
    if (typeof result !== "string") return result;
  }
  if (!SUPPORTED_TASK_TYPES.includes(type)) {
    return {
      ok: false,
      error: `Field "type" must be one of ${SUPPORTED_TASK_TYPES.join(", ")}.`,
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
}

function applyParsedJson(
  { raw, setJsonDraft, setStatus, setDraft, setCrushrcContent },
) {
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
}

export function useCrushJsonEdit({
  draft,
  setDraft,
  activePreset,
  crushrcContent,
  setCrushrcContent,
  setStatus,
}) {
  const jsonSnapshot = JSON.stringify(
    buildJsonSnapshot({ activePreset, draft, crushrcContent }),
    null,
    2,
  );
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
  const applyJsonEdit = (raw) =>
    applyParsedJson({
      raw,
      setJsonDraft,
      setStatus,
      setDraft,
      setCrushrcContent,
    });
  const resetJsonDraft = () => {
    setJsonDraft(JSON.stringify(
      buildJsonSnapshot({ activePreset, draft, crushrcContent }),
      null,
      2,
    ));
    setStatus({
      message: "Reset JSON to the current form state.",
      isError: false,
    });
  };
  return {
    jsonDraft,
    setJsonDraft,
    jsonDraftDirty,
    applyJsonEdit,
    resetJsonDraft,
  };
}
