/* ------------------------------------------------------------------
 *  Pong Pong Fury – ball physics, simulation & shot solvers
 *  World units: metres. Table surface at y = 0, length along Z,
 *  player at +Z, CPU at -Z.
 * ------------------------------------------------------------------ */

export const G = 9.81;
export const BALL_R = 0.02;
export const TABLE_HALF_L = 1.37;
export const TABLE_HALF_W = 0.7625;
export const TABLE_Y = 0;
export const NET_H = 0.1525;
export const NET_HALF_W = TABLE_HALF_W + 0.1525;
export const FLOOR_Y = -0.76;
export const PLAYER_Z = 1.5;
export const AI_Z = -1.5;
/** hit planes sit just in front of the bat faces */
export const PLAYER_HIT_Z = PLAYER_Z - 0.03;
export const AI_HIT_Z = AI_Z + 0.03;
export const SIM_DT = 1 / 120;

/** bat face half extents (incl. ball radius tolerance) */
export const BAT_RX = 0.085 + BALL_R;
export const BAT_RY = 0.095 + BALL_R;

const DRAG = 0.045; // quadratic drag (1/m)
const MAGNUS = 0.0012; // magnus coefficient per (rad/s)(m/s)
const REST = 0.88; // table restitution
const GRIP = 0.45; // how strongly spin couples on bounce
const SPIN_DECAY = 0.12;
const MAX_SPIN = 420;

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Ball {
  p: V3;
  v: V3;
  w: V3;
}

export const EV_NONE = 0;
export const EV_TABLE = 1;
export const EV_NET = 2;
export const EV_FLOOR = 3;
export const EV_PLANE = 4;
export const EV_TIMEOUT = 5;

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const copyV3 = (out: V3, a: V3) => {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
};
export const lenV3 = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clampSpin(w: V3) {
  const l = lenV3(w);
  if (l > MAX_SPIN) {
    const s = MAX_SPIN / l;
    w.x *= s;
    w.y *= s;
    w.z *= s;
  }
}

/**
 * Advance the ball by dt. Returns the collision event that happened (if any).
 * `infiniteTable` treats y=0 as an endless table (used by the solvers).
 */
export function stepBall(b: Ball, dt: number, infiniteTable = false): number {
  const p = b.p;
  const v = b.v;
  const w = b.w;
  const px0 = p.x;
  const py0 = p.y;
  const pz0 = p.z;

  const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const d = DRAG * sp;
  const ax = -d * v.x + MAGNUS * (w.y * v.z - w.z * v.y);
  const ay = -G - d * v.y + MAGNUS * (w.z * v.x - w.x * v.z);
  const az = -d * v.z + MAGNUS * (w.x * v.y - w.y * v.x);
  v.x += ax * dt;
  v.y += ay * dt;
  v.z += az * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  const dec = 1 - SPIN_DECAY * dt;
  w.x *= dec;
  w.y *= dec;
  w.z *= dec;

  let ev = EV_NONE;

  // ---- net (plane z = 0) ----
  if ((pz0 > 0 && p.z <= 0) || (pz0 < 0 && p.z >= 0)) {
    const f = pz0 / (pz0 - p.z);
    const yAt = py0 + (p.y - py0) * f;
    const xAt = px0 + (p.x - px0) * f;
    if (
      yAt - BALL_R < TABLE_Y + NET_H &&
      yAt > TABLE_Y - 0.08 &&
      Math.abs(xAt) < NET_HALF_W
    ) {
      const side = pz0 > 0 ? 1 : -1;
      p.z = side * (BALL_R + 0.004);
      p.x = xAt;
      p.y = yAt;
      v.z = -v.z * 0.12;
      v.x *= 0.4;
      v.y = Math.min(v.y, 0) * 0.3 - 0.15;
      w.x *= 0.3;
      w.y *= 0.3;
      w.z *= 0.3;
      ev = EV_NET;
    }
  }

  // ---- table ----
  if (p.y - BALL_R < TABLE_Y && v.y < 0) {
    const onTable =
      infiniteTable ||
      (Math.abs(p.x) <= TABLE_HALF_W + BALL_R * 0.4 &&
        Math.abs(p.z) <= TABLE_HALF_L + BALL_R * 0.4);
    if (onTable) {
      p.y = TABLE_Y + BALL_R;
      // surface velocity induced by spin at the contact point
      const vsx = -w.z * BALL_R;
      const vsz = w.x * BALL_R;
      v.x += GRIP * 0.4 * (vsx - v.x);
      v.z += GRIP * 0.4 * (vsz - v.z);
      v.y = -v.y * REST;
      if (v.y < 0.25) v.y = 0.25;
      // ball picks up partial rolling spin
      w.x += 0.5 * (v.z / BALL_R - w.x);
      w.z += 0.5 * (-v.x / BALL_R - w.z);
      w.y *= 0.7;
      clampSpin(w);
      ev = EV_TABLE;
    }
  }

  // ---- floor ----
  if (p.y - BALL_R < FLOOR_Y) {
    p.y = FLOOR_Y + BALL_R;
    v.y = -v.y * 0.45;
    v.x *= 0.6;
    v.z *= 0.6;
    w.x *= 0.3;
    w.y *= 0.3;
    w.z *= 0.3;
    ev = EV_FLOOR;
  }
  return ev;
}

