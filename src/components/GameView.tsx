import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "../game/Engine";
import { sfx } from "../game/audio";
import { DIFFICULTIES, DRILLS, type GameMode, type GameSnapshot, type Message } from "../game/types";
import { cn } from "../utils/cn";
import { isFullscreen, toggleFullscreen } from "../utils/fullscreen";
import { Stars } from "./Screens";

interface Props {
  mode: GameMode;
  sound: boolean;
  onToggleSound: () => void;
  onQuit: () => void;
  onDrillComplete: (drillId: string, stars: number) => void;
  onNextDrill: (nextId: string) => void;
  onRematch: () => void;
}

function IconButton({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="btn-press glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-lg text-white shadow-lg"
    >
      {children}
    </button>
  );
}

function MenuButton({
  onClick,
  children,
  variant = "ghost",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "blue" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "btn-press w-full rounded-2xl px-5 py-3.5 font-display text-xl italic tracking-wide",
        variant === "primary" && "bg-gradient-to-r from-[#e0443d] to-[#ff7a59] shadow-[0_8px_24px_rgba(224,68,61,0.45)]",
        variant === "blue" && "bg-gradient-to-r from-[#2a63b8] to-[#4f9cff] shadow-[0_8px_24px_rgba(42,99,184,0.45)]",
        variant === "ghost" && "bg-white/10 hover:bg-white/15"
      )}
    >
      {children}
    </button>
  );
}

