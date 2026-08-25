// Preset CRUD for the Crush Runner panel: save / save-as-new / delete /
// activate / reset handlers. Kept separate from the panel controller so
// each module stays small (500-line rule) and the handlers read as a
// single concern: "editing and persisting presets".

import { crushRunnerDep } from "./crush-deps.js?v=20260825.1";
import { CRUSH_RUNNER_DEFAULT_PROFILE, DEFAULT_CRUSHRC } from "./crush-presets.js?v=20260825.1";
import { crushRunDirFor } from "./crush-config.js?v=20260825.1";

export function useCrushPresetCrud({
  activePreset,
  draft,
  setDraft,
  crushrcContent,
  setCrushrcContent,
  setPresets,
  setSavedMarker,
  setStatus,
  switchToPreset,
  programAutoManagedRef,
  updateField,
  params,
}) {
  const saveUpdates = () => {
    try {
      const config = crushRunnerDep("loadConfig")();
      const others = (config.crushRunnerPresets || []).filter((preset) =>
        preset.id !== activePreset.id
      );
      const nextPreset = crushRunnerDep("normalizeCrushRunnerPreset")({
        ...CRUSH_RUNNER_DEFAULT_PROFILE,
        ...activePreset,
        ...draft,
        id: activePreset.id,
        builtin: activePreset.builtin === true,
        crushrc: crushrcContent,
      });
      const nextPresets = activePreset.builtin
        ? [{ ...nextPreset, builtin: false, id: nextPreset.id }, ...others]
        : [nextPreset, ...others];
      crushRunnerDep("saveCrushRunnerPresets")(
        nextPresets,
        activePreset.id,
        config.crushRunnerPresetOrder,
      );
      setPresets(
        crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")()),
      );
      setSavedMarker((value) => value + 1);
      setStatus({
        message: `Saved updates to "${activePreset.name}".`,
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Unable to save the preset.",
        isError: true,
      });
    }
  };

  const saveAsNewPreset = () => {
    try {
      const config = crushRunnerDep("loadConfig")();
      const baseName = (draft.name || "").trim() || activePreset.name ||
        "Crush";
      let candidate = baseName;
      let suffix = 2;
      while (
        (config.crushRunnerPresets || []).some((preset) =>
          preset.name.toLocaleLowerCase() === candidate.toLocaleLowerCase()
        )
      ) {
        candidate = `${baseName} (${suffix++})`;
      }
      const nextPreset = crushRunnerDep("normalizeCrushRunnerPreset")({
        ...CRUSH_RUNNER_DEFAULT_PROFILE,
        ...activePreset,
        ...draft,
        // Force a fresh id and mark this as a user preset so it doesn't
        // collide with the built-in `crush` slot; spreading activePreset
        // would otherwise re-use its id (`crush` for the built-in tab) and
        // silently overwrite the built-in instead of creating a sibling.
        id: undefined,
        name: candidate,
        builtin: false,
        crushrc: crushrcContent,
      });
      const nextPresets = [...(config.crushRunnerPresets || []), nextPreset];
      const activeIndex = (config.crushRunnerPresetOrder || []).indexOf(
        activePreset.id,
      );
      // Insert the new preset immediately after the source preset so it
      // appears as a sibling in the UI ("presets derived from X live next
      // to X"), rather than jumping to the top of the list.
      const nextOrder = activeIndex === -1
        ? [nextPreset.id, ...(config.crushRunnerPresetOrder || [])]
        : [
          ...(config.crushRunnerPresetOrder || []).slice(0, activeIndex + 1),
          nextPreset.id,
          ...(config.crushRunnerPresetOrder || []).slice(activeIndex + 1)
            .filter((id) => id !== nextPreset.id),
        ];
      crushRunnerDep("saveCrushRunnerPresets")(
        nextPresets,
        nextPreset.id,
        nextOrder,
      );
      setPresets(
        crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")()),
      );
      switchToPreset(nextPreset);
      setStatus({
        message: `Saved "${candidate}" as a new preset.`,
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Unable to save the new preset.",
        isError: true,
      });
    }
  };

  const deleteActivePreset = () => {
    if (activePreset.builtin) {
      setStatus({
        message: "Built-in Crush preset cannot be deleted.",
        isError: true,
      });
      return;
    }
    try {
      const config = crushRunnerDep("loadConfig")();
      const remaining = (config.crushRunnerPresets || []).filter((preset) =>
        preset.id !== activePreset.id
      );
      const nextOrder = (config.crushRunnerPresetOrder || []).filter((id) =>
        id !== activePreset.id
      );
      crushRunnerDep("saveCrushRunnerPresets")(remaining, "crush", nextOrder);
      const fresh = crushRunnerDep("getCrushRunnerPresets")(
        crushRunnerDep("loadConfig")(),
      );
      setPresets(fresh);
      const nextActive = fresh[0];
      switchToPreset(nextActive);
      setStatus({ message: `Removed "${activePreset.name}".`, isError: false });
    } catch (error) {
      setStatus({
        message: error.message || "Unable to delete the preset.",
        isError: true,
      });
    }
  };

  const activatePreset = (preset) => {
    if (preset.id === activePreset.id) return;
    try {
      const config = crushRunnerDep("loadConfig")();
      crushRunnerDep("saveCrushRunnerPresets")(
        config.crushRunnerPresets || [],
        preset.id,
        config.crushRunnerPresetOrder,
      );
      setPresets(
        crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")()),
      );
      switchToPreset(preset);
      // Skip the status banner: the chip / dropdown highlight already
      // tells the user which preset is active, and a "Active preset: X"
      // toast is just noise.
    } catch (error) {
      setStatus({
        message: error.message || "Unable to switch presets.",
        isError: true,
      });
    }
  };

  // Per-tab reset helpers. Each operates only on the inputs the tab
  // owns so a reset never reaches across the tab boundary. The button
  // is disabled when the corresponding tab is already clean.
  const resetProfileFields = () => {
    // Built-in presets reset to the code-side CRUSH_RUNNER_DEFAULT_PROFILE so
    // localStorage overrides from older sessions can't leak into the form.
    // User presets still reset to their own saved values, since the user
    // explicitly authored those.
    const base = activePreset && activePreset.builtin === false
      ? activePreset
      : CRUSH_RUNNER_DEFAULT_PROFILE;
    const pick = (field) =>
      base[field] == null ? CRUSH_RUNNER_DEFAULT_PROFILE[field] : base[field];
    setDraft((current) => ({
      ...current,
      name: pick("name") || "",
      icon: pick("icon") || "bot",
      program: pick("program") || "crush",
      args: pick("args") || "",
      type: pick("type") || "gojs",
      wd: pick("wd") || "",
    }));
    programAutoManagedRef.current = true;
    setStatus({
      message: "Reset profile fields to the saved preset.",
      isError: false,
    });
  };

  const resetEnvField = () => {
    const base = activePreset && activePreset.builtin === false
      ? activePreset
      : CRUSH_RUNNER_DEFAULT_PROFILE;
    const fallback = CRUSH_RUNNER_DEFAULT_PROFILE.env || "";
    const next = base.env == null ? fallback : (base.env || "");
    updateField("env", next);
    setStatus({
      message: "Reset env overrides to the saved preset.",
      isError: false,
    });
  };

  const resetCrushrcField = () => {
    // Built-in presets reset to their own bundled crushrc template so
    // each provider-specific slot (Ox, MiniMax, DeepSeek, StepFun, All)
    // round-trips back to its shipped config. User presets also reset
    // to their own saved crushrc; the shared DEFAULT_CRUSHRC only
    // serves as the ultimate fallback when no preset is active.
    const fallback = activePreset && activePreset.crushrc
      ? activePreset.crushrc
      : DEFAULT_CRUSHRC;
    setCrushrcContent(fallback);
    setStatus({
      message: "Reset crushrc to the built-in template.",
      isError: false,
    });
  };

  const copyProfileJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(
        {
          profile: draft,
          crushrc: crushrcContent,
          configDir: crushRunDirFor(params?.runnerId),
        },
        null,
        2,
      ));
      setStatus({
        message: "Copied profile + crushrc to clipboard.",
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Clipboard copy failed.",
        isError: true,
      });
    }
  };

  return {
    saveUpdates,
    saveAsNewPreset,
    deleteActivePreset,
    activatePreset,
    resetProfileFields,
    resetEnvField,
    resetCrushrcField,
    copyProfileJson,
  };
}
