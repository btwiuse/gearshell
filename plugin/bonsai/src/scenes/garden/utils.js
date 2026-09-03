// Generic numeric and procedural helpers for the garden scene.
// No THREE dependency beyond Vector3, Color, and MathUtils.

export const TAU = Math.PI * 2;
export const UP = new THREE.Vector3(0, 1, 0);

// Reduced-motion multiplier; matches the prism scene's SPD convention.
export const MOT = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.35 : 1;

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

// Mulberry32 — fast, seedable PRNG used by TreeBuilder.
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Back-eased overshoot for pad bloom.
export function easeOutBack(t) {
  const c = 1.35;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// Convert sRGB hex into a Linear-space Color (Three's working space).
export const SC = (hex) => new THREE.Color(hex).convertSRGBToLinear();
