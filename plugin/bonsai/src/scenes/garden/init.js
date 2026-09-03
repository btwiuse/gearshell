// GardenScene initialisation methods — renderer, scene, lights, props,
// tree, petals, and event wiring.
//
// Composed into GardenScene.prototype by `class.js`.

import { clamp, lerp, MOT, SC, TAU } from "./utils.js";
import { glowTex, groundTex, petalTex, shadowTex } from "./assets.js";
import { TreeBuilder } from "./tree.js";

// Loader-provided globals; loader.js runs first as a plain script.
const SEED = window.SEED;
const FREEZE = window.FREEZE;

const PET_N = 110;

export const GardenInitMethods = {
  // Construct the renderer; fall back to flat mode if WebGL fails.
  init() {
    const canvas = document.getElementById("sceneB");
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
    } catch {
      window.App.flatMode();
      return;
    }
    this.ready = false;
    this.configureRenderer();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(329225, 0.045);
    this.camera = new THREE.PerspectiveCamera(
      39,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.gustX = 0;
    this.gustZ = 0;
    this.leanX = 0;
    this.leanZ = 0;
    this.shakeAmp = 0;
    this.shakeSeed = 0;
    this.lastPX = null;
    this.camAngCur = 0;
    this.elapsed = 0;
    this.wind = 0;
    this.doneAtLocal = -1;
    this.bloom = 0;
    this.spawnAcc = 0;
    this.initLights();
    this.initProps();
    this.initTree();
    this.initPetals();
    this.wireEvents();
    this.onResize();
    this.clock = new THREE.Clock();
    this.camera.position.set(0, 1.7, 9.5);
    this.camera.lookAt(0, 1.62, 0);
    this.renderer.render(this.scene, this.camera);
    this.ready = true;
  },

  configureRenderer() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(329225, 0);
  },

  // Three-point lighting: hemi + moon (key, with shadows) + fill + ember.
  initLights() {
    const hemi = new THREE.HemisphereLight(3556700, 1053723, 0.95);
    this.scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(14083327, 1);
    moonLight.position.set(-5.5, 8.5, -4);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.left = -6;
    moonLight.shadow.camera.right = 6;
    moonLight.shadow.camera.top = 6;
    moonLight.shadow.camera.bottom = -6;
    moonLight.shadow.camera.near = 2;
    moonLight.shadow.camera.far = 24;
    moonLight.shadow.bias = -4e-4;
    moonLight.shadow.normalBias = 0.025;
    moonLight.target.position.set(0, 1.4, 0);
    this.scene.add(moonLight, moonLight.target);
    const fillLight = new THREE.DirectionalLight(7045022, 0.4);
    fillLight.position.set(4, 3, 6);
    this.scene.add(fillLight);
    const ember = new THREE.PointLight(16763296, 0.1, 9, 2);
    ember.position.set(-2.6, 0.9, 2.4);
    this.scene.add(ember);
    this.canopyLight = new THREE.PointLight(16752568, 0, 5.5, 2);
    this.canopyLight.position.set(0, 2.4, 0);
    this.scene.add(this.canopyLight);
  },

  initProps() {
    this.addGround();
    this.addPot();
    this.addSoilAndStone();
  },

  // Soft circular shadow used under objects that need a quick contact cue.
  contactShadow(radius, opacity, x, z) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.004, z);
    this.scene.add(mesh);
  },

  addGround() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.contactShadow(1.9, 0.55, 0, 0);
    this.contactShadow(0.55, 0.4, 2.15, 0.7);
  },

  // Lathed ceramic pot profile (12 control points).
  addPot() {
    const pot = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.62, 0),
          new THREE.Vector2(1.02, 0.02),
          new THREE.Vector2(1.13, 0.1),
          new THREE.Vector2(1.19, 0.26),
          new THREE.Vector2(1.21, 0.42),
          new THREE.Vector2(1.28, 0.47),
          new THREE.Vector2(1.3, 0.55),
          new THREE.Vector2(1.22, 0.57),
          new THREE.Vector2(1.15, 0.55),
          new THREE.Vector2(1.08, 0.5),
        ],
        56,
      ),
      new THREE.MeshPhysicalMaterial({
        color: SC(2305602),
        roughness: 0.34,
        metalness: 0.06,
        clearcoat: 0.75,
        clearcoatRoughness: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    pot.castShadow = true;
    pot.receiveShadow = true;
    this.scene.add(pot);
  },

  addSoilAndStone() {
    const soil = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12),
      new THREE.MeshStandardMaterial({ color: SC(1182983), roughness: 1 }),
    );
    soil.scale.set(1.04, 0.13, 1.04);
    soil.position.y = 0.5;
    soil.receiveShadow = true;
    this.scene.add(soil);
    const stone = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 1),
      new THREE.MeshPhysicalMaterial({
        color: SC(2304564),
        roughness: 0.45,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
      }),
    );
    stone.scale.set(1, 0.55, 0.82);
    stone.position.set(2.15, 0.16, 0.7);
    stone.rotation.y = 0.7;
    stone.castShadow = true;
    stone.receiveShadow = true;
    this.scene.add(stone);
  },

  // Build the tree at progress = FREEZE if set, otherwise 0.
  initTree() {
    this.tree = new TreeBuilder(SEED).build();
    this.scene.add(this.tree.group);
    this.canopyLight.position.copy(this.tree.canopy);
    this.updateGrowth(FREEZE !== null ? FREEZE : 0);
  },

  // InstancedMesh petal pool + per-petal physics state.
  initPetals() {
    this.petals = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.085, 0.12),
      new THREE.MeshBasicMaterial({
        map: petalTex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      PET_N,
    );
    this.petals.frustumCulled = false;
    this.petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.petals);
    this.petalStates = [];
    for (let i = 0; i < PET_N; i++) {
      this.petalStates.push({
        active: false,
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        spin: { x: 0, y: 0, z: 0 },
        fallSpeed: 0,
        phase: 0,
        life: 0,
        size: 1,
      });
    }
    this.dummy = new THREE.Object3D();
  },

  // Pointer events: shake the tree + spawn petals; track pointer for wind.
  wireEvents() {
    window.addEventListener("pointerdown", () => {
      if (window.App.stage !== "loading") return;
      this.shakeAmp = Math.min(this.shakeAmp + 0.85, 1.15);
      this.shakeSeed = Math.random() * TAU;
      if (this.bloom > 0.2) {
        for (let i = 0; i < 9; i++) this.spawnPetal();
      }
    });
    window.addEventListener("pointermove", (e) => {
      if (window.App.stage !== "loading") {
        this.lastPX = null;
        return;
      }
      if (this.lastPX !== null) {
        const dx = clamp(
          ((e.clientX - this.lastPX) / window.innerWidth) * 3,
          -0.35,
          0.35,
        );
        this.gustX += dx * Math.cos(this.camAngCur);
        this.gustZ += dx * -Math.sin(this.camAngCur);
        const m = Math.sqrt(
          this.gustX * this.gustX + this.gustZ * this.gustZ,
        );
        if (m > 1.3) {
          this.gustX *= 1.3 / m;
          this.gustZ *= 1.3 / m;
        }
      }
      this.lastPX = e.clientX;
    });
    window.addEventListener("pointerleave", () => {
      this.lastPX = null;
    });
    window.addEventListener("resize", () => this.onResize());
  },

  start() {
    this.clock.getDelta();
    this.animate();
  },
};
