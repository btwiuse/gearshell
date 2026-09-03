// PrismScene per-column + per-frame update methods.
//
// Composed into PrismScene.prototype by `class.js`.

import {
  COL_COUNT,
  CV,
  CYCLE,
  EXIT_LEN,
  N_CENTER,
  PULSE_COL,
  PULSE_COUNT,
  SPREAD,
  T0,
  T_EMIT,
} from "./constants.js";
import { clamp01, RAY, SLOPE, wrapPI } from "./utils.js";
import { samplePts, sampleSheet } from "./geometry.js";

export const PrismUpdateMethods = {
  // Per-column update: opacity ease, exit/inner columns, sheet attrs.
  updateColumn(c, w, tA, airT, sinceEntry, ease, hasEntry, tP, aC) {
    const rec = this.TRACES[c];
    this.colAlpha[c] += ((hasEntry && rec.valid ? 1 : 0) - this.colAlpha[c]) *
      ease;
    const zOff = (w - 0.5) * 0.3;
    if (rec.valid) {
      const ai = Math.atan2(rec.dy, rec.dx);
      this.writeExitColumn(
        c,
        w,
        rec.ex,
        rec.ey,
        aC + wrapPI(ai - aC) * SPREAD,
        tA,
        zOff,
      );
      this.writeInnerColumn(rec, c, zOff);
      this.T_OUT[c] = airT + (rec.len * this.N_COL[c]) / CV;
    }
    const glassRev = rec.len > 1e-6 ? clamp01((sinceEntry * (CV / this.N_COL[c])) / rec.len) : 0;
    this.innerSheet.setAlpha(c, this.colAlpha[c]);
    this.innerSheet.setRev(c, glassRev);
    this.exitSheet.setAlpha(c, this.colAlpha[c]);
    this.exitSheet.setRev(
      c,
      clamp01((Math.max(0, tP - this.T_OUT[c]) * CV) / EXIT_LEN),
    );
  },

  // Re-trace every column, advance sheets, gather glow aggregates.
  traceColumns(tA, airT, sinceEntry, ease, hasEntry, tP, dt) {
    this.trace(N_CENTER, this.CTRACE);
    for (let c = 0; c < COL_COUNT; c++) {
      this.trace(this.N_COL[c], this.TRACES[c]);
    }
    const aC = this.centerAngle();
    let glowX = 0;
    let glowY = 0;
    let glowAlpha = 0;
    let alive = 0;
    let tFirstOut = Infinity;
    for (let c = 0; c < COL_COUNT; c++) {
      this.updateColumn(
        c,
        c / (COL_COUNT - 1),
        tA,
        airT,
        sinceEntry,
        ease,
        hasEntry,
        tP,
        aC,
      );
      const rec = this.TRACES[c];
      if (rec.valid) {
        alive++;
        if (this.T_OUT[c] < tFirstOut) tFirstOut = this.T_OUT[c];
      }
      if (rec.valid || this.colAlpha[c] > 0.05) {
        glowX += rec.ex * this.colAlpha[c];
        glowY += rec.ey * this.colAlpha[c];
        glowAlpha += this.colAlpha[c];
      }
    }
    this.exitSheet.commit();
    this.innerSheet.commit();
    const trapT = hasEntry ? (1 - alive / COL_COUNT) * 0.85 : 0;
    this.trapGlow += (trapT - this.trapGlow) * (1 - Math.exp(-3 * dt));
    this.innerSheet.mat.uniforms.uOpacity.value = 0.3 *
      (1 + this.trapGlow * 1.6);
    return { glowX, glowY, glowAlpha, tFirstOut };
  },

  // Update pulses + sprite glow + uniform timing.
  updateGlowAndPulses(tA, tP, dIn, airT, sinceEntry, lamp, hasEntry, glow) {
    for (let i = 0; i < PULSE_COL.length; i++) {
      const c = PULSE_COL[i];
      sampleSheet(this.exitSheet, c, 0.38, this.SAMP);
      this.washes[i].position.set(this.SAMP.x, this.SAMP.y, -2);
      this.washes[i].material.opacity = 0.05 *
        this.colAlpha[c] *
        clamp01((Math.max(0, tP - this.T_OUT[c]) * CV) / 5);
    }
    this.updatePulses(tP, dIn, airT, lamp, hasEntry);
    const exitFront = clamp01((Math.max(0, tP - glow.tFirstOut) * CV) / 1.5);
    if (glow.glowAlpha > 0.05) {
      this.exitGlow.position.set(
        glow.glowX / glow.glowAlpha,
        glow.glowY / glow.glowAlpha,
        0.05,
      );
    }
    this.exitGlow.scale.setScalar(0.5 * (1 + 0.12 * Math.sin(tA * 3)));
    this.exitGlow.material.opacity = 0.9 *
      clamp01(glow.glowAlpha / (COL_COUNT * 0.5)) * exitFront;
    if (hasEntry) this.entryGlow.position.set(this.ENTRY.x, this.ENTRY.y, 0.05);
    this.entryGlow.material.opacity = 0.7 * this.entryAlpha *
      clamp01((sinceEntry * CV) / 0.7);
    samplePts(this.INC_PTS, 0.03, this.SAMP);
    this.sourceDot.position.copy(this.SAMP);
    this.sourceDot.scale.setScalar(0.17 + 0.02 * Math.sin(tA * 2.1));
    this.sourceDot.material.opacity = 0.95 * lamp;
    this.incoming.mat.uniforms.uOpacity.value = 0.95 *
      lamp *
      (0.97 + 0.02 * Math.sin(tA * 9.1) + 0.015 * Math.sin(tA * 3.7));
    for (const b of this.allBeams) b.mat.uniforms.uTime.value = tA;
    this.exitSheet.mat.uniforms.uTime.value = tA;
    this.innerSheet.mat.uniforms.uTime.value = tA;
  },

  // Per-pulse sprite motion along incoming → inner → exit sheet path.
  updatePulses(tP, dIn, airT, lamp, hasEntry) {
    for (let s = 0; s < PULSE_COUNT; s++) {
      const emit = s * T_EMIT;
      const live = tP >= emit;
      const age = live ? (tP - emit) % CYCLE : 0;
      const dAir = age * CV;
      const wSpr = this.whitePulses[s];
      if (live && dAir < dIn) {
        samplePts(this.INC_PTS, dAir / dIn, this.SAMP);
        wSpr.position.copy(this.SAMP);
        wSpr.material.opacity = 0.85 * lamp;
      } else {
        wSpr.material.opacity = 0;
      }
      for (let i = 0; i < PULSE_COL.length; i++) {
        const spr = this.colorPulses[i][s];
        const c = PULSE_COL[i];
        if (
          !live ||
          !hasEntry ||
          this.colAlpha[c] < 0.05 ||
          this.TRACES[c].len < 1e-6 ||
          age <= airT
        ) {
          spr.material.opacity = 0;
          continue;
        }
        const tOut = this.T_OUT[c];
        if (age < tOut) {
          const u = ((age - airT) * (CV / this.N_COL[c])) / this.TRACES[c].len;
          sampleSheet(this.innerSheet, c, u, this.SAMP);
          spr.position.copy(this.SAMP);
          spr.material.opacity = 0.9 * this.colAlpha[c];
        } else if (age < tOut + EXIT_LEN / CV) {
          sampleSheet(
            this.exitSheet,
            c,
            ((age - tOut) * CV) / EXIT_LEN,
            this.SAMP,
          );
          spr.position.copy(this.SAMP);
          spr.material.opacity = 0.85 * this.colAlpha[c];
        } else {
          spr.material.opacity = 0;
        }
      }
    }
  },

  // Rebuild incoming/reflect/residual beams, return timing scalars.
  updateEntryBeams(tA, hasEntry, tP) {
    this.buildIncoming(tA, hasEntry);
    this.incoming.update(this.INC_PTS);
    const x0 = this.viewX.left - 0.5;
    const dIn = hasEntry
      ? Math.hypot(
        this.ENTRY.x - x0,
        this.ENTRY.y - (RAY.py + (x0 - RAY.px) * SLOPE),
      )
      : (this.viewX.right + 1 - x0) / RAY.dx;
    const airT = dIn / CV;
    const sinceEntry = Math.max(0, tP - airT);
    this.incoming.mat.uniforms.uReveal.value = clamp01((CV * tP) / dIn);
    if (hasEntry) {
      this.buildReflect();
      this.reflectBeam.update(this.REF_PTS);
      this.buildResidual();
      this.residualBeam.update(this.RES_PTS);
    }
    const pastEntry = sinceEntry * CV;
    this.reflectBeam.mat.uniforms.uOpacity.value = 0.09 * this.entryAlpha;
    this.residualBeam.mat.uniforms.uOpacity.value = 0.1 * this.entryAlpha;
    this.reflectBeam.mat.uniforms.uReveal.value = clamp01(pastEntry / 6);
    this.residualBeam.mat.uniforms.uReveal.value = clamp01(pastEntry / 12);
    return { dIn, airT, sinceEntry };
  },

  // Orchestrate one frame of prism optics. Returns lamp scalar for renderer.
  updateOptics(tA, dt, rotZ, bob) {
    this.updateTri(rotZ, bob);
    const hasEntry = this.castEntry();
    const ease = 1 - Math.exp(-6 * dt);
    this.entryAlpha += ((hasEntry ? 1 : 0) - this.entryAlpha) * ease;
    const tP = Math.max(0, tA - T0);
    const lamp = clamp01(tP / 0.3);
    const { dIn, airT, sinceEntry } = this.updateEntryBeams(tA, hasEntry, tP);
    const glow = this.traceColumns(
      tA,
      airT,
      sinceEntry,
      ease,
      hasEntry,
      tP,
      dt,
    );
    this.updateGlowAndPulses(
      tA,
      tP,
      dIn,
      airT,
      sinceEntry,
      lamp,
      hasEntry,
      glow,
    );
    return lamp;
  },
};
