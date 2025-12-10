import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BattleCanvas } from './components/BattleCanvas';
import { Controls } from './components/Controls';
import { SimulationEngine } from './services/simulation';
import { Team, UnitType, GameStateStats, TeamStrategy } from './types';
import { StrategyAdvisor } from './components/StrategyAdvisor';

function App() {
  // Use Ref for simulation to avoid re-renders on every tick
  const simulationRef = useRef<SimulationEngine>(new SimulationEngine());

  // React state for UI updates (lower frequency)
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState({ red: 0, blue: 0 });

  // Selection State
  const [selectedTeam, setSelectedTeam] = useState<Team>(Team.BLUE);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>(UnitType.SOLDIER);
  const [spawnCount, setSpawnCount] = useState<number>(100);

  // Strategy State
  const [redStrategy, setRedStrategy] = useState<TeamStrategy>(TeamStrategy.ATTACK);
  const [blueStrategy, setBlueStrategy] = useState<TeamStrategy>(TeamStrategy.ATTACK);

  // Stats for Gemini
  const getFullStats = useCallback((): GameStateStats => {
    const sim = simulationRef.current;
    const stats: GameStateStats = {
      redCount: 0,
      blueCount: 0,
      redComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 },
      blueComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 }
    };

    for (const unit of sim.units.values()) {
      if (unit.team === Team.RED) {
        stats.redCount++;
        stats.redComposition[unit.type]++;
      } else {
        stats.blueCount++;
        stats.blueComposition[unit.type]++;
      }
    }
    return stats;
  }, []);

  // Loop
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      if (isRunning) {
        simulationRef.current.update();
      }

      // Update UI stats every 10 frames to save React renders
      if (simulationRef.current.frame % 10 === 0) {
        let red = 0;
        let blue = 0;
        for (const u of simulationRef.current.units.values()) {
          if (u.team === Team.RED) red++; else blue++;
        }
        setStats({ red, blue });
      }

      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isRunning]);

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
          simulationRef.current.reset();
          setStats({ red: 0, blue: 0 });
          break;
      }

      // Army Presets (Shift + 1-5)
      if (e.shiftKey) {
        const presetKey = parseInt(e.key);
        if (presetKey >= 1 && presetKey <= 5) {
          const centerX = 200 + Math.random() * (1600);
          const centerY = 200 + Math.random() * (1100);
          const sim = simulationRef.current;

          switch (presetKey) {
            case 1: // 50 Soldiers
              sim.spawnFormation(centerX, centerY, selectedTeam, UnitType.SOLDIER, 50);
              break;
            case 2: // 15 Tanks
              sim.spawnFormation(centerX, centerY, selectedTeam, UnitType.TANK, 15);
              break;
            case 3: // 30 Archers
              sim.spawnFormation(centerX, centerY, selectedTeam, UnitType.ARCHER, 30);
              break;
            case 4: // 25 Cavalry
              sim.spawnFormation(centerX, centerY, selectedTeam, UnitType.CAVALRY, 25);
              break;
            case 5: // Mixed army
              sim.spawnFormation(centerX - 50, centerY, selectedTeam, UnitType.SOLDIER, 20);
              sim.spawnFormation(centerX + 50, centerY, selectedTeam, UnitType.TANK, 5);
              sim.spawnFormation(centerX, centerY - 60, selectedTeam, UnitType.ARCHER, 15);
              sim.spawnFormation(centerX, centerY + 60, selectedTeam, UnitType.CAVALRY, 10);
              break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTeam]);



  const handleSpawn = (x: number, y: number) => {
    simulationRef.current.spawnFormation(x, y, selectedTeam, selectedUnit, spawnCount);
  };

  const handleReset = () => {
    simulationRef.current.reset();
    setStats({ red: 0, blue: 0 });
  };

  const handleStrategyChange = (team: Team, strategy: TeamStrategy) => {
    simulationRef.current.teamStrategies.set(team, strategy);
    if (team === Team.RED) setRedStrategy(strategy);
    else setBlueStrategy(strategy);
  };

  return (
    <div className="w-full h-screen bg-neutral-900 flex flex-col relative overflow-hidden">

      {/* Simulation Layer */}
      <div className="flex-1 relative z-0">
        <BattleCanvas
          simulation={simulationRef.current}
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