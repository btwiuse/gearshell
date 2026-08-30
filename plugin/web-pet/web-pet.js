// web-pet.js — the Wagi Dog desktop pet (overlay component).
//
// Lives with the web-pet plugin (it is only used there). The pet sprite
// / animation engine lives in its own module (/web-pet/index.js) and is
// loaded lazily so a missing submodule (404s) does not crash the shell
// — the pet just stays disabled. The shell config `wagiDogEnabled` flag
// gates visibility; the plugin manifest gates availability.

import React, { useEffect, useRef } from "react";
import { panelsDep } from "../../panels.js?v=20260812.138";

let webPetModulePromise = null;
function loadWebPetModule() {
  if (webPetModulePromise) return webPetModulePromise;
  webPetModulePromise = import("../../web-pet/index.js")
    .then((mod) => mod.default || mod.WebPet)
    .catch((error) => {
      // Reset so a later retry (e.g. after a config toggle) can try
      // again; surface the failure once via the dev-error overlay so
      // it's diagnosable but don't throw — the shell has to keep
      // running without the desktop pet.
      webPetModulePromise = null;
      if (typeof console !== "undefined") {
        console.warn("web-pet unavailable:", error);
      }
      return null;
    });
  return webPetModulePromise;
}

export function WagiDogPet() {
  const petRef = useRef(null);
  const WebPetRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadWebPetModule().then((WebPetClass) => {
      if (cancelled) return;
      WebPetRef.current = WebPetClass;
      if (WebPetClass) syncWagiDog();
    });
    function syncWagiDog() {
      if (panelsDep("loadConfig")().wagiDogEnabled) {
        if (WebPetRef.current && !petRef.current) {
          petRef.current = new WebPetRef.current();
        }
      } else {
        petRef.current?.destroy();
        petRef.current = null;
      }
    }
    syncWagiDog();
    window.addEventListener(panelsDep("WORKSPACE_CHANGED_EVENT"), syncWagiDog);
    return () => {
      cancelled = true;
      window.removeEventListener(
        panelsDep("WORKSPACE_CHANGED_EVENT"),
        syncWagiDog,
      );
      petRef.current?.destroy();
      petRef.current = null;
    };
  }, []);

  return null;
}
