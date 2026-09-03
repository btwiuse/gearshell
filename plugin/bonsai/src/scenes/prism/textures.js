// Procedural canvas textures used by prism sprites and the word plane.
// Depends on THREE being available at runtime.

export function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.22, "rgba(255,255,255,.85)");
  grd.addColorStop(0.55, "rgba(255,255,255,.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

// Word texture used both by the prism glass and the background scene.
// Resizes a single-line title to fit a fixed canvas size, centered.
export function makeWordTexture(word) {
  const W = 2048;
  const H = 400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.textBaseline = "middle";
  const font = (px) =>
    `700 ${px}px 'Inter','SF Pro Display',-apple-system,'Segoe UI',Roboto,` +
    `'Helvetica Neue',Arial,sans-serif`;
  const measure = (px, sp) => {
    g.font = font(px);
    let total = -sp;
    for (const ch of word) total += g.measureText(ch).width + sp;
    return total;
  };
  let px = 250;
  let sp = 70;
  const total0 = measure(px, sp);
  const fit = Math.min(1, (W - 120) / total0);
  px *= fit;
  sp *= fit;
  let x = (W - measure(px, sp)) / 2;
  for (const ch of word) {
    g.fillText(ch, x, H / 2 + 10 * fit);
    x += g.measureText(ch).width + sp;
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return { texture: t, aspect: H / W };
}
