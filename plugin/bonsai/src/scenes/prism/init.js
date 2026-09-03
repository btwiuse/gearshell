// PrismScene initialisation methods — wireframe renderer, geometry, beams,
// sheets, sprites, traces, and event listeners.
//
// Composed into PrismScene.prototype by `class.js`.

import {
  COL_COUNT,
  DEPTH,
  EXIT_ROWS,
  INC_N,
  INNER_ROWS,
  PULSE_COUNT,
  PULSE_W,
  R,
  REF_N,
  RES_N,
} from "./constants.js";
import { specColor } from "./optics.js";
import { pulseHex } from "./pulse.js";
import { LOCAL_V, vecArray } from "./geometry.js";
import {
  createBeamGeometry,
  createBeamMaterial,
  createSheetGeometry,
  createSheetMaterial,
} from "./geometry.js";
import { makeTraceRec } from "./trace.js";
import { GLASS_FRAG, GLASS_VERT } from "./shaders.js";
import { makeGlowTexture, makeWordTexture } from "./textures.js";

const WHITE = 0xffffff;
const ENTRY_GLOW = 0xddffff;
const BACK_FACE_TINT = 0x0a0e2a;

// Returns a sprite factory bound to the scene + glow texture.
function spriteFactory(self) {
  return function (hex, scale, opacity, order) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: self.glowTex,
        color: hex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    s.scale.setScalar(scale);
    s.renderOrder = order;
    self.scene.add(s);
    return s;
  };
}

function makeBeam(
  scene,
  n,
  hex,
  { width = 0.05, opacity = 1, tailFade = 0, order = 6 } = {},
) {
  const { geo, pos, tan, posAttr, tanAttr } = createBeamGeometry(n);
  const mat = createBeamMaterial(hex, width, opacity, tailFade);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  scene.add(mesh);
  const update = (pts) => {
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const a = pts[k > 0 ? k - 1 : 0];
      const b = pts[k < n - 1 ? k + 1 : n - 1];
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      let tz = b.z - a.z;
      const L = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= L;
      ty /= L;
      tz /= L;
      const o = k * 6;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      pos[o + 3] = p.x;
      pos[o + 4] = p.y;
      pos[o + 5] = p.z;
      tan[o] = tx;
      tan[o + 1] = ty;
      tan[o + 2] = tz;
      tan[o + 3] = tx;
      tan[o + 4] = ty;
      tan[o + 5] = tz;
    }
    posAttr.needsUpdate = true;
    tanAttr.needsUpdate = true;
  };
  return { mat, update };
}

