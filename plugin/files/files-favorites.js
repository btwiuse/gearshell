// files-favorites.js — the macOS Finder-style Favorites list for the
// Files panel: a persisted, user-editable set of shortcuts to common
// directories (Home, Wanix root, any folder the user pins). Lives in
// its own module so FilesPanel in files.js stays under the 500-line
// rule; persistence rides on the workspace shell config.
import { useCallback, useState } from "react";

export function defaultFavorites(homePath) {
  return [
    { id: "home", label: "Home", path: homePath },
  ];
}

export function useFavorites({ loadConfig, saveConfig, homePath }) {
  const [favorites, setFavorites] = useState(() => {
    const stored = loadConfig()?.favorites;
    if (!Array.isArray(stored)) return defaultFavorites(homePath);
    // Drop the legacy default root shortcut; the breadcrumb "/" button
    // already jumps to the filesystem root.
    return stored.filter((favorite) => favorite.id !== "root");
  });

  const persist = (next) => {
    setFavorites(next);
    saveConfig({ ...loadConfig(), favorites: next });
  };

  const addFavorite = useCallback((entry) => {
    setFavorites((prev) => {
      if (prev.some((favorite) => favorite.path === entry.path)) return prev;
      const next = [
        ...prev,
        {
          id: `fav-${Date.now().toString(36)}-${
            Math.random().toString(36).slice(2, 6)
          }`,
          label: entry.name,
          path: entry.path,
          // Files open in the editor instead of navigating; directories
          // (and legacy favorites without the flag) navigate.
          isDirectory: entry.isDirectory !== false,
        },
      ];
      saveConfig({ ...loadConfig(), favorites: next });
      return next;
    });
  }, [saveConfig, loadConfig]);

  const removeFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.filter((favorite) => favorite.id !== id);
      saveConfig({ ...loadConfig(), favorites: next });
      return next;
    });
  }, [saveConfig, loadConfig]);

  const isFavoritePath = useCallback(
    (path) => favorites.some((favorite) => favorite.path === path),
    [favorites],
  );

  return { favorites, addFavorite, removeFavorite, isFavoritePath };
}
