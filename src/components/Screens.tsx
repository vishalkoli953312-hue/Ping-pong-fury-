import { useState } from "react";
import { cn } from "../utils/cn";
import { DIFFICULTIES, DRILLS, type Difficulty, type DrillCfg, type Progress } from "../game/types";
import heroUrl from "../assets/hero.jpg";

/* ----------------------------------------------------------- shared bits */

export function Stars({ n, size = "text-base", animate = false }: { n: number; size?: string; animate?: boolean }) {
  return (
    <span className={cn("inline-flex gap-0.5", size)}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(i <= n ? "text-amber-300" : "text-white/20", animate && i <= n && "star-in")}
          style={animate ? { animationDelay: `${0.15 * i}s` } : undefined}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-press inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15"
    >
      <span aria-hidden>←</span> Back
    </button>
  );
}

function Shell({
  children,
  title,
  subtitle,
  onBack,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b1526] text-white">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${heroUrl})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1526]/70 via-[#0b1526]/85 to-[#0b1526]" />
      <div className="safe-top safe-bottom safe-x relative z-10 mx-auto flex h-full max-w-xl flex-col px-4">
        <div className="flex items-center justify-between py-2">
          <BackButton onClick={onBack} />
          <span className="font-display text-sm tracking-widest text-white/50">PONG PONG FURY</span>
        </div>
        <h1 className="font-display mt-3 text-4xl italic leading-none text-stroke sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-white/65">{subtitle}</p>}
        <div className="fade-up mt-5 min-h-0 flex-1 overflow-y-auto pb-6 [-webkit-overflow-scrolling:touch]">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- main menu */

export function MainMenu({
  onMatch,
  onTraining,
  onHowTo,
  sound,
  onToggleSound,
  onFullscreen,
  progress,
}: {
  onMatch: () => void;
  onTraining: () => void;
  onHowTo: () => void;
  sound: boolean;
  onToggleSound: () => void;
  onFullscreen: () => void;
  progress: Progress;
}) {
  const stars = Object.values(progress).reduce((a, b) => a + b, 0);
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b1526] text-white">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroUrl})` }} />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1526]/30 via-[#0b1526]/55 to-[#0b1526]" />
      <div className="safe-top safe-bottom safe-x relative z-10 mx-auto flex h-full max-w-md flex-col px-5">
        <div className="flex items-center justify-between py-2 text-xs font-semibold tracking-widest text-white/70">
          <span className="rounded-full bg-white/10 px-3 py-1">3D TABLE TENNIS</span>
          <span className="rounded-full bg-white/10 px-3 py-1">★ {stars} / {DRILLS.length * 3}</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="fade-up">
            <div className="font-display text-5xl italic leading-[0.9] text-white text-stroke sm:text-6xl">
              PONG PONG
            </div>
            <div
              className="font-display mt-1 text-7xl italic leading-[0.9] text-stroke sm:text-8xl"
              style={{
                background: "linear-gradient(90deg,#ff6b6b 0%,#ffd166 50%,#5aa9ff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextStroke: "0px",
                textShadow: "none",
                filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.35)) drop-shadow(0 10px 24px rgba(0,0,0,0.5))",
              }}
            >
              FURY
            </div>
            <p className="mt-4 text-sm text-white/75">Swipe. Spin. Smash. Real-physics ping pong in your pocket.</p>
          </div>
        </div>

        <div className="fade-up flex flex-col gap-3 pb-2" style={{ animationDelay: "0.15s" }}>
          <button
            onClick={onMatch}
            className="btn-press group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#e0443d] to-[#ff7a59] px-5 py-4 text-left shadow-[0_10px_30px_rgba(224,68,61,0.45)]"
          >
            <div className="font-display text-2xl italic tracking-wide">PRO MATCH</div>
            <div className="text-xs font-medium text-white/85">vs CPU · Rookie, Pro & Legend · first to 7 or 11</div>
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl opacity-80 transition group-hover:translate-x-1">🏓</span>
          </button>
          <button
            onClick={onTraining}
            className="btn-press group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2a63b8] to-[#4f9cff] px-5 py-4 text-left shadow-[0_10px_30px_rgba(42,99,184,0.45)]"
          >
            <div className="font-display text-2xl italic tracking-wide">TRAINING</div>
            <div className="text-xs font-medium text-white/85">5 drills · timing, angles, topspin, smash, rally</div>
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl opacity-80 transition group-hover:translate-x-1">🎯</span>
          </button>
          <div className="flex gap-3">
            <button onClick={onHowTo} className="btn-press glass flex-1 rounded-2xl px-4 py-3 text-sm font-semibold">
              How to play
            </button>
            <button
              onClick={onToggleSound}
              className="btn-press glass rounded-2xl px-4 py-3 text-sm font-semibold"
              aria-label="Toggle sound"
            >
              {sound ? "🔊 Sound" : "🔇 Muted"}
            </button>
            <button onClick={onFullscreen} className="btn-press glass rounded-2xl px-4 py-3 text-sm font-semibold" aria-label="Fullscreen">
              ⛶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- match setup */

