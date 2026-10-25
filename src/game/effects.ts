import * as THREE from "three";
import type { V3 } from "./physics";

/** Camera-facing additive ribbon that follows the ball on heavy hits. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly N = 22;
  private pts: Float32Array;
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private lastSide = new THREE.Vector3(1, 0, 0);

  constructor() {
    const N = this.N;
    this.pts = new Float32Array(N * 3);
    this.pos = new Float32Array(N * 2 * 3);
    this.col = new Float32Array(N * 2 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  reset(p: V3) {
    for (let i = 0; i < this.N; i++) {
      this.pts[i * 3] = p.x;
      this.pts[i * 3 + 1] = p.y;
      this.pts[i * 3 + 2] = p.z;
    }
    this.update(p, null, 0);
  }

  update(p: V3, camPos: THREE.Vector3 | null, intensity: number) {
    const N = this.N;
    const pts = this.pts;
    for (let i = N - 1; i >= 1; i--) {
      pts[i * 3] = pts[(i - 1) * 3];
      pts[i * 3 + 1] = pts[(i - 1) * 3 + 1];
      pts[i * 3 + 2] = pts[(i - 1) * 3 + 2];
    }
    pts[0] = p.x;
    pts[1] = p.y;
    pts[2] = p.z;
    const pos = this.pos;
    const col = this.col;
    for (let i = 0; i < N; i++) {
      const cx = pts[i * 3];
      const cy = pts[i * 3 + 1];
      const cz = pts[i * 3 + 2];
      const j = i < N - 1 ? i + 1 : i - 1;
      this.tmpA.set(pts[j * 3] - cx, pts[j * 3 + 1] - cy, pts[j * 3 + 2] - cz);
      if (camPos) this.tmpB.set(camPos.x - cx, camPos.y - cy, camPos.z - cz);
      else this.tmpB.set(0, 1, 0);
      if (this.tmpA.lengthSq() > 1e-8) {
        this.tmpC.crossVectors(this.tmpA, this.tmpB);
        if (this.tmpC.lengthSq() > 1e-10) this.lastSide.copy(this.tmpC.normalize());
      }
      const k = 1 - i / (N - 1);
      const hw = (0.004 + 0.02 * k) * (0.55 + 0.45 * intensity);
      const sx = this.lastSide.x * hw;
      const sy = this.lastSide.y * hw;
      const sz = this.lastSide.z * hw;
      const o = i * 6;
      pos[o] = cx + sx;
      pos[o + 1] = cy + sy;
      pos[o + 2] = cz + sz;
      pos[o + 3] = cx - sx;
      pos[o + 4] = cy - sy;
      pos[o + 5] = cz - sz;
      const c = intensity * k * k * 0.9;
      col[o] = col[o + 1] = col[o + 2] = c;
      col[o + 3] = col[o + 4] = col[o + 5] = c;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = intensity > 0.01;
  }
}

/** Pool of expanding rings spawned at hit points. */
export class ImpactRings {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.Mesh; life: number }[] = [];
  private next = 0;

  constructor(count = 4) {
    const geo = new THREE.RingGeometry(0.03, 0.045, 28);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.items.push({ mesh, life: 0 });
    }
  }

  spawn(p: V3, camPos: THREE.Vector3, color = 0xffffff) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.mesh.position.set(p.x, p.y, p.z);
    it.mesh.lookAt(camPos);
    it.mesh.scale.setScalar(1);
    it.mesh.visible = true;
    (it.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    it.life = 1;
  }

  update(dt: number) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.life -= dt / 0.3;
      if (it.life <= 0) {
        it.mesh.visible = false;
        continue;
      }
      const s = 1 + (1 - it.life) * 3.5;
      it.mesh.scale.setScalar(s);
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = it.life * 0.9;
    }
  }
}

/** Build a textured 3D bat. Face centre at the group origin, striking faces along ±Z. */
export function createBat(rubber: THREE.Texture, wood: THREE.Texture, accent: number): THREE.Group {
  const g = new THREE.Group();

  const faceGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.014, 48);
  faceGeo.rotateX(Math.PI / 2);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.9 });
  const rubberMat = new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.82, metalness: 0 });
  const face = new THREE.Mesh(faceGeo, [edgeMat, rubberMat, rubberMat]);
  face.castShadow = true;
  g.add(face);

  // thin wooden blade rim peeking out around the rubber
  const rimGeo = new THREE.CylinderGeometry(0.089, 0.089, 0.006, 48);
  rimGeo.rotateX(Math.PI / 2);
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 });
  const rim = new THREE.Mesh(rimGeo, woodMat);
  rim.castShadow = true;
  g.add(rim);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.11, 0.02), woodMat);
  handle.position.y = -0.085 - 0.045;
  handle.castShadow = true;
  g.add(handle);

  const flare = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.022), woodMat);
  flare.position.y = -0.085 - 0.1;
  flare.castShadow = true;
  g.add(flare);

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.018, 0.023),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 })
  );
  band.position.y = -0.085 - 0.012;
  g.add(band);

  return g;
}
