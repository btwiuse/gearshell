// TreeBuilder — procedural bonsai construction.
//
// Builds roots → trunk → branches → twigs → pads, then schedules each part
// with a (t0, t1) growth window so the GardenScene animation can reveal it
// over time. Uses a seeded RNG so the same seed always produces the same tree.

import { clamp, easeOutBack, easeOutCubic, lerp, mulberry32, TAU, UP } from "./utils.js";
import {
  barkMat,
  blossomMat,
  glowTex,
  MOSS_GEO,
  mossMatA,
  mossMatB,
  padPalette,
  WHITE,
} from "./assets.js";
import { makeBlossoms } from "./blossom.js";

// Per-depth growth duration + segment count.
const DUR = [0.3, 0.13, 0.09, 0.07];
const NSEG = [9, 6, 5, 4];

export class TreeBuilder {
  constructor(seed) {
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    this.segs = [];
    this.pads = [];
    this.bloomers = [];
    this.joints = [];
    this.leanAngle = this.R(0, TAU);
    this.leanVec = new THREE.Vector3(
      Math.cos(this.leanAngle),
      0,
      Math.sin(this.leanAngle) * 0.6,
    ).normalize();
  }

  // Uniform in [a, b).
  R(a, b) {
    return a + (b - a) * this.rng();
  }

