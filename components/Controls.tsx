import React from 'react';
import { UnitType, Team } from '../types';
import { Play, Pause, RotateCcw, Swords, Shield, Crosshair, Zap } from 'lucide-react';

interface ControlsProps {
  isRunning: boolean;
  onTogglePause: () => void;
  onReset: () => void;
  selectedTeam: Team;
  setSelectedTeam: (t: Team) => void;
  selectedUnit: UnitType;
  setSelectedUnit: (u: UnitType) => void;
  spawnCount: number;
  setSpawnCount: (n: number) => void;
  stats: { red: number; blue: number };
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  onTogglePause,
  onReset,
  selectedTeam,
  setSelectedTeam,
  selectedUnit,
  setSelectedUnit,
  spawnCount,
  setSpawnCount,
  stats
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/90 backdrop-blur-md border-t border-neutral-700 p-4 text-white z-10 flex flex-wrap items-center justify-between gap-4">
      
      {/* Simulation Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePause}
          className={`p-3 rounded-full transition-colors ${isRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {isRunning ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          onClick={onReset}
          className="p-3 bg-neutral-700 rounded-full hover:bg-neutral-600 transition-colors"
        >
          <RotateCcw size={20} />
        </button>
        <div className="ml-4 flex flex-col text-xs font-mono text-neutral-400">
           <span className="text-red-400">RED: {stats.red}</span>
           <span className="text-blue-400">BLUE: {stats.blue}</span>
        </div>
      </div>

      {/* Spawn Controls */}
      <div className="flex flex-1 justify-center gap-6 items-center">
        {/* Team Select */}
        <div className="flex bg-neutral-800 rounded-lg p-1">
           <button 
             onClick={() => setSelectedTeam(Team.RED)}
             className={`px-4 py-2 rounded-md font-bold transition-all flex flex-col items-center ${selectedTeam === Team.RED ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}
           >
             <span>RED</span>
             <span className="text-[10px] opacity-60 font-mono">(Q)</span>
           </button>
           <button 
             onClick={() => setSelectedTeam(Team.BLUE)}
             className={`px-4 py-2 rounded-md font-bold transition-all flex flex-col items-center ${selectedTeam === Team.BLUE ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
           >
             <span>BLUE</span>
             <span className="text-[10px] opacity-60 font-mono">(W)</span>
           </button>
        </div>

        {/* Unit Select */}
        <div className="flex gap-2">
            {[
                { type: UnitType.SOLDIER, icon: Swords, label: 'Soldier', key: 'A' },
                { type: UnitType.TANK, icon: Shield, label: 'Tank', key: 'S' },
                { type: UnitType.ARCHER, icon: Crosshair, label: 'Archer', key: 'D' },
                { type: UnitType.CAVALRY, icon: Zap, label: 'Cavalry', key: 'C' }
            ].map((u) => (
                <button
                    key={u.type}
                    onClick={() => setSelectedUnit(u.type)}
                    className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg border-2 transition-all ${selectedUnit === u.type ? 'border-neutral-200 bg-neutral-700' : 'border-transparent bg-neutral-800 hover:bg-neutral-750'}`}
                >
                    <u.icon className="mb-1" size={24} />
                    <span className="text-xs">
                      {u.label} <span className="opacity-50 font-mono">({u.key})</span>
                    </span>
                </button>
            ))}
        </div>

        {/* Count Slider */}
        <div className="flex flex-col w-32">
            <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-neutral-400">Batch Size</label>
                <input
                    type="number"
                    min="1"
                    max="100"
                    value={spawnCount}
                    onChange={(e) => setSpawnCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-12 bg-neutral-800 text-white text-xs border border-neutral-700 rounded px-1 text-center focus:outline-none focus:border-indigo-500"
                />
            </div>
            <input 
                type="range" 
                min="1" 
                max="100" 
                value={spawnCount} 
                onChange={(e) => setSpawnCount(parseInt(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
            />
        </div>
      </div>
    </div>
  );
};