// Generic numeric helpers and reduced-motion speed for the prism scene.
// No THREE dependency.

const reducedSpeed = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.35 : 1;

export const SPD = reducedSpeed;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const hermite = (x) => x * x * (3 - 2 * x);
export const smoothstep = hermite;
export const sstep = (a, b, x) => hermite(clamp01((x - a) / (b - a)));

export const wrapPI = (a) => {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};

// Incoming ray: origin (px,py), unit direction (dx,dy).
const TILT = 0.12;
export const RAY = {
  px: 0,
  py: 0.12,
  dx: Math.cos(TILT),
  dy: Math.sin(TILT),
};
export const SLOPE = RAY.dy / RAY.dx;
