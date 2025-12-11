export enum Team {
  BLUE = 'BLUE',
  RED = 'RED'
}

export enum UnitType {
  SOLDIER = 'SOLDIER',
  TANK = 'TANK',
  ARCHER = 'ARCHER',
  CAVALRY = 'CAVALRY'
}

export enum TeamStrategy {
  ATTACK = 'ATTACK',
  DEFEND = 'DEFEND'
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
  acceleration: number;
  health: number;
  damage: number;
  defense: number;
  range: number;
  attackCooldown: number;
  color: string;
}

export enum UnitState {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  ATTACKING = 'ATTACKING',
  DEFENDING = 'DEFENDING',
  FLEEING = 'FLEEING'
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

  // RTS Props
  state: UnitState;
  selected: boolean;
  morale: number;
  commandTarget: Vector2 | null;
  cachedFlockingForce: Vector2;
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


// --- Worker Types ---

export interface SimState {
  units: Unit[]; // Array for easier iteration/serialization
  particles: Particle[];
  stats: GameStateStats;
  frame: number;
}

export type WorkerMessage =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESET' }
  | { type: 'SPAWN', payload: { x: number, y: number, team: Team, type: UnitType, count: number } }
  | { type: 'UPDATE_STRATEGY', payload: { team: Team, strategy: TeamStrategy } };

export type WorkerResponse =
  | { type: 'TICK', payload: SimState };

export interface GameStateStats {
  redCount: number;
  blueCount: number;
  redComposition: Record<UnitType, number>;
  blueComposition: Record<UnitType, number>;
}