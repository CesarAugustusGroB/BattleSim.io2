import { UnitConfig, UnitType } from './types';

export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 1500;
export const GRID_SIZE = 50; // Size of spatial partition cells

export const UNIT_CONFIGS: Record<UnitType, UnitConfig> = {
  [UnitType.SOLDIER]: {
    type: UnitType.SOLDIER,
    radius: 6,
    mass: 1.0,
    speed: 1.8,
    health: 40,
    damage: 8,
    range: 15, // Melee range
    attackCooldown: 40,
    color: '#', // Set dynamically based on team
  },
  [UnitType.TANK]: {
    type: UnitType.TANK,
    radius: 14,
    mass: 10.0,
    speed: 0.8,
    health: 250,
    damage: 25,
    range: 20,
    attackCooldown: 90,
    color: '#',
  },
  [UnitType.ARCHER]: {
    type: UnitType.ARCHER,
    radius: 7,
    mass: 0.8,
    speed: 1.4,
    health: 30,
    damage: 12,
    range: 150, // Ranged
    attackCooldown: 60,
    color: '#',
  }
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