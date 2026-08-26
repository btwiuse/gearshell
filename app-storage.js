// localStorage helpers + storage key derivations (500-line rule split).

import {
  WORKSPACE_KEY_PREFIX,
  WORKSPACE_PRESET_KEY_PREFIX,
} from "./app-constants.js?v=20260826.8";

export function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Unable to save ${key}`, error);
    return false;
  }
}

export function workspaceStorageKey(id) {
  return `${WORKSPACE_KEY_PREFIX}${id}`;
}

export function workspacePresetStorageKey(id) {
  return `${WORKSPACE_PRESET_KEY_PREFIX}${id}`;
}

export function createWorkspaceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
