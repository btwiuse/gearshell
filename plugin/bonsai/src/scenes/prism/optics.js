// Spectral optics: Cauchy dispersion + visible-wavelength color mapping.
// Pure functions, no THREE dependency.

import { COL_COUNT } from "./constants.js";

// Cauchy's equation: n(λ) = A + B/λ².
// Calibrated so n(650 nm) = 1.115 and n(410 nm) = 1.228.
const L_RED = 650;
const L_VIOLET = 410;
const CAU_B = (1.228 - 1.115) /
  (1 / (L_VIOLET * L_VIOLET) - 1 / (L_RED * L_RED));
const CAU_A = 1.115 - CAU_B / (L_RED * L_RED);

const lambdaOf = (w) => L_RED + (L_VIOLET - L_RED) * w;

const nOf = (w) => {
  const l = lambdaOf(w);
  return CAU_A + CAU_B / (l * l);
};

// Pre-computed refractive indices for each fan column.
export const N_COL = Array.from(
  { length: COL_COUNT },
  (_, c) => nOf(c / (COL_COUNT - 1)),
);

// Approximate sRGB color from wavelength in nanometers.
function waveColor(l) {
  let r, g, b;
  if (l < 440) {
    r = -(l - 440) / 60;
    g = 0;
    b = 1;
  } else if (l < 490) {
    r = 0;
    g = (l - 440) / 50;
    b = 1;
  } else if (l < 510) {
    r = 0;
    g = 1;
    b = -(l - 510) / 20;
  } else if (l < 580) {
    r = (l - 510) / 70;
    g = 1;
    b = 0;
  } else if (l < 645) {
    r = 1;
    g = -(l - 645) / 65;
    b = 0;
  } else {
    r = 1;
    g = 0;
    b = 0;
  }
  const f = l < 420 ? 0.45 + (0.55 * (l - 395)) / 25 : l > 645 ? 0.5 + (0.5 * (700 - l)) / 55 : 1;
  return [r * f, g * f, b * f];
}

// Spectral color for a fan coordinate w (0..1).
export const specColor = (w) => waveColor(lambdaOf(w));
