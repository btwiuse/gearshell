// Scene-wide numeric constants for the prism scene.
// Group geometry, row counts, light propagation, pulse cadence.

import { SPD } from "./utils.js";

// Triangular prism geometry (regular triangle, circumradius R).
export const R = 1.85;
export const DEPTH = 2.1;

// Refractive index at the central wavelength (Cauchy model).
export const N_CENTER = 1.17;
// Angular spread factor applied to each column's exit angle.
export const SPREAD = 3;

// Spectral fan + sheet row counts.
export const COL_COUNT = 24;
export const EXIT_ROWS = 40;
export const INNER_ROWS = 8;

// Pulse spectral positions (0..1 across the fan).
export const PULSE_W = [0, 0.2, 0.4, 0.6, 0.8, 1];

// Light propagation speed and derived medium velocity (CV).
export const LIGHT_SPEED = 4;
export const CV = LIGHT_SPEED / SPD;

// Time before pulse emission begins, after scene start.
export const T0 = 0.25;

// Length over which each spectral exit beam extends.
export const EXIT_LEN = 13.5;

// Pulse cadence.
export const PULSE_COUNT = 5;
export const T_EMIT = 2.2;
export const CYCLE = PULSE_COUNT * T_EMIT;
// Map each pulse spectral coordinate to a column index in the fan.
export const PULSE_COL = PULSE_W.map((w) => Math.round(w * (COL_COUNT - 1)));

// Beam point counts.
export const INC_N = 56;
export const REF_N = 16;
export const RES_N = 24;