  // Add a single tapered cylinder segment from p0 to p1.
  addSeg(p0, p1, r0, r1, t0, t1) {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.normalize();
    const geo = new THREE.CylinderGeometry(
      Math.max(r1, 0.004),
      Math.max(r0, 0.005),
      len,
      8,
      1,
    );
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, barkMat);
    m.position.copy(p0);
    m.quaternion.setFromUnitVectors(UP, dir);
    m.castShadow = true;
    m.visible = false;
    this.group.add(m);
    this.segs.push({ mesh: m, t0, t1 });
  }

  // Add a moss-joint sphere at the branch attachment point.
  addJoint(p, r, t) {
    const m = new THREE.Mesh(MOSS_GEO, barkMat);
    m.position.copy(p);
    m.castShadow = true;
    m.visible = false;
    this.group.add(m);
    this.joints.push({ mesh: m, r, t });
  }

  // Per-segment steering force — trunk curves outward, branches curve up.
  steerForSegment(depth, f, phase, bendMag, leanVec, outward) {
    const steer = new THREE.Vector3();
    if (depth === 0) {
      const sway = (Math.sin(f * Math.PI * 1.9 + phase) * 0.8 +
        Math.sin(f * Math.PI * 0.9) * 0.5) *
        bendMag;
      steer.addScaledVector(leanVec, sway * 0.75);
      steer.y = 0.85;
    } else {
      steer.y = f < 0.55 ? -0.42 : -0.42 + ((f - 0.55) / 0.45) * 1.35;
      steer.addScaledVector(outward, 0.6);
    }
    return steer;
  }

  // Build a polyline of n points along a curved limb.
  growSegments(n, len, depth, phase, bendMag, point, dir) {
    const pts = [point.clone()];
    const outward = dir.clone();
    outward.y = 0;
    if (outward.lengthSq() < 0.001) {
      outward.set(
        Math.cos(this.leanAngle + Math.PI),
        0,
        Math.sin(this.leanAngle + Math.PI),
      );
    }
    outward.normalize();
    let d = dir;
    let p = point;
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / n;
      d.addScaledVector(
        this.steerForSegment(depth, f, phase, bendMag, this.leanVec, outward),
        1.7 / n,
      );
      d.x += this.R(-1, 1) * 0.09;
      d.y += this.R(-1, 1) * 0.05;
      d.z += this.R(-1, 1) * 0.09;
      d.normalize();
      const segLen = (len / n) * this.R(0.88, 1.12);
      const next = p.clone().addScaledVector(d, segLen);
      if (next.y < 0.75) {
        next.y = 0.75 + (0.75 - next.y) * 0.25;
        d.copy(next).sub(p).normalize();
      }
      pts.push(next.clone());
      p = next;
    }
    return pts;
  }

  // Grow one limb at `pos` heading `direction`, return its metadata.
  grow(pos, direction, len, rad, depth, t0) {
    const n = NSEG[depth];
    const dur = DUR[depth] * this.R(0.9, 1.12);
    const endRad = depth === 0 ? rad * 0.4 : Math.max(rad * 0.28, 0.011);
    const phase = this.R(0, TAU);
    const bendMag = this.R(0.95, 1.35);
    const dir = direction.clone().normalize();
    const pts = this.growSegments(
      n,
      len,
      depth,
      phase,
      bendMag,
      pos.clone(),
      dir,
    );
    const radiusAt = (f) => rad + (endRad - rad) * Math.pow(f, 0.85);
    for (let j = 1; j < n; j++) {
      const jointRadius = radiusAt(j / n);
      if (jointRadius >= 0.026) {
        this.addJoint(pts[j], jointRadius, t0 + dur * (j / n));
      }
    }
    for (let k = 0; k < n; k++) {
      this.addSeg(
        pts[k],
        pts[k + 1],
        radiusAt(k / n),
        radiusAt((k + 1) / n),
        t0 + dur * (k / n),
        t0 + dur * ((k + 1) / n),
      );
    }
    return {
      pts,
      radiusAt,
      n,
      dirEnd: dir.clone(),
      timeEnd: t0 + dur,
      timeAt: (f) => t0 + dur * f,
    };
  }

  // Add a pad (leaf cluster + sprite glow) at `pos`.
  addPad(pos, rx, tStart) {
    const ry = rx * this.R(0.42, 0.55);
    const count = Math.floor(26 + rx * 62);
    const geometry = makeBlossoms(rx, ry, count, this.rng);
    const mesh = new THREE.Mesh(geometry, blossomMat);
    mesh.castShadow = true;
    const padGroup = new THREE.Group();
    padGroup.position.copy(pos);
    padGroup.add(mesh);
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: SC(16767462),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(rx * 4.6, rx * 3.4, 1);
    padGroup.add(sprite);
    padGroup.scale.setScalar(1e-4);
    padGroup.visible = false;
    this.group.add(padGroup);
    this.pads.push({
      group: padGroup,
      spriteMaterial: spriteMat,
      base: pos.clone(),
      rx,
      ready: Math.min(tStart, 0.86),
      t0: 0.9,
      t1: 0.99,
      phase: this.R(0, TAU),
      growth: 0,
      done: false,
      popTime: 0,
      swayX: 0,
      swayZ: 0,
    });
  }

  // Pick a position near the tip of a grown limb for a pad.
  padPos(info) {
    return info.pts[info.n].clone().add(
      new THREE.Vector3(
        this.R(-1, 1) * 0.05,
        0.1 + this.R(0, 0.06),
        this.R(-1, 1) * 0.05,
      ),
    );
  }

  // Dispatch to growFork / growTwig / addPad based on depth.
  limb(pos, dir, len, rad, depth, t0) {
    const info = this.grow(pos, dir, len, Math.max(rad, 0.02), depth, t0);
    if (depth === 1) {
      this.growFork(info, len);
    } else if (depth === 2) {
      this.growTwig(info, len);
    } else if (depth === 3) {
      this.addPad(this.padPos(info), this.R(0.36, 0.5), info.timeEnd);
    }
    return info;
  }

  // Branch into two twigs from the tip of a primary branch.
  growFork(info, len) {
    const forkFrac = this.R(0.45, 0.7);
    const idx = Math.max(1, Math.round(forkFrac * info.n));
    const midDir = info.pts[idx]
      .clone()
      .sub(info.pts[idx - 1])
      .normalize()
      .applyAxisAngle(UP, this.R(0.5, 0.95) * (this.rng() < 0.5 ? -1 : 1));
    midDir.y = this.R(-0.05, 0.25);
    this.limb(
      info.pts[idx],
      midDir.normalize(),
      len * this.R(0.5, 0.65),
      info.radiusAt(idx / info.n) * 0.75,
      2,
      info.timeAt(idx / info.n),
    );
    for (let k = 0; k < 2; k++) {
      const forkDir = info.dirEnd
        .clone()
        .applyAxisAngle(UP, (k ? -1 : 1) * this.R(0.35, 0.75));
      forkDir.y += this.R(0.05, 0.35);
      forkDir.normalize();
      this.limb(
        info.pts[info.n],
        forkDir,
        len * this.R(0.45, 0.6),
        info.radiusAt(1) * 0.9,
        2,
        info.timeEnd,
      );
    }
  }

  // Either spawn a twig limb + optional pad, or a large pad directly.
  growTwig(info, len) {
    if (this.rng() < 0.62) {
      const twigDir = info.dirEnd
        .clone()
        .applyAxisAngle(UP, this.R(-0.6, 0.6));
      twigDir.y += this.R(0.1, 0.4);
      twigDir.normalize();
      this.limb(
        info.pts[info.n],
        twigDir,
        len * this.R(0.5, 0.65),
        info.radiusAt(1) * 0.9,
        3,
        info.timeEnd,
      );
      if (this.rng() < 0.5) {
        this.addPad(this.padPos(info), this.R(0.42, 0.6), info.timeEnd);
      }
    } else {
      this.addPad(this.padPos(info), this.R(0.55, 0.78), info.timeEnd);
    }
  }

  build() {
    this.buildRoots();
    this.buildMoss();
    const trunk = this.grow(
      new THREE.Vector3(0, 0.55, 0),
      this.leanVec.clone().multiplyScalar(0.45).add(UP).normalize(),
      this.R(2.45, 2.85),
      this.R(0.15, 0.185),
      0,
      0.02,
    );
    this.attachBranches(trunk);
    this.buildCanopy(trunk);
    this.schedulePadBloom();
    return {
      group: this.group,
      segs: this.segs,
      pads: this.pads,
      bloomers: this.bloomers,
      joints: this.joints,
      canopy: this.canopyCenter(),
    };
  }

  buildRoots() {
    const base = new THREE.Vector3(0, 0.55, 0);
    for (let i = 0; i < 6; i++) {
      const rootAngle = (i / 6) * TAU + this.R(-0.3, 0.3);
      const rootDir = new THREE.Vector3(
        Math.cos(rootAngle),
        0,
        Math.sin(rootAngle),
      );
      const rootP0 = base.clone().addScaledVector(rootDir, 0.04);
      rootP0.y = 0.6;
      const rootP1 = base
        .clone()
        .addScaledVector(rootDir, this.R(0.24, 0.34));
      rootP1.y = 0.53;
      this.addSeg(
        rootP0,
        rootP1,
        0.16 * this.R(0.5, 0.7),
        0.012,
        0.02 + i * 0.008,
        0.1 + i * 0.008,
      );
    }
  }

  buildMoss() {
    for (let j = 0; j < 9; j++) {
      const mossRadius = this.R(0.1, 0.62);
      const mossAngle = this.R(0, TAU);
      const moss = new THREE.Mesh(MOSS_GEO, j % 3 ? mossMatA : mossMatB);
      moss.position.set(
        Math.cos(mossAngle) * mossRadius,
        0.615 - mossRadius * 0.09,
        Math.sin(mossAngle) * mossRadius,
      );
      const mossScale = this.R(0.08, 0.17);
      moss.castShadow = true;
      moss.visible = false;
      this.group.add(moss);
      this.bloomers.push({
        node: moss,
        scale: new THREE.Vector3(
          mossScale,
          mossScale * 0.36,
          mossScale * this.R(0.8, 1.2),
        ),
        t0: 0.02 + j * 0.01,
        t1: 0.1 + j * 0.012,
      });
    }
  }

  attachBranches(trunk) {
    const attach = [0.34, 0.52, 0.7, 0.86];
    for (let i = 0; i < attach.length; i++) {
      const attachFrac = clamp(attach[i] + this.R(-0.05, 0.05), 0.3, 0.9);
      const attachIdx = Math.round(attachFrac * trunk.n);
      const yaw = this.leanAngle + Math.PI + i * 2.399 + this.R(-0.3, 0.3);
      const attachDir = new THREE.Vector3(
        Math.cos(yaw),
        this.R(-0.12, 0.12),
        Math.sin(yaw),
      ).normalize();
      const attachLen = lerp(1.85, 0.85, attachFrac) * this.R(0.85, 1.15);
      this.limb(
        trunk.pts[attachIdx],
        attachDir,
        attachLen,
        trunk.radiusAt(attachFrac) * 0.58,
        1,
        trunk.timeAt(Math.min(1, attachIdx / trunk.n)),
      );
    }
  }

  buildCanopy(trunk) {
    for (let i = 0; i < 2; i++) {
      const canopyAngle = this.R(0, TAU);
      const canopyDir = new THREE.Vector3(
        Math.cos(canopyAngle) * 0.7,
        1,
        Math.sin(canopyAngle) * 0.7,
      ).normalize();
      this.limb(
        trunk.pts[trunk.n],
        canopyDir,
        this.R(0.7, 0.95),
        trunk.radiusAt(1) * 0.85,
        2,
        trunk.timeEnd,
      );
    }
    this.addPad(
      trunk.pts[trunk.n].clone().add(new THREE.Vector3(0, 0.28, 0)),
      this.R(0.6, 0.8),
      trunk.timeEnd + 0.02,
    );
  }

  // Stagger each pad's bloom window across the post-trunk window.
  schedulePadBloom() {
    this.pads.sort((a, b) => a.base.y - b.base.y);
    const bloomStart = 0.55;
    const bloomEnd = 0.985;
    const slot = (bloomEnd - bloomStart) / Math.max(this.pads.length, 1);
    for (let i = 0; i < this.pads.length; i++) {
      const pad = this.pads[i];
      pad.t0 = Math.max(bloomStart + i * slot, pad.ready + 0.01);
      pad.t1 = Math.min(pad.t0 + Math.max(slot * 2.2, 0.045), 0.995);
    }
  }

  canopyCenter() {
    const center = new THREE.Vector3();
    if (this.pads.length) {
      for (const pad of this.pads) center.add(pad.base);
      center.multiplyScalar(1 / this.pads.length);
    } else {
      center.set(0, 2.3, 0);
    }
    return center;
  }
}

// Re-export the colorspace helper for pad sprite use.
import { SC } from "./utils.js";
