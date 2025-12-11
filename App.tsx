import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BattleCanvas } from './components/BattleCanvas';
import { Controls } from './components/Controls';
import { Team, UnitType, GameStateStats, TeamStrategy, SimState, WorkerMessage, WorkerResponse, TerrainType, TerrainMap } from './types';
import { DEFAULT_GRID_SIZE } from './constants';
import { StrategyAdvisor } from './components/StrategyAdvisor';
// Import Worker using Vite's suffix syntax
// @ts-ignore - handled by Vite
import SimWorker from './workers/simulation.worker?worker';

function App() {
  // Worker Reference
  const workerRef = useRef<Worker | null>(null);

  // Game/Simulation State (Ref for high-frequency updates, passed to Canvas)
  const simulationStateStore = useRef<SimState | null>(null);

  // React state for UI updates
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState<GameStateStats>({
    redCount: 0, blueCount: 0,
    redComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 },
    blueComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 }
  });

  // Edit Mode State
  const [editMode, setEditMode] = useState<'UNITS' | 'TERRAIN'>('UNITS');
  const [selectedTerrain, setSelectedTerrain] = useState<TerrainType>(TerrainType.WALL);
  const [gridSize, setGridSize] = useState<number>(DEFAULT_GRID_SIZE);
  const [brushSize, setBrushSize] = useState<number>(1);

  // Selection State
  const [selectedTeam, setSelectedTeam] = useState<Team>(Team.BLUE);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>(UnitType.SOLDIER);
  const [spawnCount, setSpawnCount] = useState<number>(100);

  // Strategy State
  const [redStrategy, setRedStrategy] = useState<TeamStrategy>(TeamStrategy.ATTACK);
  const [blueStrategy, setBlueStrategy] = useState<TeamStrategy>(TeamStrategy.ATTACK);

  // Stats for Gemini
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
        simulationStateStore.current = msg.payload;
        if (msg.payload.frame % 10 === 0) {
          setStats(msg.payload.stats);
        }
      }
    };

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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'q':
          setSelectedTeam(prev => prev === Team.RED ? Team.BLUE : Team.RED);
          break;
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
        case ' ':
          e.preventDefault();
          setIsRunning(prev => !prev);
          break;
        case 'r':
          handleReset();
          break;
      }

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
            case 5:
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

    if (editMode === 'UNITS') {
      workerRef.current.postMessage({
        type: 'SPAWN',
        payload: { x, y, team: selectedTeam, type: selectedUnit, count: spawnCount }
      });
    } else {
      // Terrain Calculation (HEX KEY)
      // Math duplicate from SpatialGrid :(
      // x = size * sqrt(3) * (col + 0.5 * (row&1)) is pixel to hex? No that's Hex to Pixel.
      // Pixel to Hex:
      // q = (sqrt(3)/3 * x - 1/3 * y) / size
      // r = (2/3 * y) / size
      const size = gridSize;
      const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
      const r = (2 / 3 * y) / size;

      const cubeRound = (fracQ: number, fracR: number) => {
        const fracS = -fracQ - fracR;
        let q = Math.round(fracQ);
        let r = Math.round(fracR);
        let s = Math.round(fracS);
        const q_diff = Math.abs(q - fracQ);
        const r_diff = Math.abs(r - fracR);
        const s_diff = Math.abs(s - fracS);
        if (q_diff > r_diff && q_diff > s_diff) q = -r - s;
        else if (r_diff > s_diff) r = -q - s;
        return { q, r };
      };

      const ax = cubeRound(q, r);
      // Axial to Offset
      const col = ax.q + (ax.r - (ax.r & 1)) / 2;
      const row = ax.r;

      const index = row * 5000 + col;

      workerRef.current.postMessage({
        type: 'EDIT_TERRAIN',
        payload: { cellIndex: index, type: selectedTerrain, brushSize }
      });
    }
  };

  const handleGridSizeChange = (size: number) => {
    setGridSize(size);
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'SET_GRID_SIZE', payload: size });
  };

  const handleReset = () => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'RESET' });
    // Reset stats but maybe keep grid size?
    // Simulation.reset() clears units but not grid size setting in engine (though it clears valid cells). 
    // Simulation engine `reset` clears units, particles, etc.
    // However, `setGridSize` also clears terrain.
    // If we want to clear terrain on Reset, we might want a separate message or implicit.
    // For now, Reset clears units. Terrain clearing logic:
    // User might want to clear units but keep terrain.
    // Let's keep terrain on RESET based on `simulation.ts` logic?
    // `simulation.reset()`:
    //   this.units.clear();
    //   this.unitsArray = [];
    //   this.particles = [];
    //   this.grid.clear(); (This clears spatial grid for units)
    //   this.frame = 0;
    // It DOES NOT clear `this.terrain`. Good.

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
          editMode={editMode}
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

        // New Props
        editMode={editMode}
        setEditMode={setEditMode}
        selectedTerrain={selectedTerrain}
        setSelectedTerrain={setSelectedTerrain}
        gridSize={gridSize}
        onGridSizeChange={handleGridSizeChange}
      />
    </div>
  );
}

export default App;