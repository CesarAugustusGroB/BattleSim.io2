import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BattleCanvas } from './components/BattleCanvas';
import { Controls } from './components/Controls';
import { SimulationEngine } from './services/simulation';
import { Team, UnitType, GameStateStats } from './types';
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
  const [spawnCount, setSpawnCount] = useState<number>(10);

  // Stats for Gemini
  const getFullStats = useCallback((): GameStateStats => {
    const sim = simulationRef.current;
    const stats: GameStateStats = {
      redCount: 0,
      blueCount: 0,
      redComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0 },
      blueComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0 }
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

  const handleSpawn = (x: number, y: number) => {
    simulationRef.current.spawnFormation(x, y, selectedTeam, selectedUnit, spawnCount);
  };

  const handleReset = () => {
    simulationRef.current.reset();
    setStats({ red: 0, blue: 0 });
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
      />
    </div>
  );
}

export default App;