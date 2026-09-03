// Pulse palette helpers for the prism scene.
// Depends on THREE at runtime; depends on specColor from optics.

import { specColor } from "./optics.js";

// Hex color used to tint pulse sprites at a given spectral coordinate w.
export const pulseHex = (w) => new THREE.Color(...specColor(w)).getHex();
