export type Difficulty = "rookie" | "pro" | "legend";

export interface DifficultyCfg {
  id: Difficulty;
  name: string;
  tagline: string;
  /** max bat speed of the CPU (m/s) */
  aiSpeed: number;
  /** positional error (m, std-dev) */
  aiError: number;
  /** base shot power 0..1 */
  aiPower: number;
  /** chance the CPU deliberately mis-hits (net/out) */
  aiMissRate: number;
  /** how often CPU goes for the corners */
  cornerBias: number;
  /** aim assist clamps for the human player */
  aimClamp: number;
  depthClamp: number;
  /** probability multiplier for off-centre mishits */
  mishit: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyCfg> = {
  rookie: {
    id: "rookie",
    name: "Rookie",
    tagline: "Relaxed CPU · strong aim assist",
    aiSpeed: 2.6,
    aiError: 0.11,
    aiPower: 0.32,
    aiMissRate: 0.22,
    cornerBias: 0.2,
    aimClamp: 0.68,
    depthClamp: 1.26,
    mishit: 0.12,
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Fast rallies · corners · real risk",
    aiSpeed: 4.2,
    aiError: 0.06,
    aiPower: 0.55,
    aiMissRate: 0.1,
    cornerBias: 0.5,
    aimClamp: 0.82,
    depthClamp: 1.42,
    mishit: 0.4,
  },
  legend: {
    id: "legend",
    name: "Legend",
    tagline: "Lightning CPU · heavy spin · no mercy",
    aiSpeed: 6.2,
    aiError: 0.03,
    aiPower: 0.78,
    aiMissRate: 0.04,
    cornerBias: 0.7,
    aimClamp: 0.92,
    depthClamp: 1.5,
    mishit: 0.6,
  },
};

export type DrillRule = "return" | "target" | "topspin" | "smash" | "rally";

export interface DrillCfg {
  id: string;
  name: string;
  short: string;
  desc: string;
  tip: string;
  goal: number;
  rule: DrillRule;
  feedSpeed: number;
  feedSpread: number;
  /** spin applied to feeds (x-axis, rad/s). Negative = backspin for a ball coming at you */
  feedSpin: number;
  lob: boolean;
}

export const DRILLS: DrillCfg[] = [
  {
    id: "timing",
    name: "Timing Basics",
    short: "TIMING",
    desc: "Return 10 feeds onto the table. Meet the ball in the centre of the bat.",
    tip: "Move the bat under the ball, then swipe forward on contact.",
    goal: 10,
    rule: "return",
    feedSpeed: 0.35,
    feedSpread: 0.3,
    feedSpin: 0,
    lob: false,
  },
  {
    id: "angles",
    name: "Angle Control",
    short: "ANGLES",
    desc: "Land the ball in the glowing target zone. Hit 6 targets.",
    tip: "Hit the ball with the bat's left/right edge or swipe sideways to angle it.",
    goal: 6,
    rule: "target",
    feedSpeed: 0.4,
    feedSpread: 0.45,
    feedSpin: 0,
    lob: false,
  },
  {
    id: "topspin",
    name: "Topspin Loop",
    short: "TOPSPIN",
    desc: "Backspin feeds incoming. Loop 6 balls with heavy topspin.",
    tip: "Swipe UP fast through the ball — the ball will dip onto the table.",
    goal: 6,
    rule: "topspin",
    feedSpeed: 0.3,
    feedSpread: 0.35,
    feedSpin: -110,
    lob: false,
  },
  {
    id: "smash",
    name: "Smash Attack",
    short: "SMASH",
    desc: "High lobs incoming. Kill 6 of them with a smash over 30 km/h.",
    tip: "Raise the bat to the ball and swipe DOWN hard as it drops.",
    goal: 6,
    rule: "smash",
    feedSpeed: 0.35,
    feedSpread: 0.35,
    feedSpin: 0,
    lob: true,
  },
  {
    id: "rally",
    name: "Pro Rally",
    short: "RALLY",
    desc: "Keep a rally with the CPU alive for 20 consecutive hits.",
    tip: "Consistency beats power. Aim for the middle and stay relaxed.",
    goal: 20,
    rule: "rally",
    feedSpeed: 0.4,
    feedSpread: 0.3,
    feedSpin: 0,
    lob: false,
  },
];

export type GameMode =
  | { kind: "match"; difficulty: Difficulty; pointsToWin: number }
  | { kind: "drill"; drill: DrillCfg };

export type Phase = "ready" | "toss" | "rally" | "point" | "over";
export type Side = "player" | "ai";

export interface Message {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
}

export interface GameSnapshot {
  phase: Phase;
  paused: boolean;
  scores: { player: number; ai: number };
  server: Side;
  rally: number;
  bestRally: number;
  lastSpeedKmh: number;
  maxSpeedKmh: number;
  drillProgress: number;
  drillGoal: number;
  drillMisses: number;
  message: Message | null;
  hint: string;
  result: null | { won: boolean; stars: number };
}

export interface Progress {
  [drillId: string]: number; // stars
}

const KEY = "ppf_progress_v1";

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
