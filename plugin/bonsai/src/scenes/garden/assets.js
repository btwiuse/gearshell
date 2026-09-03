// Procedural canvas textures, materials, and palette constants for the
// garden scene. Built once at module load; the rest of the scene consumes
// these as singletons.

import { SC } from "./utils.js";

// Generic canvas-texture helper: draw into a square canvas with size `size`.
export function canvasTex(size, draw) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = size;
  draw(textureCanvas.getContext("2d"), size);
  return new THREE.CanvasTexture(textureCanvas);
}

// Soft radial glow used by every additive sprite in the scene.
export const glowTex = canvasTex(256, function (g, s) {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.5)");
  r.addColorStop(0.6, "rgba(255,255,255,0.11)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

// Soft pink petal sprite (stretched round gradient).
export const petalTex = canvasTex(64, function (g, s) {
  g.translate(s / 2, s / 2);
  g.scale(1, 1.45);
  const r = g.createRadialGradient(0, 0, 1, 0, 0, s * 0.32);
  r.addColorStop(0, "rgba(255,240,246,1)");
  r.addColorStop(0.55, "rgba(244,206,221,0.95)");
  r.addColorStop(1, "rgba(238,190,208,0)");
  g.fillStyle = r;
  g.beginPath();
  g.arc(0, 0, s * 0.32, 0, Math.PI * 2);
  g.fill();
});
petalTex.encoding = THREE.sRGBEncoding;

// Vertical bark striations with random cracks.
export const barkTex = canvasTex(256, function (g, s) {
  g.fillStyle = "#463327";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 170; i++) {
    const x = Math.random() * s;
    g.strokeStyle = Math.random() < 0.5
      ? "rgba(26,17,11," + (0.1 + Math.random() * 0.26) + ")"
      : "rgba(99,77,58," + (0.08 + Math.random() * 0.2) + ")";
    g.lineWidth = 1 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(x, 0);
    let y = 0;
    while (y < s) {
      y += 8 + Math.random() * 14;
      g.lineTo(x + (Math.random() - 0.5) * 7, y);
    }
    g.stroke();
  }
  for (let j = 0; j < 700; j++) {
    g.fillStyle = "rgba(0,0,0," + Math.random() * 0.12 + ")";
    g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
  }
});
barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
barkTex.encoding = THREE.sRGBEncoding;

// Dark radial gradient ground texture.
export const groundTex = canvasTex(512, function (g, s) {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "#10141c");
  r.addColorStop(0.45, "#0a0d13");
  r.addColorStop(1, "#050609");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});
groundTex.encoding = THREE.sRGBEncoding;

// Soft circular contact shadow.
export const shadowTex = canvasTex(256, function (g, s) {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(0,0,0,0.62)");
  r.addColorStop(0.6, "rgba(0,0,0,0.25)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

// Materials and shared geometries.
export const barkMat = new THREE.MeshStandardMaterial({
  map: barkTex,
  bumpMap: barkTex,
  bumpScale: 0.012,
  roughness: 0.92,
  metalness: 0,
});
export const blossomMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0,
  emissive: SC(2101274),
  emissiveIntensity: 0.55,
});
export const mossMatA = new THREE.MeshStandardMaterial({
  color: SC(2240541),
  roughness: 1,
});
export const mossMatB = new THREE.MeshStandardMaterial({
  color: SC(3096103),
  roughness: 1,
});
export const MOSS_GEO = new THREE.SphereGeometry(1, 8, 6);

// Pad palette — soft pinks toward white as pads rise.
export const padPalette = [
  SC(16245738),
  SC(15780825),
  SC(15119302),
  SC(16512243),
  SC(15914974),
];
export const WHITE = new THREE.Color(16777215);
