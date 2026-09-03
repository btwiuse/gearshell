// GardenScene per-frame update methods.
//
// Composed into GardenScene.prototype by `class.js`.

import { clamp, easeOutBack, easeOutCubic, lerp, MOT, TAU } from "./utils.js";

const PET_N = 110;

export const GardenUpdateMethods = {
  onResize() {
    const a = window.innerWidth / window.innerHeight;
    this.camera.aspect = a;
    this.camera.fov = a < 1 ? clamp((39 / a) * 0.92, 39, 60) : 39;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  },

  // Spawn a single falling petal from a random mature pad.
  spawnPetal() {
    const cands = [];
    for (let i = 0; i < this.tree.pads.length; i++) {
      if (this.tree.pads[i].growth > 0.55) cands.push(this.tree.pads[i]);
    }
    if (!cands.length) return;
    for (let j = 0; j < PET_N; j++) {
      const petal = this.petalStates[j];
      if (petal.active) continue;
      const pad = cands[(Math.random() * cands.length) | 0];
      const theta = Math.random() * TAU;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      petal.position.set(
        pad.base.x + r * Math.cos(theta) * pad.rx * 0.9,
        pad.base.y + u * pad.rx * 0.45,
        pad.base.z + r * Math.sin(theta) * pad.rx * 0.9,
      );
      petal.rotation.set(
        Math.random() * TAU,
        Math.random() * TAU,
        Math.random() * TAU,
      );
      petal.spin.x = (Math.random() - 0.5) * 2.4;
      petal.spin.y = (Math.random() - 0.5) * 2.4;
      petal.spin.z = (Math.random() - 0.5) * 2.4;
      petal.fallSpeed = 0.05 + Math.random() * 0.1;
      petal.phase = Math.random() * TAU;
      petal.life = 0;
      petal.size = 0.75 + Math.random() * 0.5;
      petal.active = true;
      return;
    }
  },

  // Spawn new petals and integrate falling motion into InstancedMesh.
  updatePetals(dt, t) {
    const state = window.state;
    let rate = this.bloom > 0.35 ? lerp(0, 3.6, (this.bloom - 0.35) / 0.65) : 0;
    if (state.doneAt && t - this.doneAtLocal < 4) rate *= 1.8;
    this.spawnAcc += rate * dt * MOT;
    while (this.spawnAcc > 1) {
      this.spawnAcc -= 1;
      this.spawnPetal();
    }
    for (let i = 0; i < PET_N; i++) {
      const petal = this.petalStates[i];
      if (!petal.active) {
        this.dummy.position.set(0, -10, 0);
        this.dummy.scale.setScalar(1e-4);
        this.dummy.rotation.set(0, 0, 0);
      } else {
        petal.fallSpeed = Math.min(petal.fallSpeed + dt * 0.15, 0.5);
        petal.position.y -= petal.fallSpeed * dt;
        petal.position.x += (Math.sin(t * 1.2 + petal.phase) * 0.35 +
          this.wind * 0.45 +
          this.gustX * 1.1) *
          dt;
        petal.position.z += (Math.cos(t * 0.9 + petal.phase) * 0.18 + this.gustZ * 1.1) * dt;
        petal.rotation.x += petal.spin.x * dt;
        petal.rotation.y += petal.spin.y * dt;
        petal.rotation.z += petal.spin.z * dt;
        petal.life += dt;
        if (petal.position.y < 0.03) petal.active = false;
        const fade = Math.min(1, (petal.position.y - 0.02) * 4) *
          Math.min(1, petal.life * 3);
        this.dummy.position.copy(petal.position);
        this.dummy.rotation.copy(petal.rotation);
        this.dummy.scale.setScalar(Math.max(petal.size * fade, 0.001));
      }
      this.dummy.updateMatrix();
      this.petals.setMatrixAt(i, this.dummy.matrix);
    }
    this.petals.instanceMatrix.needsUpdate = true;
  },

  // Reveal/hide cylinder segments by their growth time.
  updateSegments(p) {
    for (let i = 0; i < this.tree.segs.length; i++) {
      const seg = this.tree.segs[i];
      const k = (p - seg.t0) / (seg.t1 - seg.t0);
      if (k <= 0) {
        seg.mesh.visible = false;
        continue;
      }
      seg.mesh.visible = true;
      const clamped = Math.min(k, 1);
      const timeK = clamp((p - seg.t0) / (0.985 - seg.t0), 0, 1);
      const thickness = 0.34 + 0.66 * easeOutCubic(timeK);
      seg.mesh.scale.set(thickness, Math.max(clamped, 0.001), thickness);
    }
  },

  // Reveal/hide moss-joint spheres by their growth time.
  updateJoints(p) {
    for (let i = 0; i < this.tree.joints.length; i++) {
      const joint = this.tree.joints[i];
      if (p <= joint.t) {
        joint.mesh.visible = false;
        continue;
      }
      joint.mesh.visible = true;
      const jointK = clamp((p - joint.t) / (0.985 - joint.t), 0, 1);
      joint.mesh.scale.setScalar(
        joint.r * (0.34 + 0.66 * easeOutCubic(jointK)),
      );
    }
  },

  // Reveal/hide moss blommer spheres with back-eased overshoot.
  updateBloomers(p) {
    for (let i = 0; i < this.tree.bloomers.length; i++) {
      const bloomer = this.tree.bloomers[i];
      const k = clamp((p - bloomer.t0) / (bloomer.t1 - bloomer.t0), 0, 1);
      if (k <= 0) {
        bloomer.node.visible = false;
        continue;
      }
      bloomer.node.visible = true;
      bloomer.node.scale
        .copy(bloomer.scale)
        .multiplyScalar(Math.max(easeOutBack(k), 1e-4));
    }
  },

  // Walk all growth arrays; record average pad growth as this.bloom.
  updateGrowth(p) {
    this.updateSegments(p);
    this.updateJoints(p);
    this.updateBloomers(p);
    let sum = 0;
    for (let i = 0; i < this.tree.pads.length; i++) {
      const pad = this.tree.pads[i];
      const k = clamp((p - pad.t0) / (pad.t1 - pad.t0), 0, 1);
      pad.growth = k;
      sum += k;
      if (k <= 0) {
        pad.group.visible = false;
        continue;
      }
      pad.group.visible = true;
      pad.group.scale.setScalar(Math.max(easeOutBack(k), 1e-4));
    }
    this.bloom = this.tree.pads.length ? sum / this.tree.pads.length : 0;
  },

  // Per-frame pad pop + canopy sway + trunk tilt from wind/gust/shake.
  updatePadsAndMotion(dt, t, pulse) {
    this.canopyLight.intensity = this.bloom * 0.7 + pulse * 0.5;
    for (let i = 0; i < this.tree.pads.length; i++) {
      const pad = this.tree.pads[i];
      if (pad.growth >= 0.999) {
        if (!pad.done) {
          pad.done = true;
          pad.popTime = t;
        }
      } else {
        pad.done = false;
        pad.popTime = 0;
      }
      const pop = pad.popTime ? Math.exp(-(t - pad.popTime) * 3.5) * 0.32 : 0;
      pad.spriteMaterial.opacity = (0.17 * pad.growth + pop) *
        (1 + pulse * 0.8);
      if (pad.growth > 0) {
        const lag = Math.min(1, dt * (2.2 + (pad.phase % 1.7)));
        pad.swayX += (this.leanX - pad.swayX) * lag;
        pad.swayZ += (this.leanZ - pad.swayZ) * lag;
        const jig = Math.sin(t * 13 + pad.phase * 3) * this.shakeAmp;
        pad.group.position.x = pad.base.x + pad.swayX * 0.16 + jig * 0.06;
        pad.group.position.z = pad.base.z + pad.swayZ * 0.16 + jig * 0.03;
        pad.group.position.y = pad.base.y +
          Math.sin(t * 0.7 + pad.phase) * 0.02 * pad.growth * MOT +
          Math.abs(jig) * 0.05;
      }
    }
    const decay = Math.exp(-dt * 2);
    this.gustX *= decay;
    this.gustZ *= decay;
    this.leanX += (this.gustX - this.leanX) * Math.min(1, dt * 4.5);
    this.leanZ += (this.gustZ - this.leanZ) * Math.min(1, dt * 4.5);
    this.shakeAmp *= Math.exp(-dt * 2.6);
    const wobble = Math.sin(t * 13 + this.shakeSeed) * this.shakeAmp;
    const gust = Math.max(0, this.wind);
    this.tree.group.rotation.z = Math.sin(t * 0.6) * 0.005 * (0.6 + 0.4 * gust) * MOT -
      this.leanX * 0.055 +
      wobble * 0.02;
    this.tree.group.rotation.x = Math.sin(t * 0.43 + 1) * 0.004 * MOT +
      this.leanZ * 0.055 +
      wobble * 0.012;
  },

  // Slow camera orbit (or fixed via ?az=) with intro pull-in.
  updateCamera(t, introK) {
    let ang;
    let dist;
    let camY;
    if (window.AZ_FIX !== null) {
      ang = window.AZ_FIX;
      dist = 7.9;
      camY = 2.05;
    } else {
      ang = t * (TAU / 80) * MOT + Math.sin(t * 0.11) * 0.05;
      dist = 7.9 + Math.sin(t * 0.05 + 1.3) * 0.5 * MOT + (1 - introK) * 1.6;
      camY = 2.05 + Math.sin(t * 0.07) * 0.28 * MOT - (1 - introK) * 0.35;
    }
    this.camAngCur = ang;
    this.camera.position.set(
      Math.sin(ang) * dist,
      camY,
      Math.cos(ang) * dist,
    );
    this.camera.lookAt(0, 1.62, 0);
  },

  // Frame loop: wind, progress, done pulse, pads, petals, camera, DOM.
  animate() {
    if (document.body.classList.contains("stage-chat")) return;
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const t = this.elapsed;
    const nowS = performance.now() / 1e3;
    this.wind = Math.sin(t * 0.31) * 0.5 + Math.sin(t * 0.13 + 2) * 0.5;
    const progress = window.stepProgress(dt, nowS);
    if (window.state.doneAt && this.doneAtLocal < 0) this.doneAtLocal = t;
    this.updateGrowth(progress);
    let pulse = 0;
    if (this.doneAtLocal >= 0) {
      const cp = t - this.doneAtLocal;
      if (cp < 3.2) pulse = Math.sin(Math.min(cp / 3.2, 1) * Math.PI) * 0.7;
    }
    this.updatePadsAndMotion(dt, t, pulse);
    this.updatePetals(dt, t);
    this.updateCamera(t, easeOutCubic(Math.min(1, this.elapsed / 3.5)));
    this.renderer.render(this.scene, this.camera);
    window.updateDom(nowS);
  },
};
