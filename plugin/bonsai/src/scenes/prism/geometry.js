// Beam and sheet geometry/material builders for the prism scene.
// Builds dynamic BufferGeometries with side+tangent attributes for beams
// and column-typed attributes for spectral sheets.

import { BEAM_FRAG, BEAM_VERT, SHEET_FRAG, SHEET_VERT } from "./shaders.js";
import { specColor } from "./optics.js";

// Three vertices of the equilateral triangle (circumradius R).
const TAU = Math.PI * 2;
export const LOCAL_V = Array.from({ length: 3 }, (_, i) => {
  const a = Math.PI / 2 + i * (TAU / 3);
  return { x: 1.85 * Math.cos(a), y: 1.85 * Math.sin(a) };
});

// Allocate a pool of mutable THREE.Vector3 points.
export const vecArray = (n) => Array.from({ length: n }, () => new THREE.Vector3());

// Triangulated strip of n segments oriented along position+tangent+side.
export function createBeamGeometry(n) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 2 * 3);
  const tan = new Float32Array(n * 2 * 3);
  const side = new Float32Array(n * 2);
  const tArr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    side[2 * i] = 1;
    side[2 * i + 1] = -1;
    tArr[2 * i] = tArr[2 * i + 1] = i / (n - 1);
  }
  const idx = new Uint16Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) {
    const o = i * 6;
    const v = i * 2;
    idx[o] = v;
    idx[o + 1] = v + 1;
    idx[o + 2] = v + 2;
    idx[o + 3] = v + 1;
    idx[o + 4] = v + 3;
    idx[o + 5] = v + 2;
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const tanAttr = new THREE.BufferAttribute(tan, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  geo.setAttribute("position", posAttr);
  geo.setAttribute("aTangent", tanAttr);
  geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  geo.setAttribute("aT", new THREE.BufferAttribute(tArr, 1));
  return { geo, pos, tan, posAttr, tanAttr };
}

export function createBeamMaterial(hex, width, opacity, tailFade) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(hex) },
      uWidth: { value: width },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uTailFade: { value: tailFade },
      uSeed: { value: Math.random() * 10 },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
  });
}

// Spectral sheet grid (cols columns × rows rows), per-column attributes.
function fillSheetAttributes(cols, rows, aW, aT, aCol) {
  for (let k = 0; k < rows; k++) {
    for (let c = 0; c < cols; c++) {
      const i = k * cols + c;
      const w = c / (cols - 1);
      aW[i] = w;
      aT[i] = k / (rows - 1);
      const rgb = specColor(w);
      aCol[i * 3] = rgb[0];
      aCol[i * 3 + 1] = rgb[1];
      aCol[i * 3 + 2] = rgb[2];
    }
  }
}

export function createSheetGeometry(cols, rows) {
  const count = cols * rows;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const aW = new Float32Array(count);
  const aT = new Float32Array(count);
  const aAlpha = new Float32Array(count);
  const aRev = new Float32Array(count);
  const aCol = new Float32Array(count * 3);
  fillSheetAttributes(cols, rows, aW, aT, aCol);
  const idx = new Uint16Array((cols - 1) * (rows - 1) * 6);
  let o = 0;
  for (let k = 0; k < rows - 1; k++) {
    for (let c = 0; c < cols - 1; c++) {
      const v = k * cols + c;
      idx[o++] = v;
      idx[o++] = v + 1;
      idx[o++] = v + cols;
      idx[o++] = v + 1;
      idx[o++] = v + cols + 1;
      idx[o++] = v + cols;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const aAttr = new THREE.BufferAttribute(aAlpha, 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  const revAttr = new THREE.BufferAttribute(aRev, 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  geo.setAttribute("position", posAttr);
  geo.setAttribute("aAlpha", aAttr);
  geo.setAttribute("aRev", revAttr);
  geo.setAttribute("aW", new THREE.BufferAttribute(aW, 1));
  geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(aCol, 3));
  return { geo, pos, aAlpha, aRev, posAttr, aAttr, revAttr };
}

export function createSheetMaterial({
  opacity,
  headWhite,
  headK,
  alongBase,
  alongK,
}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uHeadWhite: { value: headWhite },
      uHeadK: { value: headK },
      uAlongBase: { value: alongBase },
      uAlongK: { value: alongK },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: SHEET_FRAG,
  });
}

// Linear-interpolate position (u in [0,1]) along a sheet's column c.
export function sampleSheet(sheet, c, u, out) {
  const f = Math.max(0, Math.min(1, u)) * (sheet.rows - 1);
  const k = Math.min(sheet.rows - 2, Math.floor(f));
  const m = f - k;
  const i0 = (k * sheet.cols + c) * 3;
  const i1 = ((k + 1) * sheet.cols + c) * 3;
  const p = sheet.pos;
  out.set(
    p[i0] + (p[i1] - p[i0]) * m,
    p[i0 + 1] + (p[i1 + 1] - p[i0 + 1]) * m,
    p[i0 + 2] + (p[i1 + 2] - p[i0 + 2]) * m,
  );
}

// Linear-interpolate position (u in [0,1]) along a polyline pts.
export function samplePts(pts, u, out) {
  const f = Math.max(0, Math.min(1, u)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  out.copy(pts[i]).lerp(pts[i + 1], f - i);
}
