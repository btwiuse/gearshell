// PrismScene drag, resize, camera and per-frame loop methods.
//
// Composed into PrismScene.prototype by `class.js`.

import { clamp, clamp01, SPD } from "./utils.js";

const TAU = Math.PI * 2;
const THIRD = TAU / 3;

export const PrismFrameMethods = {
  // Drag release: convert velocity trail into eased angular velocity.
  endDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.velTrail.length > 1) {
      const a = this.velTrail[0];
      const b = this.velTrail[this.velTrail.length - 1];
      const delta = Math.max((b.t - a.t) / 1e3, 1 / 240);
      this.velZ = clamp((b.z - a.z) / delta, -6, 6);
      this.velY = clamp((b.y - a.y) / delta, -2, 2);
      this.velX = clamp((b.x - a.x) / delta, -2, 2);
    }
    this.velTrail = [];
    this.lastInteract = this.tGlobal;
    document.body.classList.remove("grabbing");
  },

  // Match camera aspect to viewport; widen view bounds for ultra-wide.
  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camZ = Math.min(9.6 / Math.min(1, aspect / 1.15), 15.5);
    this.camera.updateProjectionMatrix();
    const halfH = Math.tan((this.camera.fov / 2) * Math.PI / 180) * this.camZ;
    this.viewX.right = halfH * aspect + 1.2;
    this.viewX.left = -this.viewX.right;
  },

  // Inertia + auto-rotation + camera-orbit motion.
  updateDragMotion(dt, tA) {
    if (!this.dragging && (this.velZ || this.velY || this.velX)) {
      this.userZ += this.velZ * dt;
      this.userY = clamp(this.userY + this.velY * dt, -0.5, 0.5);
      this.userX = clamp(this.userX + this.velX * dt, -0.3, 0.3);
      this.velZ *= Math.exp(-dt * 1.5);
      this.velY *= Math.exp(-dt * 3.5);
      this.velX *= Math.exp(-dt * 3.5);
      if (Math.abs(this.velZ) > 0.05) {
        this.lastInteract = this.tGlobal;
      } else {
        if (Math.abs(this.velZ) < 0.03) this.velZ = 0;
        if (Math.abs(this.velY) < 0.02) this.velY = 0;
        if (Math.abs(this.velX) < 0.02) this.velX = 0;
      }
    }
    const idle = this.tGlobal - this.lastInteract;
    const ampTarget = this.dragging ? 0 : idle > 1.6 ? 1 : 0;
    this.autoAmp += (ampTarget - this.autoAmp) * (1 - Math.exp(-dt * 1.4));
    if (!this.dragging && idle > 1.6) {
      const dec = Math.exp(-dt * 0.22);
      this.userX *= dec;
      this.userY *= dec;
      const home = Math.round(this.userZ / THIRD) * THIRD;
      this.userZ = home + (this.userZ - home) * dec;
    }
    const amp = this.autoAmp;
    return {
      rotZ: (Math.sin(tA * 0.31) * 0.15 + Math.sin(tA * 0.127) * 0.06) * amp +
        this.userZ,
      rotY: Math.sin(tA * 0.21) * 0.32 * amp + this.userY,
      rotX: (Math.sin(tA * 0.165) * 0.09 + 0.02) * amp + this.userX,
      bob: Math.sin(tA * 0.5) * 0.055 * amp,
    };
  },

  // Apply prism rotation, position apex/corner sprites, render.
  updatePrismAndCamera(dt, tA, lamp, rotX, rotY, rotZ, bob) {
    this.prism.rotation.set(rotX, rotY, rotZ);
    this.prism.position.y = bob;
    this.prism.updateMatrixWorld();
    this.APEX_W.copy(this.APEX_LOCAL).applyMatrix4(this.prism.matrixWorld);
    this.apexDot.position.copy(this.APEX_W);
    this.apexDot.material.opacity = 0.9 * lamp;
    for (let i = 0; i < 2; i++) {
      this.APEX_W.copy(this.CORNER_LOCAL[i]).applyMatrix4(
        this.prism.matrixWorld,
      );
      this.cornerDots[i].position.copy(this.APEX_W);
      this.cornerDots[i].material.opacity = lamp *
        (0.35 + 0.25 * Math.sin(tA * 2 + i * 2.1));
    }
    this.glassMat.uniforms.uTime.value = tA;
    this.glassMat.uniforms.uCam.value.copy(this.camera.position);
    this.edgeMat.opacity = 0.45 + 0.08 * Math.sin(tA * 1.3) +
      this.trapGlow * 0.3;
    if (!this.dragging) {
      this.parTX = this.mouseNX * 0.38;
      this.parTY = -this.mouseNY * 0.22;
    }
    const ease = 1 - Math.exp(-dt * 3);
    this.parX += (this.parTX - this.parX) * ease;
    this.parY += (this.parTY - this.parY) * ease;
    this.camera.position.set(
      this.parX + Math.sin(tA * 0.13) * 0.15,
      0.35 + this.parY + Math.cos(tA * 0.1) * 0.08,
      this.camZ,
    );
    this.camera.lookAt(0, 0.05, 0);
    this.renderer.render(this.scene, this.camera);
  },

  // Per-frame entry point: drive drag motion, optics, render, ready flags.
  animate() {
    if (!window.App.landingActive) return;
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.tGlobal += dt;
    const tA = this.tGlobal * SPD;
    const { rotX, rotY, rotZ, bob } = this.updateDragMotion(dt, tA);
    const lamp = this.updateOptics(tA, dt, rotZ, bob);
    if (!this.spectrumSeen && this.exitGlow.material.opacity > 0.03) {
      this.spectrumSeen = true;
      document.body.classList.add("spectrum");
    }
    this.updatePrismAndCamera(dt, tA, lamp, rotX, rotY, rotZ, bob);
    if (!this.ready) {
      this.ready = true;
      document.body.classList.add("ready");
      setTimeout(() => document.body.classList.add("spectrum"), 7000);
    }
  },
};

// Re-export clamp01 for callers that need it from this module.
export { clamp01 };