function makeSheet(
  scene,
  cols,
  rows,
  { opacity, headWhite, headK, alongBase, alongK, order = 6 },
) {
  const { geo, pos, aAlpha, aRev, posAttr, aAttr, revAttr } = createSheetGeometry(cols, rows);
  const mat = createSheetMaterial({
    opacity,
    headWhite,
    headK,
    alongBase,
    alongK,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  scene.add(mesh);
  const setPoint = (k, c, x, y, z) => {
    const i = (k * cols + c) * 3;
    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = z;
  };
  const setColumnScalar = (arr, c, v) => {
    for (let k = 0; k < rows; k++) arr[k * cols + c] = v;
  };
  return {
    mat,
    cols,
    rows,
    pos,
    setPoint,
    setAlpha: (c, v) => setColumnScalar(aAlpha, c, v),
    setRev: (c, v) => setColumnScalar(aRev, c, v),
    commit() {
      posAttr.needsUpdate = aAttr.needsUpdate = revAttr.needsUpdate = true;
    },
  };
}

export const PrismInitMethods = {
  // WebGL renderer, scene, perspective camera.
  initRenderer() {
    this.canvas = document.getElementById("sceneA");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x05060d, 0);
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(DPR);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0.35, 9.6);
    this.camera.lookAt(0, 0.05, 0);
    this.camZ = 9.6;
    this.viewX = { left: -9, right: 9 };
    this.LOCAL_V = LOCAL_V;
  },

  // Glow + word textures, extruded triangular prism mesh.
  initPrismGeometry() {
    this.glowTex = makeGlowTexture();
    this.word = makeWordTexture("BONSAI 27B");
    this.TP = { z: -5, cx: 0, cy: 0.15, hw: 8.6, hh: 8.6 * this.word.aspect };
    const shape = new THREE.Shape();
    shape.moveTo(LOCAL_V[0].x, LOCAL_V[0].y);
    shape.lineTo(LOCAL_V[1].x, LOCAL_V[1].y);
    shape.lineTo(LOCAL_V[2].x, LOCAL_V[2].y);
    shape.closePath();
    this.prismGeo = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH,
      bevelEnabled: false,
    });
    this.prismGeo.translate(0, 0, -DEPTH / 2);
    this.prism = new THREE.Group();
    this.scene.add(this.prism);
    const backMesh = new THREE.Mesh(
      this.prismGeo,
      new THREE.MeshBasicMaterial({
        color: BACK_FACE_TINT,
        transparent: true,
        opacity: 0.5,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    backMesh.renderOrder = 4;
    this.prism.add(backMesh);
  },

  // Refractive glass + bright edge wireframe.
  initGlassAndEdges() {
    this.glassMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uTex: { value: this.word.texture },
        uTime: { value: 0 },
        uPlane: {
          value: new THREE.Vector4(
            this.TP.cx,
            this.TP.cy,
            this.TP.hw,
            this.TP.hh,
          ),
        },
        uPlaneZ: { value: this.TP.z },
      },
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
    });
    const glassMesh = new THREE.Mesh(this.prismGeo, this.glassMat);
    glassMesh.renderOrder = 5;
    this.prism.add(glassMesh);
    this.edgeMat = new THREE.LineBasicMaterial({
      color: WHITE,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.prismGeo),
      this.edgeMat,
    );
    edges.renderOrder = 8;
    this.prism.add(edges);
  },

  // Three beams (incoming, reflection, residual) + point buffers.
  initBeams() {
    this.INC_PTS = vecArray(INC_N);
    this.REF_PTS = vecArray(REF_N);
    this.RES_PTS = vecArray(RES_N);
    this.incoming = makeBeam(this.scene, INC_N, WHITE, {
      width: 0.06,
      opacity: 0.95,
    });
    this.reflectBeam = makeBeam(this.scene, REF_N, WHITE, {
      width: 0.04,
      opacity: 0.09,
      tailFade: 1,
    });
    this.residualBeam = makeBeam(this.scene, RES_N, WHITE, {
      width: 0.045,
      opacity: 0.1,
      tailFade: 1,
    });
    this.allBeams = [this.incoming, this.reflectBeam, this.residualBeam];
  },

  // Spectral fan sheets: one inside the prism, one extending out.
  initSheets() {
    this.exitSheet = makeSheet(this.scene, COL_COUNT, EXIT_ROWS, {
      opacity: 0.92,
      headWhite: 0.55,
      headK: 5.5,
      alongBase: 0.34,
      alongK: 1.5,
    });
    this.innerSheet = makeSheet(this.scene, COL_COUNT, INNER_ROWS, {
      opacity: 0.3,
      headWhite: 0.65,
      headK: 4,
      alongBase: 0.55,
      alongK: 0.9,
    });
  },

  // Trace records: per-column trace, central trace, and 3 entry/hit records.
  initTraceState() {
    this.TRI = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    this.TRI_C = { x: 0, y: 0 };
    this.TRACES = Array.from({ length: COL_COUNT }, makeTraceRec);
    this.CTRACE = makeTraceRec();
    this.ENTRY = { valid: false, x: 0, y: 0, nx: 0, ny: 0, edge: -1 };
    this.ENTRY_HIT = { t: 0, x: 0, y: 0, nx: 0, ny: 0, edge: -1 };
    this.WALL_HIT = { t: 0, x: 0, y: 0, nx: 0, ny: 0, edge: -1 };
    this.TDIR = { x: 0, y: 0 };
    this.SEG_LEN = new Float64Array(5);
  },

  // Sprite dots: apex, source, entry/exit glow, corner markers.
  initSprites() {
    const make = spriteFactory(this);
    this.apexDot = make(WHITE, 0.12, 0.9, 9);
    this.sourceDot = make(WHITE, 0.17, 0.95, 9);
    this.entryGlow = make(ENTRY_GLOW, 0.3, 0, 9);
    this.exitGlow = make(WHITE, 0.5, 0, 9);
    this.cornerDots = [1, 2].map(() => make(WHITE, 0.085, 0, 9));
  },

  // Light pulses travelling along the spectral fan, plus wash sprites.
  initPulses() {
    this.whitePulses = Array.from(
      { length: PULSE_COUNT },
      () => makeSprite(this.scene, this.glowTex, WHITE, 0.085, 0, 9),
    );
    this.colorPulses = PULSE_W.map((w) => {
      const hex = pulseHex(w);
      return Array.from(
        { length: PULSE_COUNT },
        () => makeSprite(this.scene, this.glowTex, hex, 0.075, 0, 9),
      );
    });
    this.washes = PULSE_W.map((w) => makeSprite(this.scene, this.glowTex, pulseHex(w), 5.5, 0, 2));
    this.SAMP = new THREE.Vector3();
    this.APEX_LOCAL = new THREE.Vector3(0, R, DEPTH / 2 + 0.02);
    this.CORNER_LOCAL = LOCAL_V.slice(1).map(
      (v) => new THREE.Vector3(v.x, v.y, DEPTH / 2 + 0.02),
    );
    this.APEX_W = new THREE.Vector3();
  },

  // Pointer/touch drag state + parallax.
  initInteractionState() {
    this.dragging = false;
    this.lastPX = 0;
    this.lastPY = 0;
    this.userX = 0;
    this.userY = 0;
    this.userZ = 0;
    this.velX = 0;
    this.velY = 0;
    this.velZ = 0;
    this.velTrail = [];
    this.autoAmp = 1;
    this.lastInteract = -10;
    this.mouseNX = 0;
    this.mouseNY = 0;
    this.parX = 0;
    this.parY = 0;
    this.parTX = 0;
    this.parTY = 0;
    this.tGlobal = 0;
  },

  // Pointer events: drag the prism, ease velocities on release.
  wireInteraction() {
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.velX = this.velY = this.velZ = 0;
      this.velTrail = [
        { t: performance.now(), x: this.userX, y: this.userY, z: this.userZ },
      ];
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      this.lastInteract = this.tGlobal;
      document.body.classList.add("grabbing");
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {}
    });
    window.addEventListener("pointermove", (e) => {
      if (!window.App.landingActive) return;
      this.mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPX;
      const dy = e.clientY - this.lastPY;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      this.userZ += dx * 0.006;
      this.userY = Math.max(-0.5, Math.min(0.5, this.userY + dx * 0.0028));
      this.userX = Math.max(-0.3, Math.min(0.3, this.userX + dy * 0.0035));
      const nowMs = performance.now();
      this.velTrail.push({
        t: nowMs,
        x: this.userX,
        y: this.userY,
        z: this.userZ,
      });
      while (this.velTrail.length > 2 && nowMs - this.velTrail[0].t > 120) {
        this.velTrail.shift();
      }
      this.lastInteract = this.tGlobal;
    });
    window.addEventListener("pointerup", () => this.endDrag());
    window.addEventListener("pointercancel", () => this.endDrag());
  },

  // Resize: keep camera aspect and view bounds in sync.
  wireResize() {
    window.addEventListener("resize", () => this.onResize());
    this.onResize();
  },

  // Per-column eased opacity (colAlpha) and exit-front timing (T_OUT).
  initOpticsState() {
    this.colAlpha = new Float32Array(COL_COUNT);
    this.entryAlpha = 0;
    this.trapGlow = 0;
    this.lastAC = -0.06;
    this.T_OUT = new Float32Array(COL_COUNT);
  },

  // Three.js Clock + first-frame readiness flags.
  initTiming() {
    this.clock = new THREE.Clock();
    this.ready = false;
    this.spectrumSeen = false;
  },

  // Kick the per-frame loop.
  startLoop() {
    this.animate();
  },
};

function makeSprite(scene, glowTex, hex, scale, opacity, order) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: hex,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );
  s.scale.setScalar(scale);
  s.renderOrder = order;
  scene.add(s);
  return s;
}