export interface SimResult {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  event: number;
  bounces: number;
}

export const makeSimResult = (): SimResult => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  t: 0,
  event: EV_NONE,
  bounces: 0,
});

const scratch: Ball = { p: v3(), v: v3(), w: v3() };

function fill(out: SimResult, t: number, ev: number, bounces: number) {
  out.x = scratch.p.x;
  out.y = scratch.p.y;
  out.z = scratch.p.z;
  out.vx = scratch.v.x;
  out.vy = scratch.v.y;
  out.vz = scratch.v.z;
  out.t = t;
  out.event = ev;
  out.bounces = bounces;
}

/**
 * Forward-simulate a ball. Stops on: net hit, floor hit, N-th table bounce,
 * crossing the plane z = stopZ, or timeout.
 */
export function simulate(
  p: V3,
  v: V3,
  w: V3,
  maxT: number,
  stopBounce: number,
  stopZ: number | null,
  infiniteTable: boolean,
  out: SimResult
): SimResult {
  copyV3(scratch.p, p);
  copyV3(scratch.v, v);
  copyV3(scratch.w, w);
  let t = 0;
  let bounces = 0;
  while (t < maxT) {
    const pz0 = scratch.p.z;
    const px0 = scratch.p.x;
    const py0 = scratch.p.y;
    const ev = stepBall(scratch, SIM_DT, infiniteTable);
    t += SIM_DT;
    if (ev === EV_NET) {
      fill(out, t, EV_NET, bounces);
      return out;
    }
    if (ev === EV_FLOOR) {
      fill(out, t, EV_FLOOR, bounces);
      return out;
    }
    if (ev === EV_TABLE) {
      bounces++;
      if (bounces >= stopBounce) {
        fill(out, t, EV_TABLE, bounces);
        return out;
      }
    }
    if (stopZ !== null) {
      const a = pz0 - stopZ;
      const b = scratch.p.z - stopZ;
      if (a !== b && ((a > 0 && b <= 0) || (a < 0 && b >= 0))) {
        const f = a / (a - b);
        fill(out, t, EV_PLANE, bounces);
        out.x = px0 + (scratch.p.x - px0) * f;
        out.y = py0 + (scratch.p.y - py0) * f;
        out.z = stopZ;
        out.t = t - SIM_DT * (1 - f);
        return out;
      }
    }
  }
  fill(out, t, EV_TIMEOUT, bounces);
  return out;
}

const res = makeSimResult();
const tmpV = v3();

/**
 * Solve an initial velocity so the ball lands at (tx, tz) on the table,
 * flying for roughly T seconds, clearing the net. Uses a gravity-only guess
 * refined by full simulation (drag + spin). Returns false if no net-clearing
 * solution was found (outV still holds the best effort).
 */
export function solveShot(
  p0: V3,
  tx: number,
  tz: number,
  T0: number,
  w: V3,
  outV: V3
): boolean {
  let T = T0;
  const ty = TABLE_Y + BALL_R;
  const crossesNet = (p0.z > 0) !== (tz > 0);
  let lastOk = false;
  for (let attempt = 0; attempt < 14; attempt++) {
    let vx = (tx - p0.x) / T;
    let vz = (tz - p0.z) / T;
    const vy = (ty - p0.y) / T + 0.5 * G * T;
    if (crossesNet) {
      const tn = -p0.z / vz;
      const yn = p0.y + vy * tn - 0.5 * G * tn * tn;
      if (yn < TABLE_Y + NET_H + BALL_R + 0.045) {
        T += 0.045;
        continue;
      }
    }
    let converged = false;
    let netHit = false;
    for (let it = 0; it < 4; it++) {
      tmpV.x = vx;
      tmpV.y = vy;
      tmpV.z = vz;
      simulate(p0, tmpV, w, 2.5, 1, null, true, res);
      if (res.event === EV_NET) {
        netHit = true;
        break;
      }
      if (res.event !== EV_TABLE) break;
      const ex = tx - res.x;
      const ez = tz - res.z;
      if (Math.abs(ex) < 0.02 && Math.abs(ez) < 0.03) {
        converged = true;
        break;
      }
      vx += ex / res.t;
      vz += ez / res.t;
    }
    outV.x = vx;
    outV.y = vy;
    outV.z = vz;
    if (netHit) {
      T += 0.045;
      continue;
    }
    lastOk = true;
    if (converged) return true;
    return true;
  }
  return lastOk;
}

