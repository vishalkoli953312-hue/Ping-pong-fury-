import * as THREE from "three";
import {
  AI_HIT_Z,
  AI_Z,
  BAT_RX,
  BAT_RY,
  EV_APEX,
  EV_FLOOR,
  EV_NET,
  EV_PLANE,
  EV_TABLE,
  FLOOR_Y,
  NET_H,
  NET_HALF_W,
  PLAYER_HIT_Z,
  PLAYER_Z,
  TABLE_HALF_L,
  TABLE_HALF_W,
  TABLE_Y,
  clamp,
  copyV3,
  findInterception,
  gauss,
  lenV3,
  lerp,
  makeSimResult,
  predictCrossing,
  rand,
  simulate,
  solveServe,
  solveShot,
  stepBall,
  v3,
  type Ball,
  type V3,
} from "./physics";
import {
  ScoreboardCanvas,
  makeBallTexture,
  makeBarrierTexture,
  makeNetTexture,
  makeShadowTexture,
  makeTableTexture,
  makeTargetTexture,
} from "./textures";
import { ImpactRings, Trail, createBat } from "./effects";
import { sfx } from "./audio";
import {
  DIFFICULTIES,
  type DifficultyCfg,
  type DrillCfg,
  type GameMode,
  type GameSnapshot,
  type Message,
  type Phase,
  type Side,
} from "./types";

import skyUrl from "../assets/sky.jpg";
import crowdUrl from "../assets/crowd.jpg";
import floorUrl from "../assets/floor.png";
import woodUrl from "../assets/wood.png";
import rubberRedUrl from "../assets/rubber_red.png";
import rubberBlueUrl from "../assets/rubber_blue.png";

const PHYS_DT = 1 / 120;
const BALL_VIS_R = 0.027;
const opp = (s: Side): Side => (s === "player" ? "ai" : "player");

interface AiCfg {
  speed: number;
  error: number;
  power: number;
  missRate: number;
  cornerBias: number;
  react: number;
}

interface Assist {
  aimClamp: number;
  depthClamp: number;
  mishit: number;
  /** multiplier on the human bat's hit tolerance */
  hitScale: number;
}

const RALLY_AI: AiCfg = { speed: 6.5, error: 0.015, power: 0.42, missRate: 0, cornerBias: 0.1, react: 0.05 };