export function GameView({ mode, sound, onToggleSound, onQuit, onDrillComplete, onNextDrill, onRematch }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [msg, setMsg] = useState<Message | null>(null);
  const [paused, setPaused] = useState(false);
  const [fs, setFs] = useState(isFullscreen());
  const completeRef = useRef(onDrillComplete);
  completeRef.current = onDrillComplete;
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new Engine(host, mode, (s) => setSnap(s));
    engine.onDrillComplete = (stars) => {
      if (mode.kind === "drill") completeRef.current(mode.drill.id, stars);
    };
    engineRef.current = engine;
    (window as unknown as { __ppf?: Engine }).__ppf = engine;
    setPaused(false);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [mode]);

  // transient messages
  const msgId = snap?.message?.id;
  useEffect(() => {
    if (!snap?.message) return;
    setMsg(snap.message);
    const t = setTimeout(() => setMsg(null), 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgId]);

  const pause = useCallback(() => {
    engineRef.current?.setPaused(true);
    setPaused(true);
    sfx.ui();
  }, []);
  const resume = useCallback(() => {
    sfx.init();
    engineRef.current?.setPaused(false);
    setPaused(false);
    sfx.ui();
  }, []);
  const restart = useCallback(() => {
    sfx.init();
    engineRef.current?.restart();
    setPaused(false);
    sfx.ui();
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && !pausedRef.current) pause();
    };
    const onFs = () => setFs(isFullscreen());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        setPaused((p) => {
          if (p) engineRef.current?.setPaused(false);
          else engineRef.current?.setPaused(true);
          return !p;
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [pause]);

  const isDrill = mode.kind === "drill";
  const drill = isDrill ? mode.drill : null;
  const diffName = mode.kind === "match" ? DIFFICULTIES[mode.difficulty].name : "";
  const result = snap?.result ?? null;
  const showHint = !!snap?.hint && !paused && !result;
  const nextDrill = drill ? DRILLS[DRILLS.findIndex((d) => d.id === drill.id) + 1] : undefined;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#9fb7cf]">
      <div ref={hostRef} className="absolute inset-0" />

      {/* ---------------- HUD ---------------- */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <div className="safe-top safe-x flex items-start justify-between gap-2 px-3 pt-3">
          {/* left: pause + score */}
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-start gap-2">
              <IconButton onClick={paused ? resume : pause} label="Pause">
                {paused ? "▶" : "❚❚"}
              </IconButton>
              {snap && (
                <div className="glass flex flex-col rounded-2xl px-3.5 py-1.5 shadow-lg">
                  {!isDrill ? (
                    <>
                      <div className="flex items-center gap-2 font-display text-lg italic leading-none">
                        <span className="flex items-center gap-1 text-[#ff8a80]">
                          <span className={cn("h-1.5 w-1.5 rounded-full bg-amber-300", snap.server === "player" ? "opacity-100" : "opacity-0")} />
                          YOU
                        </span>
                        <span className="text-2xl text-white">{snap.scores.player}</span>
                        <span className="text-white/40">:</span>
                        <span className="text-2xl text-white">{snap.scores.ai}</span>
                        <span className="flex items-center gap-1 text-[#8ec5ff]">
                          CPU
                          <span className={cn("h-1.5 w-1.5 rounded-full bg-amber-300", snap.server === "ai" ? "opacity-100" : "opacity-0")} />
                        </span>
                      </div>
                      <div className="mt-0.5 text-[9px] font-semibold tracking-widest text-white/60">
                        {diffName.toUpperCase()} · FIRST TO {mode.kind === "match" ? mode.pointsToWin : 11}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 font-display text-lg italic leading-none">
                        <span className="text-[#8ec5ff]">{drill!.short}</span>
                        <span className="text-2xl">
                          {snap.drillProgress}
                          <span className="text-white/50"> / {snap.drillGoal}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-all duration-300"
                          style={{ width: `${Math.min(100, (snap.drillProgress / Math.max(1, snap.drillGoal)) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-[9px] font-semibold tracking-widest text-white/60">MISSES {snap.drillMisses}</div>
                    </>
                  )}
                </div>
              )}
            </div>
            {snap && !paused && !result && (
              <span
                className={cn(
                  "rounded-full bg-black/30 px-3 py-1 text-xs font-bold tracking-wider text-white/90 transition-opacity",
                  snap.rally >= 4 ? "opacity-100" : "opacity-0"
                )}
              >
                RALLY {snap.rally}
              </span>
            )}
          </div>

          {/* right: fullscreen + speed */}
          <div className="flex flex-col items-end gap-2">
            <IconButton onClick={() => void toggleFullscreen()} label="Fullscreen">
              {fs ? "⤡" : "⛶"}
            </IconButton>
            {snap && !paused && !result && (
              <span
                className={cn(
                  "rounded-full bg-black/30 px-3 py-1 text-xs font-bold tracking-wider text-white/90 transition-opacity",
                  snap.lastSpeedKmh > 0 ? "opacity-100" : "opacity-0"
                )}
              >
                {snap.lastSpeedKmh} km/h
              </span>
            )}
          </div>
        </div>

        {/* centre message */}
        <div className="flex flex-1 items-center justify-center">
          {msg && !paused && !result && (
            <div
              key={msg.id}
              className={cn(
                "msg-pop font-display text-5xl italic text-stroke sm:text-6xl",
                msg.tone === "good" && "text-amber-300",
                msg.tone === "bad" && "text-[#ff6b6b]",
                msg.tone === "info" && "text-white"
              )}
            >
              {msg.text}
            </div>
          )}
        </div>

        {/* hint */}
        <div className="safe-bottom flex justify-center px-4 pb-6">
          {showHint && (
            <div className="pulse-soft glass rounded-full px-5 py-2 text-center text-sm font-bold tracking-wide text-white">
              {snap!.hint}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Pause ---------------- */}
      {paused && !result && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b1526]/70 p-5 backdrop-blur-sm">
          <div className="fade-up glass w-full max-w-xs rounded-3xl p-5">
            <div className="font-display text-center text-4xl italic text-stroke">PAUSED</div>
            <div className="mt-5 flex flex-col gap-2.5">
              <MenuButton onClick={resume} variant="primary">
                RESUME
              </MenuButton>
              <MenuButton onClick={restart}>RESTART</MenuButton>
              <MenuButton onClick={onToggleSound}>{sound ? "🔊 SOUND ON" : "🔇 SOUND OFF"}</MenuButton>
              <MenuButton onClick={onQuit}>QUIT TO MENU</MenuButton>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Result ---------------- */}
      {result && snap && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b1526]/70 p-5 backdrop-blur-sm">
          <div className="fade-up glass w-full max-w-sm rounded-3xl p-6 text-center">
            {!isDrill ? (
              <>
                <div className="text-xs font-bold tracking-[0.3em] text-white/60">{diffName.toUpperCase()} MATCH</div>
                <div
                  className={cn(
                    "font-display mt-1 text-5xl italic text-stroke",
                    result.won ? "text-amber-300" : "text-[#ff6b6b]"
                  )}
                >
                  {result.won ? "VICTORY!" : "DEFEAT"}
                </div>
                <div className="font-display mt-3 text-4xl italic">
                  <span className="text-[#ff8a80]">{snap.scores.player}</span>
                  <span className="mx-3 text-white/40">:</span>
                  <span className="text-[#8ec5ff]">{snap.scores.ai}</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-bold tracking-[0.3em] text-white/60">{drill!.name.toUpperCase()}</div>
                <div className="font-display mt-1 text-5xl italic text-amber-300 text-stroke">DRILL COMPLETE</div>
                <div className="mt-3">
                  <Stars n={result.stars} size="text-5xl" animate />
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {snap.drillMisses} miss{snap.drillMisses === 1 ? "" : "es"} · {result.stars === 3 ? "flawless form!" : result.stars === 2 ? "solid — tighten it up for 3 stars" : "keep practising"}
                </div>
              </>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 text-left">
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] font-bold tracking-widest text-white/50">TOP SHOT</div>
                <div className="font-display text-2xl italic">{snap.maxSpeedKmh} km/h</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] font-bold tracking-widest text-white/50">BEST RALLY</div>
                <div className="font-display text-2xl italic">{Math.max(snap.bestRally, snap.rally)} hits</div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {isDrill && nextDrill && (
                <MenuButton onClick={() => onNextDrill(nextDrill.id)} variant="blue">
                  NEXT: {nextDrill.name.toUpperCase()}
                </MenuButton>
              )}
              <MenuButton onClick={isDrill ? restart : onRematch} variant={isDrill && nextDrill ? "ghost" : "primary"}>
                {isDrill ? "RETRY DRILL" : "REMATCH"}
              </MenuButton>
              <MenuButton onClick={onQuit}>MAIN MENU</MenuButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
