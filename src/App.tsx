import { useCallback, useEffect, useState } from "react";
import { GameView } from "./components/GameView";
import { HowToPlay, MainMenu, MatchSetup, TrainingMenu } from "./components/Screens";
import { sfx } from "./game/audio";
import { DRILLS, loadProgress, saveProgress, type Difficulty, type DrillCfg, type GameMode, type Progress } from "./game/types";
import { enterFullscreen, isCoarsePointer, toggleFullscreen } from "./utils/fullscreen";

type Screen =
  | { name: "menu" }
  | { name: "match" }
  | { name: "training" }
  | { name: "howto" }
  | { name: "game"; mode: GameMode; key: number };

const SOUND_KEY = "ppf_sound";

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [sound, setSound] = useState<boolean>(() => localStorage.getItem(SOUND_KEY) !== "0");
  const [gameKey, setGameKey] = useState(0);

  useEffect(() => {
    sfx.setEnabled(sound);
    localStorage.setItem(SOUND_KEY, sound ? "1" : "0");
  }, [sound]);

  const startGame = useCallback(
    (mode: GameMode) => {
      sfx.init();
      sfx.ui();
      if (isCoarsePointer()) void enterFullscreen();
      const k = gameKey + 1;
      setGameKey(k);
      setScreen({ name: "game", mode, key: k });
    },
    [gameKey]
  );

  const startMatch = (difficulty: Difficulty, pointsToWin: number) =>
    startGame({ kind: "match", difficulty, pointsToWin });
  const startDrill = (drill: DrillCfg) => startGame({ kind: "drill", drill });

  const onDrillComplete = useCallback((drillId: string, stars: number) => {
    setProgress((p) => {
      const next = { ...p, [drillId]: Math.max(p[drillId] ?? 0, stars) };
      saveProgress(next);
      return next;
    });
  }, []);

  const goMenu = () => {
    sfx.ui();
    setScreen({ name: "menu" });
  };

  if (screen.name === "game") {
    return (
      <GameView
        key={screen.key}
        mode={screen.mode}
        sound={sound}
        onToggleSound={() => setSound((s) => !s)}
        onQuit={goMenu}
        onDrillComplete={onDrillComplete}
        onNextDrill={(id) => {
          const d = DRILLS.find((x) => x.id === id);
          if (d) startDrill(d);
        }}
        onRematch={() => startGame(screen.mode)}
      />
    );
  }

  if (screen.name === "match") return <MatchSetup onStart={startMatch} onBack={goMenu} />;
  if (screen.name === "training") return <TrainingMenu progress={progress} onStart={startDrill} onBack={goMenu} />;
  if (screen.name === "howto") return <HowToPlay onBack={goMenu} />;

  return (
    <MainMenu
      progress={progress}
      sound={sound}
      onToggleSound={() => {
        sfx.init();
        setSound((s) => !s);
        sfx.ui();
      }}
      onFullscreen={() => void toggleFullscreen()}
      onMatch={() => {
        sfx.init();
        sfx.ui();
        setScreen({ name: "match" });
      }}
      onTraining={() => {
        sfx.init();
        sfx.ui();
        setScreen({ name: "training" });
      }}
      onHowTo={() => {
        sfx.init();
        sfx.ui();
        setScreen({ name: "howto" });
      }}
    />
  );
}
