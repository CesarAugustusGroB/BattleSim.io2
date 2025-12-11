import { UnitConfig, UnitType, TerrainType } from './types';

export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 1500;
export const DEFAULT_GRID_SIZE = 50; // Size of spatial partition cells

export const UNIT_CONFIGS: Record<UnitType, UnitConfig> = {
  [UnitType.SOLDIER]: {
    type: UnitType.SOLDIER,
    radius: 6,
    mass: 1.0,
    speed: 2.4, // Faster base speed
    acceleration: 0.25, // Snappy acceleration
    health: 40,
    damage: 8,
    defense: 2, // Light armor
    range: 15, // Melee range
    attackCooldown: 35, // Faster attacks
    color: '#', // Set dynamically based on team
  },
  [UnitType.TANK]: {
    type: UnitType.TANK,
    radius: 14,
    mass: 10.0,
    speed: 1.0, // Slightly faster
    acceleration: 0.05, // Still sluggish but better
    health: 250,
    damage: 25,
    defense: 10, // Heavy armor
    range: 20,
    attackCooldown: 75, // Faster attacks
    color: '#',
  },
  [UnitType.ARCHER]: {
    type: UnitType.ARCHER,
    radius: 7,
    mass: 0.8,
    speed: 1.8, // Good kiting speed
    acceleration: 0.22, // Very nimble
    health: 30,
    damage: 12,
    defense: 1, // Fragile - no armor
    range: 150, // Ranged
    attackCooldown: 45, // Faster shooting
    color: '#',
  },
  [UnitType.CAVALRY]: {
    type: UnitType.CAVALRY,
    radius: 10,
    mass: 3.0,
    speed: 4.5, // Devastating speed
    acceleration: 0.12, // Builds momentum
    health: 80,
    damage: 20, // High charge damage
    defense: 4, // Medium armor
    range: 18, // Melee
    attackCooldown: 55, // Fast strikes
    color: '#',
  }
};

export const TERRAIN_CONFIGS = {
  [TerrainType.GROUND]: { color: 0x1a1a1a, speedMultiplier: 1.0, isWall: false },
  [TerrainType.WALL]: { color: 0x888888, speedMultiplier: 0.0, isWall: true },
  [TerrainType.WATER]: { color: 0x1e3a8a, speedMultiplier: 0.3, isWall: false },
  [TerrainType.FOREST]: { color: 0x064e3b, speedMultiplier: 0.6, isWall: false }
};

export const TEAM_COLORS = {
  BLUE: {
    primary: '#3b82f6',
    secondary: '#1d4ed8',
    bullet: '#93c5fd'
  },
  RED: {
    primary: '#ef4444',
    secondary: '#b91c1c',
    bullet: '#fca5a5'
  }
};