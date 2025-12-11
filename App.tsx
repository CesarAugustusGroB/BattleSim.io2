import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BattleCanvas } from './components/BattleCanvas';
import { Controls } from './components/Controls';
import { SimulationEngine } from './services/simulation';
import { Team, UnitType, GameStateStats, OrderType, MapTool } from './types';
import { StrategyAdvisor } from './components/StrategyAdvisor';

function App() {
  // Use Ref for simulation to avoid re-renders on every tick
  const simulationRef = useRef<SimulationEngine>(new SimulationEngine());
  
  // React state for UI updates (lower frequency)
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState({ red: 0, blue: 0 });
  const [debugMode, setDebugMode] = useState(false);
  const [teamOrders, setTeamOrders] = useState({ [Team.RED]: OrderType.ATTACK, [Team.BLUE]: OrderType.ATTACK });
  
  // Selection State
  const [selectedTeam, setSelectedTeam] = useState<Team>(Team.BLUE);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>(UnitType.SOLDIER);
  const [spawnCount, setSpawnCount] = useState<number>(100);

  // Editor State
  const [isMapMode, setIsMapMode] = useState(false);
  const [mapTool, setMapTool] = useState<MapTool>(MapTool.HILL);

  // Stats for Gemini
  const getFullStats = useCallback((): GameStateStats => {
    const sim = simulationRef.current;
    const stats: GameStateStats = {
      redCount: 0,
      blueCount: 0,
      redComposition: { 
        [UnitType.SOLDIER]: 0, 
        [UnitType.TANK]: 0, 
        [UnitType.ARCHER]: 0, 
        [UnitType.CAVALRY]: 0,
        [UnitType.HQ]: 0 
      },
      blueComposition: { 
        [UnitType.SOLDIER]: 0, 
        [UnitType.TANK]: 0, 
        [UnitType.ARCHER]: 0, 
        [UnitType.CAVALRY]: 0,
        [UnitType.HQ]: 0 
      }
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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'q': setSelectedTeam(Team.RED); break;
        case 'w': setSelectedTeam(Team.BLUE); break;
        case 'a': setSelectedUnit(UnitType.SOLDIER); break;
        case 's': setSelectedUnit(UnitType.TANK); break;
        case 'd': setSelectedUnit(UnitType.ARCHER); break;
        case 'c': setSelectedUnit(UnitType.CAVALRY); break;
        case 'b': setSelectedUnit(UnitType.HQ); break;
        case 'h': setDebugMode(prev => !prev); break;
        case 'm': setIsMapMode(prev => !prev); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    if (isMapMode) {
        if (mapTool === MapTool.HILL) {
           simulationRef.current.addTerrainZone(x, y, 250, 1);
        } else if (mapTool === MapTool.HQ) {
           simulationRef.current.spawnUnit(x, y, selectedTeam, UnitType.HQ);
        } else if (mapTool === MapTool.ERASER) {
           simulationRef.current.removeEntityAt(x, y);
        }
    } else {
        // Unit Spawner
        simulationRef.current.spawnFormation(x, y, selectedTeam, selectedUnit, spawnCount);
    }
  };

  const handleReset = () => {
    simulationRef.current.reset();
    setStats({ red: 0, blue: 0 });
    // Reset orders
    simulationRef.current.setOrder(Team.RED, OrderType.ATTACK);
    simulationRef.current.setOrder(Team.BLUE, OrderType.ATTACK);
    setTeamOrders({ [Team.RED]: OrderType.ATTACK, [Team.BLUE]: OrderType.ATTACK });
  };

  const handleSetOrder = (team: Team, order: OrderType) => {
      simulationRef.current.setOrder(team, order);
      setTeamOrders(prev => ({ ...prev, [team]: order }));
  };

  return (
    <div className="w-full h-screen bg-neutral-900 flex flex-col relative overflow-hidden">
      
      {/* Simulation Layer */}
      <div className="flex-1 relative z-0">
        <BattleCanvas 
          simulation={simulationRef.current} 
          onSelectPos={handleSpawn} 
          debugMode={debugMode}
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
        teamOrders={teamOrders}
        setTeamOrder={handleSetOrder}
        isMapMode={isMapMode}
        onToggleMapMode={() => setIsMapMode(!isMapMode)}
        mapTool={mapTool}
        setMapTool={setMapTool}
      />
    </div>
  );
}

export default App;