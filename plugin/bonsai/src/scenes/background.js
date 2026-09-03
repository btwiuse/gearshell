// Entry for the always-on background scene (sceneBG canvas).
//
// Loaded as an ES module from buildless.html. Boots when THREE is available.
// Renderer-creation failures are swallowed so the rest of the page still works.

function makeGlowTexture() {
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
  const texture = new THREE.CanvasTexture(c);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function makeWordTexture(word) {
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

class BackgroundScene {
  constructor() {
    const canvas = document.getElementById("sceneBG");
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }
    this.renderer.setClearColor(329225, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.spd = window.REDUCED ? 0.35 : 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camZ = 9.6;
    this.addWordPlane();
    this.addGrid();
    this.addBacklight();
    this.addDust();
    window.addEventListener("resize", () => this.onResize());
    this.onResize();
    this.clock = new THREE.Clock();
    this.t = 0;
    this.animate();
  }

  addWordPlane() {
    const word = makeWordTexture("BONSAI 27B");
    const TP = { z: -5, cx: 0, cy: 0.15, hw: 8.6, hh: 8.6 * word.aspect };
    const textMat = new THREE.MeshBasicMaterial({
      map: word.texture,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      depthTest: false,
    });
    const textPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(TP.hw * 2, TP.hh * 2),
      textMat,
    );
    textPlane.position.set(TP.cx, TP.cy, TP.z);
    textPlane.renderOrder = 1;
    this.scene.add(textPlane);
    this.textMat = textMat;
  }

  addGrid() {
    const gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
      varying vec2 vP;
      void main(){
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
      fragmentShader: `
      varying vec2 vP;
      void main(){
        vec2 g = abs(fract(vP / 2.2) - 0.5);
        float lx = smoothstep(0.487, 0.5, g.x);
        float ly = smoothstep(0.487, 0.5, g.y);
        float line = max(lx, ly);
        float r = length(vP * vec2(1.0, 1.6));
        float vig = 1.0 - smoothstep(5.0, 20.0, r);
        float glow = exp(-r * r * 0.020) * 0.16;
        vec3 col = vec3(0.30, 0.36, 0.52) * line * 0.09 * vig
                 + vec3(0.10, 0.12, 0.20) * glow;
        gl_FragColor = vec4(col, 1.0);
      }`,
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(60, 32), gridMat);
    grid.position.set(0, 0.2, -8);
    grid.renderOrder = 0;
    this.scene.add(grid);
  }

  addBacklight() {
    const backlight = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 8359867,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    backlight.scale.setScalar(11);
    backlight.position.set(0.4, 0.3, -4);
    backlight.renderOrder = 2;
    this.scene.add(backlight);
    this.backlight = backlight;
  }

  addDust() {
    const DUST_N = 160;
    const dustGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST_N * 3);
    const seed = new Float32Array(DUST_N);
    for (let i = 0; i < DUST_N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 11;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * 6;
      pos[i * 3 + 2] = -6 + Math.random() * 8;
      seed[i] = Math.random();
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: `
      attribute float aSeed;
      uniform float uTime; uniform float uDpr;
      varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.12 + aSeed * 7.0) * 0.6;
        p.y += cos(uTime * 0.10 + aSeed * 13.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.5 + aSeed * 2.5) * (14.0 / -mv.z) * uDpr;
        vA = 0.5 + 0.5 * sin(uTime * (0.4 + aSeed * 0.7) + aSeed * 20.0);
        gl_Position = projectionMatrix * mv;
      }`,
      fragmentShader: `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vA * 0.35;
        gl_FragColor = vec4(0.75, 0.80, 0.95, a);
      }`,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    dust.renderOrder = 2;
    this.scene.add(dust);
    this.dustMat = dustMat;
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camZ = Math.min(9.6 / Math.min(1, aspect / 1.15), 15.5);
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (document.body.classList.contains("stage-chat")) return;
    requestAnimationFrame(() => this.animate());
    this.t += Math.min(this.clock.getDelta(), 0.05);
    const tA = this.t * this.spd;
    this.dustMat.uniforms.uTime.value = tA;
    this.textMat.opacity = 0.05 + 0.02 * (0.5 + 0.5 * Math.sin(tA * 0.35));
    this.backlight.material.opacity = 0.06 +
      0.02 * (0.5 + 0.5 * Math.sin(tA * 0.6));
    this.camera.position.set(
      Math.sin(tA * 0.13) * 0.15,
      0.35 + Math.cos(tA * 0.1) * 0.08,
      this.camZ,
    );
    this.camera.lookAt(0, 0.05, 0);
    this.renderer.render(this.scene, this.camera);
  }
}

if (typeof THREE !== "undefined") {
  try {
    new BackgroundScene();
  } catch {
    // Renderer creation can fail on unsupported GPUs; the page keeps working.
  }
}
