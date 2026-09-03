// PrismScene geometry + optics methods: triangle updates, ray casts,
// multi-bounce traces, sheet writers.
//
// Composed into PrismScene.prototype by `class.js`.

import { CV, EXIT_LEN } from "./constants.js";
import { clamp01, hermite as smoothEase, RAY, SLOPE, sstep } from "./utils.js";
import { cross2, reflect2, refract2 } from "./trace.js";

export const PrismTraceMethods = {
  // Update the triangle's 2D vertex positions for current rotation+bob.
  updateTri(rotZ, bob) {
    const c = Math.cos(rotZ);
    const s = Math.sin(rotZ);
    for (let i = 0; i < 3; i++) {
      const v = this.LOCAL_V[i];
      this.TRI[i].x = v.x * c - v.y * s;
      this.TRI[i].y = v.x * s + v.y * c + bob;
    }
    this.TRI_C.x = (this.TRI[0].x + this.TRI[1].x + this.TRI[2].x) / 3;
    this.TRI_C.y = (this.TRI[0].y + this.TRI[1].y + this.TRI[2].y) / 3;
  },

  // Cast ray (px,py) + (dx,dy) into the triangle, skipping edge `skip`.
  // Returns the closest intersection into `out`; or false.
  castRay(px, py, dx, dy, skip, out) {
    let best = Infinity;
    let bestEdge = -1;
    let bestX = 0;
    let bestY = 0;
    let bestNX = 0;
    let bestNY = 0;
    for (let i = 0; i < 3; i++) {
      if (i === skip) continue;
      const a = this.TRI[i];
      const b = this.TRI[(i + 1) % 3];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = cross2(dx, dy, ex, ey);
      if (Math.abs(den) < 1e-9) continue;
      const wx = a.x - px;
      const wy = a.y - py;
      const t = cross2(wx, wy, ex, ey) / den;
      const s = cross2(wx, wy, dx, dy) / den;
      if (t > 1e-4 && s >= -1e-4 && s <= 1.0001 && t < best) {
        best = t;
        bestEdge = i;
        bestX = px + dx * t;
        bestY = py + dy * t;
        let nx = ey;
        let ny = -ex;
        const L = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= L;
        ny /= L;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (nx * (mx - this.TRI_C.x) + ny * (my - this.TRI_C.y) < 0) {
          nx = -nx;
          ny = -ny;
        }
        bestNX = nx;
        bestNY = ny;
      }
    }
    if (bestEdge < 0) return false;
    out.t = best;
    out.x = bestX;
    out.y = bestY;
    out.nx = bestNX;
    out.ny = bestNY;
    out.edge = bestEdge;
    return true;
  },

  // Cast the entry ray against the triangle from off-screen.
  castEntry() {
    const sx = this.viewX.left - 2;
    const sy = RAY.py + (sx - RAY.px) * SLOPE;
    const hit = this.castRay(sx, sy, RAY.dx, RAY.dy, -1, this.ENTRY_HIT) &&
      this.ENTRY_HIT.nx * RAY.dx + this.ENTRY_HIT.ny * RAY.dy < -0.001;
    this.ENTRY.valid = hit;
    if (hit) {
      this.ENTRY.x = this.ENTRY_HIT.x;
      this.ENTRY.y = this.ENTRY_HIT.y;
      this.ENTRY.nx = this.ENTRY_HIT.nx;
      this.ENTRY.ny = this.ENTRY_HIT.ny;
      this.ENTRY.edge = this.ENTRY_HIT.edge;
    }
    return hit;
  },

  // Multi-bounce ray trace inside the prism; fills rec with the exit point.
  trace(n, rec) {
    rec.count = 0;
    rec.valid = false;
    if (!this.ENTRY.valid) return;
    if (
      !refract2(RAY.dx, RAY.dy, this.ENTRY.nx, this.ENTRY.ny, 1 / n, this.TDIR)
    ) {
      return;
    }
    rec.pts[0].x = this.ENTRY.x;
    rec.pts[0].y = this.ENTRY.y;
    rec.count = 1;
    let cx = this.ENTRY.x;
    let cy = this.ENTRY.y;
    let dx = this.TDIR.x;
    let dy = this.TDIR.y;
    let skip = this.ENTRY.edge;
    let len = 0;
    for (let b = 0; b < 3; b++) {
      if (!this.castRay(cx, cy, dx, dy, skip, this.WALL_HIT)) return;
      len += this.WALL_HIT.t;
      rec.pts[rec.count].x = this.WALL_HIT.x;
      rec.pts[rec.count].y = this.WALL_HIT.y;
      rec.count++;
      if (refract2(dx, dy, this.WALL_HIT.nx, this.WALL_HIT.ny, n, this.TDIR)) {
        rec.ex = this.WALL_HIT.x;
        rec.ey = this.WALL_HIT.y;
        rec.dx = this.TDIR.x;
        rec.dy = this.TDIR.y;
        rec.len = len;
        rec.valid = true;
        return;
      }
      reflect2(dx, dy, this.WALL_HIT.nx, this.WALL_HIT.ny, this.TDIR);
      dx = this.TDIR.x;
      dy = this.TDIR.y;
      cx = this.WALL_HIT.x;
      cy = this.WALL_HIT.y;
      skip = this.WALL_HIT.edge;
    }
  },

  // Build the incoming ray polyline, ending at the prism entry if it hits.
  buildIncoming(tA, hasEntry) {
    const x0 = this.viewX.left - 0.5;
    const y0 = RAY.py + (x0 - RAY.px) * SLOPE;
    let x1;
    let y1;
    if (hasEntry) {
      x1 = this.ENTRY.x;
      y1 = this.ENTRY.y;
    } else {
      x1 = this.viewX.right + 1;
      y1 = RAY.py + (x1 - RAY.px) * SLOPE;
    }
    for (let k = 0; k < this.INC_PTS.length; k++) {
      const u = k / (this.INC_PTS.length - 1);
      const x = x0 + (x1 - x0) * u;
      let y = y0 + (y1 - y0) * u;
      const envL = sstep(0.02, 0.18, u);
      const envR = hasEntry ? smoothEase(clamp01((x1 - x) / 3)) : sstep(0.02, 0.18, 1 - u);
      y += Math.sin((x - CV * tA) * 0.65) * 0.05 * envL * envR;
      this.INC_PTS[k].set(x, y, 0);
    }
    const last = this.INC_PTS.length - 1;
    if (hasEntry) this.INC_PTS[last].set(this.ENTRY.x, this.ENTRY.y, 0);
  },

  // Reflect off the entry surface and build the reflection beam polyline.
  buildReflect() {
    reflect2(RAY.dx, RAY.dy, this.ENTRY.nx, this.ENTRY.ny, this.TDIR);
    const L = 6;
    for (let k = 0; k < this.REF_PTS.length; k++) {
      const u = k / (this.REF_PTS.length - 1);
      this.REF_PTS[k].set(
        this.ENTRY.x + this.TDIR.x * L * u,
        this.ENTRY.y + this.TDIR.y * L * u,
        0,
      );
    }
  },

  // Build the residual beam that continues past the entry point.
  buildResidual() {
    const L = 12;
    for (let k = 0; k < this.RES_PTS.length; k++) {
      const u = k / (this.RES_PTS.length - 1);
      this.RES_PTS[k].set(
        this.ENTRY.x + RAY.dx * L * u,
        this.ENTRY.y + RAY.dy * L * u,
        0.01,
      );
    }
  },

  // Central spectral exit angle; prefers central trace when valid.
  centerAngle() {
    let aC;
    if (this.CTRACE.valid) {
      aC = Math.atan2(this.CTRACE.dy, this.CTRACE.dx);
    } else {
      let sum = 0;
      let cnt = 0;
      for (const rec of this.TRACES) {
        if (rec.valid) {
          sum += Math.atan2(rec.dy, rec.dx);
          cnt++;
        }
      }
      aC = cnt > 0 ? sum / cnt : this.lastAC;
    }
    this.lastAC = aC;
    return aC;
  },

  // Write the inner-sheet column for one trace, normalised by arc length.
  writeInnerColumn(rec, c, zOff) {
    const rows = this.innerSheet.rows;
    const cnt = rec.count;
    if (cnt < 2) return;
    let total = 0;
    for (let i = 1; i < cnt; i++) {
      const dx = rec.pts[i].x - rec.pts[i - 1].x;
      const dy = rec.pts[i].y - rec.pts[i - 1].y;
      this.SEG_LEN[i] = Math.sqrt(dx * dx + dy * dy);
      total += this.SEG_LEN[i];
    }
    if (total < 1e-6) return;
    let seg = 1;
    let acc = 0;
    for (let k = 0; k < rows; k++) {
      const target = (total * k) / (rows - 1);
      while (seg < cnt - 1 && acc + this.SEG_LEN[seg] < target) {
        acc += this.SEG_LEN[seg];
        seg++;
      }
      const u = this.SEG_LEN[seg] > 1e-9 ? (target - acc) / this.SEG_LEN[seg] : 0;
      const a = rec.pts[seg - 1];
      const b = rec.pts[seg];
      this.innerSheet.setPoint(
        k,
        c,
        a.x + (b.x - a.x) * u,
        a.y + (b.y - a.y) * u,
        zOff,
      );
    }
  },

  // Write the exit-sheet column for one trace (hermite-eased angle + sway).
  writeExitColumn(c, w, ex, ey, ang0, tA, zOff) {
    const rows = this.exitSheet.rows;
    const step = EXIT_LEN / (rows - 1);
    const angT = ang0 * (1 - 0.55 * Math.max(0, Math.min(1, Math.cos(ang0))));
    let x = ex;
    let y = ey;
    for (let k = 0; k < rows; k++) {
      const u = k / (rows - 1);
      const e = smoothEase(u) * 0.9;
      const ang = ang0 + (angT - ang0) * e;
      if (k > 0) {
        x += Math.cos(ang) * step;
        y += Math.sin(ang) * step;
      }
      const sway = Math.sin(tA * 0.8 + w * 5.4 + u * 2.4) * 0.14 * u;
      this.exitSheet.setPoint(
        k,
        c,
        x - Math.sin(ang) * sway,
        y + Math.cos(ang) * sway,
        zOff,
      );
    }
  },
};
