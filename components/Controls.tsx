import React from 'react';
import { UnitType, Team, TeamStrategy, GameStateStats, TerrainType } from '../types';
import { Play, Pause, RotateCcw, Swords, Shield, Crosshair, Zap, Sword, Shield as ShieldIcon, Hammer, Eraser, Trees, BrickWall, Droplets } from 'lucide-react';

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
  stats: GameStateStats;
  redStrategy: TeamStrategy;
  blueStrategy: TeamStrategy;
  onStrategyChange: (team: Team, strategy: TeamStrategy) => void;

  // New Props
  editMode: 'UNITS' | 'TERRAIN';
  setEditMode: (m: 'UNITS' | 'TERRAIN') => void;
  selectedTerrain: TerrainType;
  setSelectedTerrain: (t: TerrainType) => void;
  gridSize: number;
  onGridSizeChange: (n: number) => void;
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
  stats,
  redStrategy,
  blueStrategy,
  onStrategyChange,
  editMode,
  setEditMode,
  selectedTerrain,
  setSelectedTerrain,
  gridSize,
  onGridSizeChange
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
          <span className="text-red-400">RED: {stats.redCount}</span>
          <span className="text-blue-400">BLUE: {stats.blueCount}</span>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex bg-neutral-800 rounded-lg p-1">
        <button
          onClick={() => setEditMode('UNITS')}
          className={`px-3 py-1 rounded text-xs font-bold ${editMode === 'UNITS' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'}`}
        >
          Units
        </button>
        <button
          onClick={() => setEditMode('TERRAIN')}
          className={`px-3 py-1 rounded text-xs font-bold ${editMode === 'TERRAIN' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}`}
        >
          Map
        </button>
      </div>

      {/* Dynamic Main Controls */}
      <div className="flex flex-1 justify-center gap-6 items-center">

        {editMode === 'UNITS' ? (
          <>
            {/* Team Select */}
            <div className="flex bg-neutral-800 rounded-lg p-1 gap-1">
              <button
                onClick={() => setSelectedTeam(Team.RED)}
                className={`px-4 py-2 rounded-md font-bold transition-all ${selectedTeam === Team.RED ? 'bg-red-600 text-white' : 'bg-transparent text-neutral-500 hover:text-white'}`}
              >
                RED (Q)
              </button>
              <div className="w-px bg-neutral-700 my-1"></div>
              <button
                onClick={() => setSelectedTeam(Team.BLUE)}
                className={`px-4 py-2 rounded-md font-bold transition-all ${selectedTeam === Team.BLUE ? 'bg-blue-600 text-white' : 'bg-transparent text-neutral-500 hover:text-white'}`}
              >
                BLUE
              </button>
            </div>

            {/* Unit Select */}
            <div className="flex gap-2">
              {[
                { type: UnitType.SOLDIER, icon: Swords, label: 'Soldier (1)' },
                { type: UnitType.TANK, icon: Shield, label: 'Tank (2)' },
                { type: UnitType.ARCHER, icon: Crosshair, label: 'Archer (3)' },
                { type: UnitType.CAVALRY, icon: Zap, label: 'Cavalry (4)' }
              ].map((u) => (
                <button
                  key={u.type}
                  onClick={() => setSelectedUnit(u.type)}
                  className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg border-2 transition-all ${selectedUnit === u.type ? 'border-neutral-200 bg-neutral-700' : 'border-transparent bg-neutral-800 hover:bg-neutral-750'}`}
                >
                  <u.icon className="mb-1" size={24} />
                  <span className="text-xs">{u.label}</span>
                </button>
              ))}
            </div>

            {/* Count Slider */}
            <div className="flex flex-col w-32">
              <label className="text-xs text-neutral-400 mb-1">Batch Size: {spawnCount}</label>
              <input
                type="range"
                min="1"
                max="100"
                value={spawnCount}
                onChange={(e) => setSpawnCount(parseInt(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>
          </>
        ) : (
          <>
            {/* Map Editor Controls */}
            <div className="flex gap-2">
              {[
                { type: TerrainType.WALL, icon: BrickWall, label: 'Wall' },
                { type: TerrainType.FOREST, icon: Trees, label: 'Forest' },
                { type: TerrainType.WATER, icon: Droplets, label: 'Water' },
                { type: TerrainType.GROUND, icon: Eraser, label: 'Erase' }
              ].map(t => (
                <button
                  key={t.type}
                  onClick={() => setSelectedTerrain(t.type)}
                  className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg border-2 transition-all ${selectedTerrain === t.type ? 'border-neutral-200 bg-neutral-700' : 'border-transparent bg-neutral-800 hover:bg-neutral-750'}`}
                >
                  <t.icon className="mb-1" size={24} />
                  <span className="text-xs">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col w-32 ml-4">
              <label className="text-xs text-neutral-400 mb-1">Grid Size: {gridSize}px</label>
              <input
                type="range"
                min="20"
                max="200"
                step="10"
                value={gridSize}
                onChange={(e) => onGridSizeChange(parseInt(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-[10px] text-amber-500 mt-1">Resizing clears map!</span>
            </div>
          </>
        )}
      </div>

      {/* Strategy Controls */}
      <div className="flex flex-col gap-1 items-end mr-4">
        <div className="flex items-center gap-2">
          <span className="text-red-500 font-bold text-xs uppercase">Red</span>
          <button
            onClick={() => onStrategyChange(Team.RED, redStrategy === TeamStrategy.ATTACK ? TeamStrategy.DEFEND : TeamStrategy.ATTACK)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-bold transition-colors ${redStrategy === TeamStrategy.ATTACK ? 'bg-red-900/50 text-red-200 border border-red-500' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
          >
            {redStrategy === TeamStrategy.ATTACK ? <Sword size={12} /> : <ShieldIcon size={12} />}
            {redStrategy}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-500 font-bold text-xs uppercase">Blue</span>
          <button
            onClick={() => onStrategyChange(Team.BLUE, blueStrategy === TeamStrategy.ATTACK ? TeamStrategy.DEFEND : TeamStrategy.ATTACK)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-bold transition-colors ${blueStrategy === TeamStrategy.ATTACK ? 'bg-blue-900/50 text-blue-200 border border-blue-500' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
          >
            {blueStrategy === TeamStrategy.ATTACK ? <Sword size={12} /> : <ShieldIcon size={12} />}
            {blueStrategy}
          </button>
        </div>
      </div>

    </div>
  );
};
