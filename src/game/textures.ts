import * as THREE from "three";

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function colorTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Table top: blue surface, 2 cm white border lines, 3 mm centre line. */
export function makeTableTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 920; // 1.525 : 2.74
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1f62ab");
  grad.addColorStop(0.5, "#2266b3");
  grad.addColorStop(1, "#1f62ab");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  addNoise(ctx, W, H, 14);
  // soft vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // lines
  const lw = (W / 1.525) * 0.02;
  ctx.strokeStyle = "#f5f7fa";
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  ctx.fillStyle = "#f5f7fa";
  ctx.fillRect(W / 2 - 1.2, 0, 2.4, H);
  return colorTex(c);
}

/** Net mesh with white tape, alpha transparent. */
export function makeNetTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(235,238,245,0.95)";
  ctx.lineWidth = 1.2;
  const s = 6;
  for (let x = 0; x <= W; x += s) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += s) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  // top tape
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, 7);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, H - 3, W, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 4;
  return t;
}

/** Ball: white with faint seam and small orange logos (makes spin visible). */
export function makeBallTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fbfbf7";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(200,200,195,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.fillStyle = "#f08a24";
  for (const x of [64, 192]) {
    ctx.beginPath();
    ctx.arc(x, H / 2, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fbfbf7";
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", 64, H / 2 + 1);
  ctx.fillText("F", 192, H / 2 + 1);
  return colorTex(c);
}

/** Court surround boards. */
export function makeBarrierTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 160;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e8edf3";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#14325c";
  ctx.fillRect(0, 0, W, 18);
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = "#d9413b";
  ctx.fillRect(0, 18, W, 6);
  ctx.fillStyle = "#2a63b8";
  ctx.fillRect(0, H - 24, W, 6);
  ctx.font = "italic 900 78px Impact, 'Arial Black', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#14325c";
  ctx.fillText("PONG PONG FURY", W / 2, H / 2 + 6);
  ctx.fillStyle = "#d9413b";
  ctx.beginPath();
  ctx.arc(W * 0.06, H / 2, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a63b8";
  ctx.beginPath();
  ctx.arc(W * 0.94, H / 2, 22, 0, Math.PI * 2);
  ctx.fill();
  const t = colorTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Soft radial shadow blob. */
export function makeShadowTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.5, "rgba(0,0,0,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/** Drill target disc. */
export function makeTargetTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext("2d")!;
  const cx = S / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, "rgba(255,214,102,0.55)");
  g.addColorStop(0.6, "rgba(255,214,102,0.25)");
  g.addColorStop(0.85, "rgba(255,214,102,0.15)");
  g.addColorStop(1, "rgba(255,214,102,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cx, cx - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cx, cx * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface ScoreboardData {
  title: string;
  left: number;
  right: number;
  server: "player" | "ai";
  sub: string;
  progress?: { value: number; goal: number } | null;
}

/** Dynamic canvas for the 3D scoreboard banner. */
export class ScoreboardCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = makeCanvas(1024, 400);
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  draw(d: ScoreboardData) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#132340");
    g.addColorStop(1, "#0b1526");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // subtle LED grid
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 2);
    // frame line
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd166";
    ctx.font = "italic 900 54px Impact, 'Arial Black', Arial, sans-serif";
    ctx.fillText(d.title, W / 2, 58);

    const drawSide = (label: string, score: number, color: string, cx: number, serving: boolean) => {
      ctx.fillStyle = color;
      ctx.font = "900 40px Impact, 'Arial Black', Arial, sans-serif";
      ctx.fillText(label, cx, 128);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 190px Impact, 'Arial Black', Arial, sans-serif";
      ctx.fillText(String(score), cx, 248);
      if (serving) {
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(cx + (cx < W / 2 ? -150 : 150), 128, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawSide("YOU", d.left, "#ff6b6b", W * 0.27, d.server === "player");
    drawSide("CPU", d.right, "#5aa9ff", W * 0.73, d.server === "ai");

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "900 80px Impact, 'Arial Black', Arial, sans-serif";
    ctx.fillText(":", W / 2, 240);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 32px Arial, Helvetica, sans-serif";
    ctx.fillText(d.sub, W / 2, 356);

    if (d.progress) {
      const bw = 520;
      const bx = (W - bw) / 2;
      const by = 318;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(bx, by, bw * Math.min(1, d.progress.value / d.progress.goal), 10);
    }
    this.texture.needsUpdate = true;
  }
}
