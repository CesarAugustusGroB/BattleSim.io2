import { UnitConfig, UnitType } from './types';

export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 1500;
export const GRID_SIZE = 50; // Size of spatial partition cells

// Flocking & Squad Behavior Constants
export const FLOCKING_CONFIG = {
  SEPARATION_WEIGHT: 1.5,
  ALIGNMENT_WEIGHT: 0.8,
  COHESION_WEIGHT: 0.6,
  SQUAD_MAGNETISM_WEIGHT: 0.05, // Pull towards squad center
  SEPARATION_RADIUS: 25,
  NEIGHBOR_RADIUS: 80
};

export const UNIT_CONFIGS: Record<UnitType, UnitConfig> = {
  [UnitType.SOLDIER]: {
    type: UnitType.SOLDIER,
    radius: 6,
    mass: 1.70,
    defense: 3,
    speed: 1.8,
    acceleration: 0.15,
    health: 40,
    damage: 8,
    range: 15, // Melee range
    attackCooldown: 40,
    color: '#', // Set dynamically based on team
  },
  [UnitType.TANK]: {
    type: UnitType.TANK,
    radius: 14,
    mass: 13.0, // Increased mass for better stability
    defense: 6,
    speed: 1.5,
    acceleration: 0.08, // Very slow acceleration
    health: 250,
    damage: 25,
    range: 20,
    attackCooldown: 90,
    color: '#',
  },
  [UnitType.ARCHER]: {
    type: UnitType.ARCHER,
    radius: 7,
    mass: 1.0,
    defense: 1,
    speed: 2.0,
    acceleration: 0.2,
    health: 30,
    damage: 8,
    range: 150, // Ranged
    attackCooldown: 60,
    color: '#',
  },
  [UnitType.CAVALRY]: {
    type: UnitType.CAVALRY,
    radius: 9,
    mass: 3.5, // Heavier than soldier, lighter than tank
    defense: 2,
    speed: 3.5, // Very fast
    acceleration: 0.5, // Accelerates quickly (Charge)
    health: 80,
    damage: 12,
    range: 18, // Melee but slightly longer reach
    attackCooldown: 50,
    color: '#',
  },
  [UnitType.HQ]: {
    type: UnitType.HQ,
    radius: 50, // Large capture zone
    mass: 50000, // Effectively immovable
    defense: 100, // Irrelevant as it takes no damage
    speed: 0,
    acceleration: 0,
    health: 10000, // Irrelevant as it takes no damage
    damage: 0, // HQs do not attack directly
    range: 0,
    attackCooldown: 1000,
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