export class Engine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 150);
  private timer = new THREE.Timer();
  private raf = 0;
  private acc = 0;
  private disposed = false;
  private resizeObs: ResizeObserver | null = null;

  // mode
  private mode: GameMode;
  private drill: DrillCfg | null = null;
  private aiCfg: AiCfg;
  private assist: Assist;
  private pointsToWin = 11;

  // scene objects
  private ballMesh!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private trail = new Trail();
  private rings = new ImpactRings(5);
  private playerBat!: THREE.Group;
  private aiBat!: THREE.Group;
  private board = new ScoreboardCanvas();
  private targetMesh!: THREE.Mesh;

  // physics
  private ball: Ball = { p: v3(0, 0.3, PLAYER_Z - 0.1), v: v3(), w: v3() };
  private prevP = v3();
  private ballQuat = new THREE.Quaternion();
  private tmpQ = new THREE.Quaternion();
  private tmpAxis = new THREE.Vector3();
  private simRes = makeSimResult();
  private trailIntensity = 0;

  // game state
  private phase: Phase = "ready";
  private paused = false;
  private scores = { player: 0, ai: 0 };
  private server: Side = "player";
  private pointsPlayed = 0;
  private lastHitter: Side = "player";
  private needOwnBounce = false;
  private bouncedOpp = false;
  private netTouched = false;
  private rally = 0;
  private bestRally = 0;
  private lastSpeed = 0;
  private maxSpeed = 0;
  private lastHitSpin = 0;
  private drillProgress = 0;
  private drillMisses = 0;
  private drillResolved = false;
  private feedCount = 0;
  private target = { x: 0, z: -0.8 };
  private message: Message | null = null;
  private msgId = 0;
  private hint = "";
  private result: GameSnapshot["result"] = null;
  private timers: { t: number; fn: () => void }[] = [];
  private readyTime = 0;
  private tossStrikeY = 0;
  private tossSide: Side = "player";
  private elapsed = 0;

  // input
  private pointer = { active: false, touch: false };
  private batTarget = { x: 0, y: 0.25 };
  private batPos = { x: 0, y: 0.25 };
  private batPrev = { x: 0, y: 0.25 };
  private batVel = { x: 0, y: 0 };
  private aiPos = { x: 0, y: 0.28, z: AI_Z };
  private ai = { hasPlan: false, dirty: false, idle: false, x: 0, y: 0.28, z: AI_Z, errX: 0, errY: 0, react: 0 };
  private swing = { player: 0, ai: 0 };
  private debugErr = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private ctrlPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PLAYER_Z);
  private hitPt = new THREE.Vector3();
  private camBase = new THREE.Vector3(0, 1.45, 3.25);
  private camLook = new THREE.Vector3(0, 0.05, -0.35);
  private camSway = 0;
  private touchBandTop = 0.45;
  private isTouchDevice = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

  onSnapshot: (s: GameSnapshot) => void;
  onDrillComplete: ((stars: number) => void) | null = null;

  /** --- debug / testing hooks (used by automated checks) --- */
  debugAuto = false;
  debugLog: string[] = [];
  private log(msg: string) {
    if (this.debugLog.length < 2000) this.debugLog.push(msg);
  }
  /** Advance game logic by `seconds` without rendering. */
  debugAdvance(seconds: number) {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      this.tickTimers(dt);
      this.updateInput(dt);
      this.physicsStep(PHYS_DT);
      this.physicsStep(PHYS_DT);
      this.updateAI(dt);
    }
    this.emit();
  }

  constructor(container: HTMLElement, mode: GameMode, onSnapshot: (s: GameSnapshot) => void) {
    this.container = container;
    this.mode = mode;
    this.onSnapshot = onSnapshot;

    if (mode.kind === "match") {
      const d: DifficultyCfg = DIFFICULTIES[mode.difficulty];
      this.aiCfg = {
        speed: d.aiSpeed,
        error: d.aiError,
        power: d.aiPower,
        missRate: d.aiMissRate,
        cornerBias: d.cornerBias,
        react: mode.difficulty === "legend" ? 0.05 : mode.difficulty === "pro" ? 0.12 : 0.2,
      };
      this.assist = {
        aimClamp: d.aimClamp,
        depthClamp: d.depthClamp,
        mishit: d.mishit,
        hitScale: mode.difficulty === "rookie" ? 1.3 : mode.difficulty === "pro" ? 1.15 : 1.0,
      };
      this.pointsToWin = mode.pointsToWin;
    } else {
      this.drill = mode.drill;
      this.aiCfg = RALLY_AI;
      this.assist = { aimClamp: 0.7, depthClamp: 1.3, mishit: 0.08, hitScale: 1.25 };
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    this.buildScene();
    this.bindInput();
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    this.refreshBoard();
    this.newPoint();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------------------------------------------ scene */

  private buildScene() {
    const scene = this.scene;
    const loader = new THREE.TextureLoader();
    const colorTex = (url: string, wrap = false, rx = 1, ry = 1) => {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      if (wrap) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
      }
      return t;
    };

    scene.fog = new THREE.Fog(0xd8e3ee, 24, 70);

    // ---- lights
    const hemi = new THREE.HemisphereLight(0xe9f2ff, 0x8d957a, 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3e2, 2.2);
    sun.position.set(1.8, 7.5, 2.6);
    sun.castShadow = true;
    const mobile = this.isTouchDevice;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    sun.shadow.camera.left = -3.4;
    sun.shadow.camera.right = 3.4;
    sun.shadow.camera.top = 3.4;
    sun.shadow.camera.bottom = -3.4;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 20;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    // ---- sky dome
    const skyTex = loader.load(skyUrl);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    skyTex.wrapS = THREE.MirroredRepeatWrapping;
    skyTex.repeat.set(2, 1);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.53),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false })
    );
    sky.rotation.y = Math.PI / 2;
    scene.add(sky);

    // ---- floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ map: colorTex(floorUrl, true, 40, 40), roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    scene.add(floor);

    // ---- crowd backdrop
    const crowdTex = loader.load(crowdUrl);
    crowdTex.colorSpace = THREE.SRGBColorSpace;
    crowdTex.wrapS = THREE.MirroredRepeatWrapping;
    crowdTex.repeat.set(9, 1);
    const crowdH = 2.6;
    const crowd = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 16, crowdH, 72, 1, true, Math.PI - 1.4, 2.8),
      new THREE.MeshBasicMaterial({ map: crowdTex, side: THREE.BackSide, color: 0xd9dde2 })
    );
    crowd.position.y = FLOOR_Y + crowdH / 2;
    scene.add(crowd);
    const crowdWall = new THREE.Mesh(
      new THREE.CylinderGeometry(16.06, 16.06, crowdH + 0.4, 72, 1, true, Math.PI - 1.4, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x3f4756, side: THREE.DoubleSide, roughness: 0.9 })
    );
    crowdWall.position.y = FLOOR_Y + (crowdH + 0.4) / 2;
    scene.add(crowdWall);
    // low front wall of the stands
    const standWall = new THREE.Mesh(
      new THREE.CylinderGeometry(15.9, 15.9, 0.9, 72, 1, true, Math.PI - 1.4, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x2a63b8, side: THREE.DoubleSide, roughness: 0.7 })
    );
    standWall.position.y = FLOOR_Y + 0.45;
    scene.add(standWall);

    // ---- table
    const tableTex = makeTableTexture();
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x173f73, roughness: 0.7 });
    const topMat = new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.55, metalness: 0.02 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_HALF_W * 2, 0.035, TABLE_HALF_L * 2), [
      sideMat,
      sideMat,
      topMat,
      sideMat,
      sideMat,
      sideMat,
    ]);
    top.position.y = TABLE_Y - 0.0175;
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6, metalness: 0.3 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(TABLE_HALF_W * 2 + 0.02, 0.06, TABLE_HALF_L * 2 + 0.02), frameMat);
    apron.position.y = -0.07;
    apron.castShadow = true;
    scene.add(apron);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.4 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), legMat);
        leg.position.set(sx * 0.62, -0.1 - 0.36, sz * 1.1);
        leg.castShadow = true;
        scene.add(leg);
      }
    for (const sz of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), legMat);
      bar.position.set(0, -0.62, sz * 1.1);
      scene.add(bar);
    }

    // ---- net
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(NET_HALF_W * 2, NET_H),
      new THREE.MeshStandardMaterial({ map: makeNetTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 })
    );
    net.position.set(0, TABLE_Y + NET_H / 2, 0);
    net.castShadow = true;
    scene.add(net);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.4, metalness: 0.6 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, NET_H + 0.04, 12), postMat);
      post.position.set(sx * NET_HALF_W, TABLE_Y + (NET_H + 0.04) / 2 - 0.02, 0);
      post.castShadow = true;
      scene.add(post);
      const clampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), postMat);
      clampMesh.position.set(sx * (TABLE_HALF_W + 0.06), -0.02, 0);
      scene.add(clampMesh);
    }

    // ---- barriers
    const barrierTex = makeBarrierTexture();
    const barrierMat = new THREE.MeshStandardMaterial({ map: barrierTex, roughness: 0.8 });
    const barrierGeo = new THREE.BoxGeometry(2.0, 0.72, 0.05);
    const placeBarrier = (x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(barrierGeo, barrierMat);
      m.position.set(x, FLOOR_Y + 0.36, z);
      m.rotation.y = ry;
      m.castShadow = true;
      scene.add(m);
    };
    placeBarrier(-2.3, -3.4, 0);
    placeBarrier(2.3, -3.4, 0);
    placeBarrier(-3.2, -1.7, Math.PI / 2);
    placeBarrier(3.2, -1.7, Math.PI / 2);
    placeBarrier(-3.2, 0.6, Math.PI / 2);
    placeBarrier(3.2, 0.6, Math.PI / 2);

    // ---- 3D scoreboard banner behind the opponent
    const boardGroup = new THREE.Group();
    boardGroup.position.set(0, 1.2, -3.6);
    const screenMat = new THREE.MeshStandardMaterial({
      map: this.board.texture,
      emissive: 0xffffff,
      emissiveMap: this.board.texture,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.4 });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.78, 0.06), [darkMat, darkMat, darkMat, darkMat, screenMat, darkMat]);
    screen.castShadow = true;
    boardGroup.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.92, 0.1), new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.45, metalness: 0.5 }));
    frame.position.z = -0.045;
    frame.castShadow = true;
    boardGroup.add(frame);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0xd9413b, roughness: 0.5 }));
    cap.position.set(0, 0.5, -0.05);
    boardGroup.add(cap);
    for (const sx of [-1, 1]) {
      const postH = 1.2 - 0.46 - FLOOR_Y;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, postH, 16), darkMat);
      post.position.set(sx * 0.85, -0.46 - postH / 2, -0.05);
      post.castShadow = true;
      boardGroup.add(post);
    }
    scene.add(boardGroup);

    // ---- bats
    const wood = colorTex(woodUrl);
    this.playerBat = createBat(colorTex(rubberRedUrl), wood, 0xd9413b);
    this.playerBat.position.set(0, 0.25, PLAYER_Z);
    scene.add(this.playerBat);
    this.aiBat = createBat(colorTex(rubberBlueUrl), wood, 0x2a63b8);
    this.aiBat.position.set(0, 0.28, AI_Z);
    scene.add(this.aiBat);

    // ---- ball + helpers
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_VIS_R, 28, 20),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.5, metalness: 0 })
    );
    this.ballMesh.castShadow = true;
    scene.add(this.ballMesh);
    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.13),
      new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.renderOrder = 2;
    scene.add(this.ballShadow);
    scene.add(this.trail.mesh);
    scene.add(this.rings.group);

    this.targetMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.72),
      new THREE.MeshBasicMaterial({ map: makeTargetTexture(), transparent: true, depthWrite: false, toneMapped: false })
    );
    this.targetMesh.rotation.x = -Math.PI / 2;
    this.targetMesh.position.y = TABLE_Y + 0.003;
    this.targetMesh.renderOrder = 1;
    this.targetMesh.visible = false;
    scene.add(this.targetMesh);
  }

  /* ------------------------------------------------------------ camera */

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    if (aspect < 0.85) {
      this.camBase.set(0, 2.15, 3.9);
      this.camLook.set(0, -0.2, -0.35);
    } else if (aspect < 1.35) {
      this.camBase.set(0, 1.75, 3.55);
      this.camLook.set(0, -0.05, -0.35);
    } else {
      this.camBase.set(0, 1.4, 3.1);
      this.camLook.set(0, 0.1, -0.4);
    }
    const cam = this.camera;
    cam.aspect = aspect;
    cam.position.copy(this.camBase);
    cam.lookAt(this.camLook);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    // [x, y, z, margin] – margin < 1 keeps the point comfortably inside the frame
    const pts = [
      [-TABLE_HALF_W, 0, -TABLE_HALF_L, 0.88],
      [TABLE_HALF_W, 0, -TABLE_HALF_L, 0.88],
      [-TABLE_HALF_W, 0, TABLE_HALF_L, 0.9],
      [TABLE_HALF_W, 0, TABLE_HALF_L, 0.9],
      [-0.9, 0, PLAYER_Z, 1.0],
      [0.9, 0, PLAYER_Z, 1.0],
      [0, 0.8, PLAYER_Z, 0.95],
      [0, 1.66, -3.6, 1.0],
      [-1.07, 0.9, -3.6, 1.0],
      [1.07, 0.9, -3.6, 1.0],
    ];
    const v = new THREE.Vector3();
    let tanMax = 0.2;
    for (const p of pts) {
      v.set(p[0], p[1], p[2]).applyMatrix4(inv);
      const dz = -v.z;
      if (dz < 0.1) continue;
      tanMax = Math.max(tanMax, Math.abs(v.y) / dz / p[3], Math.abs(v.x) / dz / aspect / p[3]);
    }
    cam.fov = clamp((2 * Math.atan(tanMax) * 180) / Math.PI, 36, 100);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    // screen fraction (from top) of the highest bat position – used for touch band mapping
    v.set(0, 0.92, PLAYER_Z).project(cam);
    this.touchBandTop = clamp((1 - v.y) / 2, 0.25, 0.6);
  }

  /* ------------------------------------------------------------ input */

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    sfx.init();
    this.pointer.active = true;
    this.pointer.touch = e.pointerType === "touch";
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.updatePointer(e);
    if (!this.paused && this.phase === "ready" && this.mode.kind === "match" && this.server === "player" && this.readyTime > 0.25) {
      // snap the bat to the finger so the toss starts where the player is
      this.batPos.x = this.batTarget.x;
      this.batPos.y = this.batTarget.y;
      this.batPrev.x = this.batPos.x;
      this.batPrev.y = this.batPos.y;
      this.batVel.x = 0;
      this.batVel.y = 0;
      this.startToss("player");
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" || this.pointer.active) this.updatePointer(e);
  };

  private onUp = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.pointer.active = false;
  };

  private updatePointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const touch = e.pointerType !== "mouse";
    if (touch) {
      // Touch: the lower part of the screen (below the highest bat position) maps
      // linearly onto the full bat height range, so the finger sits below the bat.
      const t = clamp((fy - this.touchBandTop) / (1 - this.touchBandTop), 0, 1);
      this.batTarget.y = lerp(0.92, -0.08, t);
      const ny = -(this.touchBandTop + t * (0.78 - this.touchBandTop)) * 2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(fx * 2 - 1, ny), this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.ctrlPlane, this.hitPt);
      if (!hit) return;
      this.batTarget.x = clamp(hit.x * 1.18, -1.25, 1.25);
    } else {
      this.raycaster.setFromCamera(new THREE.Vector2(fx * 2 - 1, -fy * 2 + 1), this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.ctrlPlane, this.hitPt);
      if (!hit) return;
      this.batTarget.x = clamp(hit.x, -1.25, 1.25);
      this.batTarget.y = clamp(hit.y, -0.08, 0.92);
    }
  }

  /* ------------------------------------------------------------ public API */

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) {
      this.timer.update();
      this.timer.getDelta();
    }
    this.emit();
  }

  restart() {
    this.timers = [];
    this.scores = { player: 0, ai: 0 };
    this.server = "player";
    this.pointsPlayed = 0;
    this.rally = 0;
    this.bestRally = 0;
    this.lastSpeed = 0;
    this.maxSpeed = 0;
    this.drillProgress = 0;
    this.drillMisses = 0;
    this.feedCount = 0;
    this.result = null;
    this.message = null;
    this.paused = false;
    this.phase = "ready";
    this.refreshBoard();
    this.newPoint();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    el.remove();
  }

  /* ------------------------------------------------------------ helpers */

  private after(seconds: number, fn: () => void) {
    this.timers.push({ t: seconds, fn });
  }

  private say(text: string, tone: Message["tone"]) {
    this.message = { id: ++this.msgId, text, tone };
  }

  private emit() {
    this.onSnapshot({
      phase: this.phase,
      paused: this.paused,
      scores: { ...this.scores },
      server: this.server,
      rally: this.rally,
      bestRally: this.bestRally,
      lastSpeedKmh: Math.round(this.lastSpeed * 3.6),
      maxSpeedKmh: Math.round(this.maxSpeed * 3.6),
      drillProgress: this.drillProgress,
      drillGoal: this.drill?.goal ?? 0,
      drillMisses: this.drillMisses,
      message: this.message,
      hint: this.hint,
      result: this.result,
    });
  }

  private refreshBoard() {
    if (this.mode.kind === "match") {
      const d = DIFFICULTIES[this.mode.difficulty];
      this.board.draw({
        title: "PONG PONG FURY",
        left: this.scores.player,
        right: this.scores.ai,
        server: this.server,
        sub: `${d.name.toUpperCase()} MATCH  ·  FIRST TO ${this.pointsToWin}`,
      });
    } else {
      const dr = this.drill!;
      this.board.draw({
        title: "PONG PONG FURY  ·  TRAINING",
        left: this.drillProgress,
        right: this.drillMisses,
        server: "player",
        sub: `${dr.name.toUpperCase()}  ·  ${this.drillProgress} / ${dr.goal}`,
        progress: { value: this.drillProgress, goal: dr.goal },
      });
    }
  }

  private resetBallFlags() {
    this.needOwnBounce = false;
    this.bouncedOpp = false;
    this.netTouched = false;
    this.drillResolved = false;
    this.ai.hasPlan = false;
    this.ai.idle = false;
  }

  /* ------------------------------------------------------------ flow */

  private newPoint() {
    if (this.phase === "over") return;
    this.phase = "ready";
    this.readyTime = 0;
    this.rally = 0;
    if (this.mode.kind === "drill" && this.drill!.rule === "rally") {
      this.drillProgress = 0;
      this.refreshBoard();
    }
    this.resetBallFlags();
    this.ball.v = v3();
    this.ball.w = v3();
    this.targetMesh.visible = false;
    if (this.mode.kind === "drill") {
      this.hint = this.feedCount === 0 ? this.drill!.tip : "";
      this.after(this.feedCount === 0 ? 1.4 : 0.9, () => this.feedBall());
    } else {
      const n = this.pointsToWin;
      const mp =
        (this.scores.player >= n - 1 && this.scores.player > this.scores.ai) ||
        (this.scores.ai >= n - 1 && this.scores.ai > this.scores.player);
      if (this.server === "player") this.hint = mp ? "MATCH POINT · TAP TO SERVE" : "TAP TO SERVE";
      else {
        this.hint = mp ? "MATCH POINT · CPU SERVES" : "CPU SERVES";
        this.after(1.1, () => this.startToss("ai"));
      }
    }
    this.emit();
  }

  private heldBallPosition(out: V3) {
    const holder: Side = this.mode.kind === "drill" ? "ai" : this.server;
    if (holder === "player") {
      out.x = this.batPos.x;
      out.y = Math.max(this.batPos.y, 0.08) + 0.13;
      out.z = PLAYER_Z - 0.07;
    } else {
      out.x = this.aiPos.x;
      out.y = this.aiPos.y + 0.12;
      out.z = AI_Z + 0.07;
    }
  }

  private startToss(side: Side) {
    if (this.phase !== "ready") return;
    this.phase = "toss";
    this.tossSide = side;
    this.heldBallPosition(this.ball.p);
    this.ball.v = v3(0, 2.7, 0);
    this.ball.w = v3();
    this.tossStrikeY = Math.max(this.ball.p.y, 0.28);
    this.trail.reset(this.ball.p);
    this.hint = side === "player" ? "SWIPE TO HIT" : "";
    this.emit();
  }

  private strikeServe(side: Side) {
    const b = this.ball;
    const w = v3();
    const v = v3();
    let tx: number;
    let tz: number;
    let ownZ: number;
    let power = 0.4;
    if (side === "player") {
      const sw = this.batVel;
      power = clamp(Math.hypot(sw.x, sw.y) / 4, 0, 1);
      tx = clamp(-(this.batPos.x - b.p.x) * 1.2 + sw.x * 0.1 + rand(-0.12, 0.12), -0.55, 0.55);
      tz = -(0.42 + power * 0.35 + rand(0, 0.1));
      ownZ = 0.62;
      w.x = -clamp(sw.y * 30, -120, 150);
      w.y = -clamp(sw.x * 10, -60, 60);
    } else {
      const c = this.aiCfg;
      power = clamp(c.power + rand(-0.1, 0.1), 0.2, 1);
      tx = rand(-0.55, 0.55) * (0.5 + c.cornerBias);
      tz = 0.42 + power * 0.35 + rand(0, 0.12);
      ownZ = -0.62;
      w.x = rand(-50, 110) * power;
      w.y = rand(-60, 60) * power;
    }
    const legal = solveServe(b.p, ownZ, tx, tz, w, v, side === "player" ? AI_HIT_Z : PLAYER_HIT_Z);
    if (!legal) solveShot(b.p, tx, tz, 0.75, w, v);
    this.log(`serve ${side} legal=${legal} y=${b.p.y.toFixed(2)}`);
    copyV3(b.v, v);
    copyV3(b.w, w);
    this.phase = "rally";
    this.resetBallFlags();
    this.lastHitter = side;
    this.needOwnBounce = legal;
    this.rally = 0;
    this.hint = "";
    this.swing[side] = 1;
    this.rings.spawn(b.p, this.camera.position, side === "player" ? 0xffffff : 0xbfdcff);
    sfx.hit(0.35 + power * 0.3);
    this.lastSpeed = lenV3(b.v);
    this.ai.react = this.aiCfg.react;
    this.emit();
  }

  private feedBall() {
    if (this.phase !== "ready") return;
    const dr = this.drill!;
    const spread = dr.feedSpread;
    const fx = rand(-spread, spread);
    this.aiPos.x = fx;
    this.aiPos.y = 0.3;
    this.aiPos.z = AI_Z;
    const b = this.ball;
    b.p = v3(fx, 0.3, AI_Z + 0.1);
    const tx = rand(-spread, spread);
    const tz = dr.lob ? rand(1.1, 1.2) : rand(0.7, 1.15);
    const T = dr.lob ? 1.05 : lerp(0.85, 0.55, dr.feedSpeed);
    const w = v3(dr.feedSpin, 0, 0);
    const v = v3();
    solveShot(b.p, tx, tz, T, w, v);
    copyV3(b.v, v);
    copyV3(b.w, w);
    this.trail.reset(b.p);
    this.phase = "rally";
    this.resetBallFlags();
    this.lastHitter = "ai";
    this.feedCount++;
    this.hint = this.feedCount <= 1 ? dr.tip : "";
    if (dr.rule === "target") {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.target.x = side * rand(0.25, 0.45);
      this.target.z = -rand(0.55, 1.0);
      this.targetMesh.position.x = this.target.x;
      this.targetMesh.position.z = this.target.z;
      this.targetMesh.visible = true;
    }
    this.swing.ai = 1;
    sfx.hit(0.4);
    this.emit();
  }

  private award(to: Side, text: string) {
    if (this.phase !== "rally") return;
    this.log(`award ${to} ${text} last=${this.lastHitter} rally=${this.rally} p=(${this.ball.p.x.toFixed(2)},${this.ball.p.y.toFixed(2)},${this.ball.p.z.toFixed(2)})`);
    if (this.mode.kind === "drill") {
      if (this.drill!.rule === "rally") this.drillResolve(false, "RALLY BROKEN");
      else if (to === "ai") this.drillResolve(false, text);
      else {
        this.phase = "point";
        this.after(1.0, () => this.newPoint());
        this.emit();
      }
      return;
    }
    this.phase = "point";
    this.scores[to]++;
    this.pointsPlayed++;
    this.bestRally = Math.max(this.bestRally, this.rally);
    this.say(text, to === "player" ? "good" : "bad");
    sfx.point(to === "player");
    const n = this.pointsToWin;
    const deuce = this.scores.player >= n - 1 && this.scores.ai >= n - 1;
    if (deuce || this.pointsPlayed % 2 === 0) this.server = opp(this.server);
    if (this.scores[to] >= n && Math.abs(this.scores.player - this.scores.ai) >= 2) {
      this.after(1.3, () => this.finishMatch());
    } else {
      this.after(1.7, () => this.newPoint());
    }
    this.hint = "";
    this.refreshBoard();
    this.emit();
  }

  private finishMatch() {
    this.phase = "over";
    const won = this.scores.player > this.scores.ai;
    this.result = { won, stars: 0 };
    this.hint = "";
    if (won) sfx.win();
    else sfx.lose();
    this.emit();
  }

  private drillResolve(ok: boolean, text: string) {
    if (this.drillResolved) return;
    this.drillResolved = true;
    this.phase = "point";
    if (ok) {
      if (this.drill!.rule !== "rally") this.drillProgress++;
      this.say(text, "good");
      sfx.point(true);
      if (this.drillProgress >= this.drill!.goal) {
        this.after(1.0, () => this.completeDrill());
        this.refreshBoard();
        this.emit();
        return;
      }
    } else {
      this.drillMisses++;
      this.say(text, "bad");
      sfx.point(false);
    }
    this.hint = "";
    this.after(1.3, () => this.newPoint());
    this.refreshBoard();
    this.emit();
  }

  private completeDrill() {
    this.phase = "over";
    const m = this.drillMisses;
    const stars = m <= 2 ? 3 : m <= 5 ? 2 : 1;
    this.result = { won: true, stars };
    sfx.win();
    this.onDrillComplete?.(stars);
    this.emit();
  }

  private evaluateDrill(x: number, z: number) {
    const dr = this.drill!;
    switch (dr.rule) {
      case "return":
        this.drillResolve(true, "NICE!");
        break;
      case "target": {
        const d = Math.hypot(x - this.target.x, z - this.target.z);
        if (d < 0.36) this.drillResolve(true, "BULLSEYE!");
        else if (d < 0.55) this.drillResolve(false, "SO CLOSE!");
        else this.drillResolve(false, "MISSED ZONE");
        break;
      }
      case "topspin":
        if (this.lastHitSpin < -100) this.drillResolve(true, "LOOP!");
        else this.drillResolve(false, "MORE TOPSPIN!");
        break;
      case "smash":
        if (this.lastSpeed >= 8.3) this.drillResolve(true, "SMASH!");
        else this.drillResolve(false, "TOO SOFT!");
        break;
      case "rally":
        break;
    }
  }

  /* ------------------------------------------------------------ rules */

  private onTableBounce(side: Side, x: number, z: number) {
    sfx.bounce();
    const receiver = opp(this.lastHitter);
    if (this.needOwnBounce) {
      if (side === this.lastHitter) {
        this.needOwnBounce = false;
        return;
      }
      this.award(receiver, "FAULT!");
      return;
    }
    if (!this.bouncedOpp) {
      if (side === receiver) {
        this.bouncedOpp = true;
        this.ai.dirty = true;
        if (this.mode.kind === "drill" && side === "ai" && this.drill!.rule !== "rally") this.evaluateDrill(x, z);
        return;
      }
      this.award(receiver, this.netTouched ? "NET!" : "FAULT!");
      return;
    }
    this.award(this.lastHitter, this.lastHitter === "player" ? "WINNER!" : "MISSED!");
  }

  private resolveDead() {
    if (this.phase !== "rally") return;
    const receiver = opp(this.lastHitter);
    if (this.bouncedOpp) this.award(this.lastHitter, this.lastHitter === "player" ? "WINNER!" : "MISSED!");
    else this.award(receiver, this.netTouched ? "NET!" : "OUT!");
  }

  private onReachPlane(side: Side, pp: V3) {
    const p = this.ball.p;
    const zPlane = side === "player" ? PLAYER_HIT_Z : this.aiPos.z + 0.03;
    const f = (zPlane - pp.z) / (p.z - pp.z || 1e-6);
    const cx = pp.x + (p.x - pp.x) * f;
    const cy = pp.y + (p.y - pp.y) * f;
    if (this.lastHitter === side) return;
    if (!this.bouncedOpp) {
      this.award(side, this.netTouched ? "NET!" : "OUT!");
      return;
    }
    if (this.mode.kind === "drill" && side === "ai" && this.drill!.rule !== "rally") return;
    const bp = side === "player" ? this.batPos : this.aiPos;
    const sc = side === "player" ? this.assist.hitScale : 1;
    const dx = (cx - bp.x) / (BAT_RX * sc);
    const dy = (cy - bp.y) / (BAT_RY * sc);
    if (dx * dx + dy * dy <= 1) {
      if (side === "player") this.playerHit(cx, cy);
      else this.aiHit(cx, cy);
      return;
    }
    this.log(`miss ${side} ball=(${cx.toFixed(2)},${cy.toFixed(2)}) bat=(${bp.x.toFixed(2)},${bp.y.toFixed(2)})`);
  }

  private playerHit(cx: number, cy: number) {
    const b = this.ball;
    const bp = this.batPos;
    const sw = this.batVel;
    const dx = cx - bp.x;
    const dy = cy - bp.y;
    const sc = this.assist.hitScale;
    const sweet = 1 - Math.min(1, Math.hypot(dx / (BAT_RX * sc), dy / (BAT_RY * sc)));
    const swSpeed = Math.hypot(sw.x, sw.y);
    const power = Math.min(1.4, swSpeed / 4.5);
    const a = this.assist;
    const smash = cy > 0.27 && sw.y < -1.3 && swSpeed > 2.2;
    let aimX = cx * 0.3 + dx * 4.5 + sw.x * 0.08 + (Math.random() - 0.5) * 0.3 * (1 - sweet);
    let depth = clamp(0.5 + power * 0.7, 0.45, a.depthClamp);
    let T = smash ? lerp(0.4, 0.26, Math.min(1, power)) : lerp(0.9, 0.45, Math.min(1, power));
    const w = v3(0, 0, 0);
    w.x = smash ? -30 : -clamp(sw.y * 55, -200, 300);
    w.y = -clamp(sw.x * 20, -120, 120);
    if (w.x < -90) {
      T *= 0.9;
      depth = Math.min(a.depthClamp, depth + 0.1);
    }
    const mishitP = a.mishit * (1 - sweet) * (1 - sweet) + (power > 1.15 ? a.mishit * 0.35 : 0);
    if (Math.random() < mishitP) {
      if (Math.random() < 0.5) aimX = Math.sign(aimX || 1) * rand(0.95, 1.2);
      else depth = rand(1.5, 1.8);
    }
    aimX = clamp(aimX, -a.aimClamp, a.aimClamp);
    b.p.x = cx;
    b.p.y = cy;
    b.p.z = PLAYER_HIT_Z - 0.006;
    const v = v3();
    solveShot(b.p, aimX, -depth, T, w, v);
    copyV3(b.v, v);
    copyV3(b.w, w);
    this.lastHitSpin = w.x;
    this.afterHit("player", Math.min(1, power), smash);
  }

  private aiHit(cx: number, cy: number) {
    const b = this.ball;
    const c = this.aiCfg;
    const power = clamp(c.power + rand(-0.15, 0.15), 0.2, 1);
    let tx = Math.random() < c.cornerBias ? (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 0.62) : rand(-0.45, 0.45);
    let tz = Math.min(1.28, 0.5 + power * 0.75);
    const w = v3(rand(30, 170) * power, rand(-50, 50), 0);
    if (cy < 0.06 && Math.random() < 0.4) w.x = -rand(40, 90); // chop a low ball
    const hitZ = this.aiPos.z + 0.03;
    b.p.x = cx;
    b.p.y = cy;
    b.p.z = hitZ + 0.006;
    const v = v3();
    if (Math.random() < c.missRate) {
      if (Math.random() < 0.5) {
        // straight into the net band
        const dirX = tx - cx;
        const dirY = NET_H * 0.45 - cy;
        const dirZ = 0 - hitZ;
        const l = Math.hypot(dirX, dirY, dirZ);
        const sp = 6.5;
        v.x = (dirX / l) * sp;
        v.y = (dirY / l) * sp;
        v.z = (dirZ / l) * sp;
      } else {
        if (Math.random() < 0.5) tx = (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1.1);
        else tz = rand(1.45, 1.7);
        solveShot(b.p, tx, tz, lerp(0.95, 0.55, power), w, v);
      }
    } else {
      let T = lerp(0.95, 0.42, power);
      if (cy < 0.08) T += 0.12;
      if (cy > 0.45 && power > 0.5) T *= 0.85;
      solveShot(b.p, tx, tz, T, w, v);
      // make sure the ball reaches the player's bat plane at a playable height
      for (let i = 0; i < 3; i++) {
        simulate(b.p, v, w, 3.5, 99, PLAYER_HIT_Z, false, this.simRes);
        const r = this.simRes;
        if (r.event === EV_PLANE && r.bounces === 1 && r.y > 0.07) break;
        tz = Math.min(1.3, tz + 0.2);
        T *= 0.9;
        solveShot(b.p, tx, tz, T, w, v);
      }
    }
    copyV3(b.v, v);
    copyV3(b.w, w);
    this.afterHit("ai", power, false);
  }

  private afterHit(side: Side, power: number, smash: boolean) {
    const b = this.ball;
    this.lastHitter = side;
    this.needOwnBounce = false;
    this.bouncedOpp = false;
    this.netTouched = false;
    this.rally++;
    const sp = lenV3(b.v);
    if (side === "player") {
      this.lastSpeed = sp;
      this.maxSpeed = Math.max(this.maxSpeed, sp);
    }
    this.swing[side] = 1;
    this.rings.spawn(b.p, this.camera.position, side === "player" ? 0xffffff : 0xbfdcff);
    sfx.hit(side === "player" ? power : power * 0.8);
    if (side === "player") {
      if (this.isTouchDevice && navigator.vibrate) {
        try {
          navigator.vibrate(smash ? 25 : 10);
        } catch {
          /* ignore */
        }
      }
      if (smash) this.say("SMASH!", "good");
      else if (power > 1.0) this.say("POWER!", "good");
      else if (b.w.x < -160) this.say("TOPSPIN!", "good");
      this.ai.hasPlan = false;
      this.ai.react = this.aiCfg.react;
    }
    if (this.mode.kind === "drill" && this.drill!.rule === "rally") {
      this.drillProgress = this.rally;
      this.refreshBoard();
      if (this.rally >= this.drill!.goal) this.drillResolve(true, "RALLY COMPLETE!");
    }
    this.emit();
  }

  /* ------------------------------------------------------------ simulation */

  private physicsStep(dt: number) {
    const ph = this.phase;
    if (ph === "ready") {
      this.readyTime += dt;
      if (
        this.mode.kind === "match" &&
        this.server === "player" &&
        this.pointer.active &&
        this.readyTime > 0.5 &&
        Math.hypot(this.batVel.x, this.batVel.y) > 2.4
      ) {
        this.startToss("player");
      }
      return;
    }
    if (ph === "over") return;
    copyV3(this.prevP, this.ball.p);
    const ev = stepBall(this.ball, dt, false);
    if (ph === "toss") {
      if (this.ball.v.y < 0 && this.ball.p.y <= this.tossStrikeY) this.strikeServe(this.tossSide);
      return;
    }
    if (ph === "point") {
      if (ev === EV_TABLE) sfx.bounce();
      return;
    }
    if (ev === EV_TABLE) this.onTableBounce(this.ball.p.z > 0 ? "player" : "ai", this.ball.p.x, this.ball.p.z);
    else if (ev === EV_NET) {
      this.netTouched = true;
      sfx.net();
    } else if (ev === EV_FLOOR) {
      sfx.floor();
      this.resolveDead();
    }
    if (this.phase !== "rally") return;
    const p = this.ball.p;
    const pp = this.prevP;
    const aiHitZ = this.aiPos.z + 0.03;
    if (this.ball.v.z > 0 && pp.z < PLAYER_HIT_Z && p.z >= PLAYER_HIT_Z) this.onReachPlane("player", pp);
    else if (this.ball.v.z < 0 && pp.z > aiHitZ && p.z <= aiHitZ) this.onReachPlane("ai", pp);
    if (this.phase !== "rally") return;
    if (p.y < -0.4 || Math.abs(p.x) > 3.5 || Math.abs(p.z) > 4.5) this.resolveDead();
  }

  private updateInput(dt: number) {
    if (this.debugAuto) {
      // scripted perfect-positioning player with random swipes (testing only)
      if (this.phase === "ready" && this.mode.kind === "match" && this.server === "player" && this.readyTime > 0.3) {
        this.startToss("player");
      }
      if (this.phase === "rally" && this.lastHitter === "ai") {
        predictCrossing(this.ball, PLAYER_HIT_Z, this.simRes);
        if (this.simRes.event === EV_PLANE) {
          this.batTarget.x = clamp(this.simRes.x + this.debugErr.x, -1.25, 1.25);
          this.batTarget.y = clamp(this.simRes.y + this.debugErr.y, -0.08, 0.92);
        }
      } else {
        this.debugErr.x = gauss() * 0.04;
        this.debugErr.y = gauss() * 0.04;
      }
      this.batPos.x = this.batTarget.x;
      this.batPos.y = this.batTarget.y;
      this.batVel.x = rand(-3, 3);
      this.batVel.y = rand(-1.5, 4);
      return;
    }
    const k = 1 - Math.exp(-dt * 26);
    this.batPrev.x = this.batPos.x;
    this.batPrev.y = this.batPos.y;
    this.batPos.x += (this.batTarget.x - this.batPos.x) * k;
    this.batPos.y += (this.batTarget.y - this.batPos.y) * k;
    if (dt > 0) {
      const vx = (this.batPos.x - this.batPrev.x) / dt;
      const vy = (this.batPos.y - this.batPrev.y) / dt;
      this.batVel.x += (vx - this.batVel.x) * 0.5;
      this.batVel.y += (vy - this.batVel.y) * 0.5;
    }
  }

  private updateAI(dt: number) {
    const c = this.aiCfg;
    let tx = 0;
    let ty = 0.28;
    let tz = AI_Z;
    const playsBall = this.mode.kind === "match" || this.drill!.rule === "rally";
    const chasing = this.phase === "rally" && this.lastHitter === "player" && playsBall;
    if (chasing) {
      if (this.ai.react > 0) {
        this.ai.react -= dt;
      } else {
        if (!this.ai.hasPlan || this.ai.dirty) {
          findInterception(this.ball, AI_HIT_Z, this.simRes);
          const r = this.simRes;
          const reachable =
            (r.event === EV_PLANE && (r.bounces >= 1 || this.bouncedOpp)) || r.event === EV_APEX;
          if (reachable) {
            if (!this.ai.hasPlan) {
              this.ai.errX = gauss() * c.error;
              this.ai.errY = gauss() * c.error * 0.6;
            }
            this.ai.x = clamp(r.x + this.ai.errX, -1.3, 1.3);
            this.ai.y = clamp(r.y + this.ai.errY, 0.03, 0.95);
            // step in for short balls: bat sits just behind the interception point
            this.ai.z = r.event === EV_APEX ? clamp(r.z - 0.03, AI_Z, -0.3) : AI_Z;
            this.ai.idle = false;
          } else {
            this.ai.idle = true;
          }
          this.ai.hasPlan = true;
          this.ai.dirty = false;
        }
        if (!this.ai.idle) {
          tx = this.ai.x;
          ty = this.ai.y;
          tz = this.ai.z;
        }
      }
    } else if (this.mode.kind === "drill" && this.drill!.rule !== "rally") {
      tx = this.aiPos.x;
      ty = 0.3;
    } else {
      tx = this.ball.p.x * 0.25;
      ty = 0.28;
    }
    const k = 1 - Math.exp(-dt * 14);
    let dx = (tx - this.aiPos.x) * k;
    let dy = (ty - this.aiPos.y) * k;
    let dz = (tz - this.aiPos.z) * k;
    const maxStep = c.speed * dt;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l > maxStep) {
      dx *= maxStep / l;
      dy *= maxStep / l;
      dz *= maxStep / l;
    }
    this.aiPos.x += dx;
    this.aiPos.y += dy;
    this.aiPos.z += dz;
  }

  private updateVisuals(dt: number) {
    this.elapsed += dt;
    // bats
    this.swing.player = Math.max(0, this.swing.player - dt * 4.5);
    this.swing.ai = Math.max(0, this.swing.ai - dt * 4.5);
    const sp = Math.sin(this.swing.player * Math.PI);
    const sa = Math.sin(this.swing.ai * Math.PI);
    const vx = clamp(this.batVel.x, -6, 6);
    const vy = clamp(this.batVel.y, -6, 6);
    this.playerBat.position.set(this.batPos.x, this.batPos.y, PLAYER_Z - 0.12 * sp);
    this.playerBat.rotation.set(-vy * 0.045 - sp * 0.45, vx * 0.05 + sp * 0.25, 0.35 + vx * 0.03);
    this.aiBat.position.set(this.aiPos.x, this.aiPos.y, this.aiPos.z + 0.12 * sa);
    this.aiBat.rotation.set(sa * 0.45, -sa * 0.25, -0.35 + Math.sin(this.elapsed * 2) * 0.04);

    // ball
    if (this.phase === "ready") {
      this.heldBallPosition(this.ball.p);
      this.trail.reset(this.ball.p);
    }
    const b = this.ball;
    this.ballMesh.position.set(b.p.x, b.p.y, b.p.z);
    const wl = lenV3(b.w);
    if (wl > 1e-3) {
      this.tmpAxis.set(b.w.x / wl, b.w.y / wl, b.w.z / wl);
      this.tmpQ.setFromAxisAngle(this.tmpAxis, wl * dt);
      this.ballQuat.premultiply(this.tmpQ);
      this.ballMesh.quaternion.copy(this.ballQuat);
    }
    // ground shadow blob
    const overTable = Math.abs(b.p.x) < TABLE_HALF_W && Math.abs(b.p.z) < TABLE_HALF_L;
    const gy = overTable ? TABLE_Y : FLOOR_Y;
    const h = Math.max(0, b.p.y - gy);
    this.ballShadow.position.set(b.p.x, gy + 0.005, b.p.z);
    const s = 1 + h * 0.9;
    this.ballShadow.scale.set(s, s, s);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.5 - h * 0.28, 0.08, 0.5);

    // trail
    const speed = lenV3(b.v);
    const targetI = this.phase === "rally" || this.phase === "point" ? clamp((speed - 6) / 4.5, 0, 1) : 0;
    this.trailIntensity += (targetI - this.trailIntensity) * Math.min(1, dt * 10);
    this.trail.update(b.p, this.camera.position, this.trailIntensity);
    this.rings.update(dt);

    // drill target pulse
    if (this.targetMesh.visible) {
      const ps = 1 + Math.sin(this.elapsed * 5) * 0.06;
      this.targetMesh.scale.set(ps, ps, ps);
    }

    // camera sway
    const swayTarget = clamp(b.p.x, -1, 1) * 0.1;
    this.camSway += (swayTarget - this.camSway) * Math.min(1, dt * 3);
    this.camera.position.set(this.camBase.x + this.camSway, this.camBase.y, this.camBase.z);
    this.camera.lookAt(this.camLook.x + this.camSway * 0.6, this.camLook.y, this.camLook.z);
  }

  private tickTimers(dt: number) {
    if (!this.timers.length) return;
    const due: (() => void)[] = [];
    this.timers = this.timers.filter((t) => {
      t.t -= dt;
      if (t.t <= 0) {
        due.push(t.fn);
        return false;
      }
      return true;
    });
    for (const fn of due) fn();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    let dt = this.timer.getDelta();
    if (dt > 0.05) dt = 0.05;
    if (!this.paused) {
      this.tickTimers(dt);
      this.updateInput(dt);
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYS_DT && n < 8) {
        this.physicsStep(PHYS_DT);
        this.acc -= PHYS_DT;
        n++;
      }
      this.updateAI(dt);
      this.updateVisuals(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };
}

