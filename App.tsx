import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BattleCanvas } from './components/BattleCanvas';
import { Controls } from './components/Controls';
import { Team, UnitType, GameStateStats, TeamStrategy, SimState, WorkerMessage, WorkerResponse } from './types';
import { StrategyAdvisor } from './components/StrategyAdvisor';
// Import Worker using Vite's suffix syntax
// @ts-ignore - handled by Vite
import SimWorker from './workers/simulation.worker?worker';

function App() {
  // Worker Reference
  const workerRef = useRef<Worker | null>(null);

  // Game/Simulation State (Ref for high-frequency updates, passed to Canvas)
  // We pass this Mutable Ref to BattleCanvas so it can read the latest state in its render loop
  // without triggering React re-renders.
  const simulationStateStore = useRef<SimState | null>(null);

  // React state for UI updates (lower frequency)
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState<GameStateStats>({
    redCount: 0, blueCount: 0,
    redComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 },
    blueComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 }
  });


  // Stats for Gemini (Memoized to read from last stats)
  const getFullStats = useCallback((): GameStateStats => {
    return stats;
  }, [stats]);


  // Initialize Worker
  useEffect(() => {
    const worker = new SimWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'TICK') {
        // Update the store for the Canvas
        simulationStateStore.current = msg.payload;

        // Throttle UI updates (e.g. every 10 frames)
        if (msg.payload.frame % 10 === 0) {
          setStats(msg.payload.stats);
        }
      }
    };

    // Start Simulation
    worker.postMessage({ type: 'START' });

    return () => {
      worker.terminate();
    };
  }, []);

  // Play/Pause
  useEffect(() => {
    if (!workerRef.current) return;
    if (isRunning) workerRef.current.postMessage({ type: 'START' });
    else workerRef.current.postMessage({ type: 'PAUSE' });
  }, [isRunning]);


  // Selection State
  const [selectedTeam, setSelectedTeam] = useState<Team>(Team.BLUE);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>(UnitType.SOLDIER);
  const [spawnCount, setSpawnCount] = useState<number>(100);

  // Strategy State
  const [redStrategy, setRedStrategy] = useState<TeamStrategy>(TeamStrategy.ATTACK);
  const [blueStrategy, setBlueStrategy] = useState<TeamStrategy>(TeamStrategy.ATTACK);


  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        // Toggle Faction
        case 'q':
          setSelectedTeam(prev => prev === Team.RED ? Team.BLUE : Team.RED);
          break;

        // Unit Selection
        case '1':
          if (!e.shiftKey) setSelectedUnit(UnitType.SOLDIER);
          break;
        case '2':
          if (!e.shiftKey) setSelectedUnit(UnitType.TANK);
          break;
        case '3':
          if (!e.shiftKey) setSelectedUnit(UnitType.ARCHER);
          break;
        case '4':
          if (!e.shiftKey) setSelectedUnit(UnitType.CAVALRY);
          break;

        // Pause/Unpause
        case ' ':
          e.preventDefault(); // Prevent page scroll
          setIsRunning(prev => !prev);
          break;
        // Reset
        case 'r':
          handleReset();
          break;
      }

      // Army Presets (Shift + 1-5)
      if (e.shiftKey) {
        const presetKey = parseInt(e.key);
        if (presetKey >= 1 && presetKey <= 5) {
          const centerX = 200 + Math.random() * (1600);
          const centerY = 200 + Math.random() * (1100);

          if (!workerRef.current) return;
          const msg = (type: UnitType, count: number, x: number, y: number) =>
            workerRef.current!.postMessage({
              type: 'SPAWN',
              payload: { x, y, team: selectedTeam, type, count }
            });

          switch (presetKey) {
            case 1: msg(UnitType.SOLDIER, 50, centerX, centerY); break;
            case 2: msg(UnitType.TANK, 15, centerX, centerY); break;
            case 3: msg(UnitType.ARCHER, 30, centerX, centerY); break;
            case 4: msg(UnitType.CAVALRY, 25, centerX, centerY); break;
            case 5: // Mixed - multiple calls
              msg(UnitType.SOLDIER, 20, centerX - 50, centerY);
              msg(UnitType.TANK, 5, centerX + 50, centerY);
              msg(UnitType.ARCHER, 15, centerX, centerY - 60);
              msg(UnitType.CAVALRY, 10, centerX, centerY + 60);
              break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTeam]);


  const handleSpawn = (x: number, y: number) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({
      type: 'SPAWN',
      payload: { x, y, team: selectedTeam, type: selectedUnit, count: spawnCount }
    });
  };

  const handleReset = () => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'RESET' });
    setStats({
      redCount: 0, blueCount: 0,
      redComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 },
      blueComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 }
    });
  };

  const handleStrategyChange = (team: Team, strategy: TeamStrategy) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({
      type: 'UPDATE_STRATEGY',
      payload: { team, strategy }
    });
    if (team === Team.RED) setRedStrategy(strategy);
    else setBlueStrategy(strategy);
  };

  return (
    <div className="w-full h-screen bg-neutral-900 flex flex-col relative overflow-hidden">

      {/* Simulation Layer */}
      <div className="flex-1 relative z-0">
        <BattleCanvas
          gameStateRef={simulationStateStore}
          onSelectPos={handleSpawn}
        />
      </div>

      {/* Thinking Mode Advisor */}
      <StrategyAdvisor getStats={getFullStats} />

      {/* UI Layer */}
      <Controls
        isRunning={isRunning}
        onTogglePause={() => setIsRunning(!isRunning)}
        onReset={handleReset}
        selectedTeam={selectedTeam}
        setSelectedTeam={setSelectedTeam}
        selectedUnit={selectedUnit}
        setSelectedUnit={setSelectedUnit}
        spawnCount={spawnCount}
        setSpawnCount={setSpawnCount}
        stats={stats}
        redStrategy={redStrategy}
        blueStrategy={blueStrategy}
        onStrategyChange={handleStrategyChange}
      />
    </div>
  );
}

export default App;