const res2 = makeSimResult();

/**
 * Solve a legal serve: first bounce on the server's own side (ownZ),
 * second bounce near (tx, tz) on the receiver's side. Prefers serves that
 * then reach the receiver's bat plane (receiverPlaneZ) without a third bounce.
 */
export function solveServe(
  p0: V3,
  ownZ: number,
  tx: number,
  tz: number,
  w: V3,
  outV: V3,
  receiverPlaneZ: number
): boolean {
  let bestValid = Infinity;
  let bestAny = Infinity;
  let found = false;
  const ty = TABLE_Y + BALL_R;
  const frac = (ownZ - p0.z) / (tz - p0.z);
  const ownX = p0.x + (tx - p0.x) * frac;
  for (let T1 = 0.16; T1 <= 0.7; T1 += 0.02) {
    tmpV.x = (ownX - p0.x) / T1;
    tmpV.z = (ownZ - p0.z) / T1;
    tmpV.y = (ty - p0.y) / T1 + 0.5 * G * T1;
    simulate(p0, tmpV, w, 3, 2, null, false, res);
    if (!(res.event === EV_TABLE && res.bounces === 2 && res.z * tz > 0)) continue;
    const err = Math.abs(res.z - tz) + Math.abs(res.x - tx) * 0.5;
    simulate(p0, tmpV, w, 3.5, 99, receiverPlaneZ, false, res2);
    const valid = res2.event === EV_PLANE && res2.bounces === 2 && res2.y > 0.05;
    if (valid) {
      if (err < bestValid) {
        bestValid = err;
        found = true;
        copyV3(outV, tmpV);
      }
    } else if (bestValid === Infinity && err < bestAny) {
      bestAny = err;
      found = true;
      copyV3(outV, tmpV);
    }
  }
  return found;
}

/** Predict where/when the ball crosses the plane z (or fails to reach it). */
export function predictCrossing(b: Ball, z: number, out: SimResult): SimResult {
  return simulate(b.p, b.v, b.w, 3.5, 99, z, false, out);
}

export const EV_APEX = 6;

/**
 * Where should a receiver whose bat plane is at `planeZ` intercept the ball?
 *  - EV_PLANE: ball reaches the plane (out.bounces = bounces on the receiver's side)
 *  - EV_APEX : ball would bounce twice on the receiver's side first – step in and
 *              take it at the apex after the first bounce (position in out)
 *  - other   : unreachable (net / floor / timeout)
 */
export function findInterception(b: Ball, planeZ: number, out: SimResult): SimResult {
  copyV3(scratch.p, b.p);
  copyV3(scratch.v, b.v);
  copyV3(scratch.w, b.w);
  const sign = planeZ < 0 ? -1 : 1;
  let t = 0;
  let sideBounces = 0;
  let apexY = -1;
  let apexX = 0;
  let apexZ = 0;
  let apexT = 0;
  const apex = () => {
    out.x = apexX;
    out.y = apexY;
    out.z = apexZ;
    out.t = apexT;
    out.event = EV_APEX;
    out.bounces = sideBounces;
    return out;
  };
  while (t < 3.5) {
    const pz0 = scratch.p.z;
    const px0 = scratch.p.x;
    const py0 = scratch.p.y;
    const ev = stepBall(scratch, SIM_DT, false);
    t += SIM_DT;
    if (ev === EV_NET || ev === EV_FLOOR) {
      if (sideBounces >= 1 && apexY > 0.03) return apex();
      fill(out, t, ev, sideBounces);
      return out;
    }
    if (ev === EV_TABLE && scratch.p.z * sign > 0) {
      sideBounces++;
      if (sideBounces >= 2) {
        if (apexY > 0.03) return apex();
        fill(out, t, EV_TABLE, sideBounces);
        return out;
      }
    }
    if (sideBounces === 1 && scratch.p.y > apexY) {
      apexY = scratch.p.y;
      apexX = scratch.p.x;
      apexZ = scratch.p.z;
      apexT = t;
    }
    const a = pz0 - planeZ;
    const c = scratch.p.z - planeZ;
    if (a !== c && ((a > 0 && c <= 0) || (a < 0 && c >= 0))) {
      const f = a / (a - c);
      fill(out, t, EV_PLANE, sideBounces);
      out.x = px0 + (scratch.p.x - px0) * f;
      out.y = py0 + (scratch.p.y - py0) * f;
      out.z = planeZ;
      out.t = t - SIM_DT * (1 - f);
      return out;
    }
  }
  fill(out, t, EV_TIMEOUT, sideBounces);
  return out;
}
