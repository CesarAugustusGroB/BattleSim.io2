export enum Team {
  BLUE = 'BLUE',
  RED = 'RED'
}

export enum UnitType {
  SOLDIER = 'SOLDIER',
  TANK = 'TANK',
  ARCHER = 'ARCHER'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface UnitConfig {
  type: UnitType;
  radius: number;
  mass: number;
  speed: number;
  health: number;
  damage: number;
  range: number;
  attackCooldown: number;
  color: string;
}

export interface Unit {
  id: string;
  type: UnitType;
  team: Team;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  mass: number;
  health: number;
  maxHealth: number;
  targetId: string | null;
  cooldownTimer: number;
}

export interface Particle {
  id: string;
  position: Vector2;
  velocity: Vector2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameStateStats {
  redCount: number;
  blueCount: number;
  redComposition: Record<UnitType, number>;
  blueComposition: Record<UnitType, number>;
}