export function MatchSetup({ onStart, onBack }: { onStart: (d: Difficulty, pts: number) => void; onBack: () => void }) {
  const [diff, setDiff] = useState<Difficulty>("pro");
  const [pts, setPts] = useState(11);
  const colors: Record<Difficulty, string> = {
    rookie: "from-emerald-500/30 to-emerald-500/5 border-emerald-400/60",
    pro: "from-amber-500/30 to-amber-500/5 border-amber-400/60",
    legend: "from-rose-500/30 to-rose-500/5 border-rose-400/60",
  };
  return (
    <Shell title="PRO MATCH" subtitle="Pick your opponent. Points are won when the ball bounces twice, goes out or hits the net. 2 serves each." onBack={onBack}>
      <div className="grid gap-3">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((k) => {
          const d = DIFFICULTIES[k];
          const active = diff === k;
          return (
            <button
              key={k}
              onClick={() => setDiff(k)}
              className={cn(
                "btn-press rounded-2xl border bg-gradient-to-r p-4 text-left transition",
                active ? colors[k] : "border-white/10 from-white/5 to-white/0 opacity-70 hover:opacity-100"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl italic">{d.name.toUpperCase()}</span>
                <span className={cn("h-4 w-4 rounded-full border-2", active ? "border-white bg-white" : "border-white/40")} />
              </div>
              <div className="mt-1 text-xs text-white/70">{d.tagline}</div>
              <div className="mt-2 flex gap-3 text-[11px] font-semibold text-white/60">
                <span>CPU speed {d.aiSpeed.toFixed(1)} m/s</span>
                <span>Accuracy {Math.round((1 - d.aiError / 0.12) * 100)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold tracking-widest text-white/60">MATCH LENGTH</div>
        <div className="grid grid-cols-2 gap-3">
          {[7, 11].map((n) => (
            <button
              key={n}
              onClick={() => setPts(n)}
              className={cn(
                "btn-press rounded-xl border px-4 py-3 font-display text-xl italic",
                pts === n ? "border-white bg-white/15" : "border-white/10 bg-white/5 text-white/70"
              )}
            >
              FIRST TO {n}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onStart(diff, pts)}
        className="btn-press mt-6 w-full rounded-2xl bg-gradient-to-r from-[#e0443d] to-[#ff7a59] py-4 font-display text-2xl italic tracking-wide shadow-[0_10px_30px_rgba(224,68,61,0.45)]"
      >
        START MATCH
      </button>
    </Shell>
  );
}

/* ----------------------------------------------------------- training */

export function TrainingMenu({
  progress,
  onStart,
  onBack,
}: {
  progress: Progress;
  onStart: (d: DrillCfg) => void;
  onBack: () => void;
}) {
  return (
    <Shell title="TRAINING" subtitle="Dedicated drills to sharpen timing, angles and pro-level shots. Earn up to 3 stars per drill." onBack={onBack}>
      <div className="grid gap-3">
        {DRILLS.map((d, i) => (
          <button
            key={d.id}
            onClick={() => onStart(d)}
            className="btn-press flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
          >
            <div className="font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2a63b8] to-[#4f9cff] text-xl italic">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display truncate text-xl italic">{d.name.toUpperCase()}</span>
                <Stars n={progress[d.id] ?? 0} />
              </div>
              <div className="mt-0.5 text-xs text-white/70">{d.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------- how to play */

export function HowToPlay({ onBack }: { onBack: () => void }) {
  const rows: [string, string, string][] = [
    ["👆", "Move", "Drag anywhere in the lower screen – the red bat follows your finger (or mouse) in all directions."],
    ["💨", "Power", "Swipe through the ball as it arrives. Faster swipe = faster, deeper shot."],
    ["🌀", "Topspin", "Swipe UP through the ball to loop with topspin. The ball dips hard onto the table."],
    ["💥", "Smash", "When the ball is high, swipe DOWN fast to smash it. Watch the white trail!"],
    ["↔️", "Angles", "Hit with the left/right edge of the bat, or swipe sideways, to angle the ball into the corners."],
    ["🏓", "Serve", "Tap to toss the ball, then swipe as it drops to serve. Serves bounce on your side first."],
    ["🥇", "Scoring", "Point when the opponent misses, hits the net, or sends it out. 2 serves each, win by 2."],
  ];
  return (
    <Shell title="HOW TO PLAY" subtitle="Everything you need to go from rookie to legend." onBack={onBack}>
      <div className="grid gap-2.5">
        {rows.map(([icon, t, d]) => (
          <div key={t} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <div className="text-2xl">{icon}</div>
            <div>
              <div className="font-display text-lg italic">{t.toUpperCase()}</div>
              <div className="text-xs text-white/70">{d}</div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
