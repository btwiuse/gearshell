// Blossom packing: positions + colors for a cloud of micro-meshes per pad.

import { blossomMat, MOSS_GEO, padPalette, WHITE } from "./assets.js";

let blossomTpl = null;

function ensureBlossomTpl() {
  if (blossomTpl) return blossomTpl;
  const tpl = new THREE.IcosahedronGeometry(1, 0);
  blossomTpl = tpl.index ? tpl.toNonIndexed() : tpl;
  return blossomTpl;
}

// Pick one blossom's placement on an ellipsoid (rx × ry).
function placeBlossom(rx, ry, rng) {
  const theta = rng() * Math.PI * 2;
  const u = rng() * 2 - 1;
  const r = Math.sqrt(1 - u * u);
  const radiusScale = Math.pow(rng(), 0.34);
  const px = r * Math.cos(theta) * rx * radiusScale;
  const py = u * ry * radiusScale;
  const pz = r * Math.sin(theta) * rx * radiusScale;
  const scale = (0.085 + rng() * 0.085 + rx * 0.05) * 0.92;
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI),
  );
  const color = padPalette[(rng() * padPalette.length) | 0].clone();
  color.lerp(WHITE, Math.max(0, py / ry) * 0.45 + rng() * 0.12);
  return { px, py, pz, scale, quat, color };
}

// Build a single merged BufferGeometry containing `count` blossoms.
export function makeBlossoms(rx, ry, count, rng) {
  const tpl = ensureBlossomTpl();
  const srcPos = tpl.attributes.position.array;
  const srcNorm = tpl.attributes.normal.array;
  const vertexCount = srcPos.length / 3;
  const positions = new Float32Array(count * vertexCount * 3);
  const normals = new Float32Array(count * vertexCount * 3);
  const colors = new Float32Array(count * vertexCount * 3);
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const p = placeBlossom(rx, ry, rng);
    for (let v = 0; v < vertexCount; v++) {
      vertex
        .set(srcPos[v * 3], srcPos[v * 3 + 1] * 0.82, srcPos[v * 3 + 2])
        .multiplyScalar(p.scale)
        .applyQuaternion(p.quat);
      positions[offset] = vertex.x + p.px;
      positions[offset + 1] = vertex.y + p.py;
      positions[offset + 2] = vertex.z + p.pz;
      normal
        .set(srcNorm[v * 3], srcNorm[v * 3 + 1], srcNorm[v * 3 + 2])
        .applyQuaternion(p.quat);
      normals[offset] = normal.x;
      normals[offset + 1] = normal.y;
      normals[offset + 2] = normal.z;
      colors[offset] = p.color.r;
      colors[offset + 1] = p.color.g;
      colors[offset + 2] = p.color.b;
      offset += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

export { blossomMat, MOSS_GEO };
