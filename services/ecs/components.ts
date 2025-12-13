import { Team, UnitType, UnitState, Vector2 } from '../../types';

export enum ComponentType {
    TRANSFORM = 'TRANSFORM',
    PHYSICS = 'PHYSICS',
    HEALTH = 'HEALTH',
    TEAM = 'TEAM',
    UNIT_STATE = 'UNIT_STATE',
    COMBAT = 'COMBAT',
    PATHFINDING = 'PATHFINDING',
    FLOCKING = 'FLOCKING',
    META = 'META'
}

export interface TransformComponent {
    x: number;
    y: number;
    rotation: number;
}

export interface PhysicsComponent {
    velocity: Vector2;
    mass: number;
    radius: number;
    speed: number;        // Max speed
    acceleration: number;
}

export interface HealthComponent {
    current: number;
    max: number;
}

export interface TeamComponent {
    team: Team;
}

export interface UnitStateComponent {
    state: UnitState;
    morale: number;
    commandTarget: Vector2 | null;
    selected: boolean;
}

export interface CombatComponent {
    damage: number;
    defense: number;
    range: number;
    attackCooldown: number;     // Configured cooldown
    cooldownTimer: number;      // Current timer
    targetId: number | null;    // Entity ID of target
}

export interface PathfindingComponent {
    path: Vector2[] | null;
    pathIndex: number;
    lastPathRequest: number;
}

export interface FlockingComponent {
    cachedForce: Vector2;
}

export interface MetaComponent {
    id: string; // The original UUID used by the UI
    type: UnitType;
}

export type ComponentDataMap = {
    [ComponentType.TRANSFORM]: TransformComponent;
    [ComponentType.PHYSICS]: PhysicsComponent;
    [ComponentType.HEALTH]: HealthComponent;
    [ComponentType.TEAM]: TeamComponent;
    [ComponentType.UNIT_STATE]: UnitStateComponent;
    [ComponentType.COMBAT]: CombatComponent;
    [ComponentType.PATHFINDING]: PathfindingComponent;
    [ComponentType.FLOCKING]: FlockingComponent;
    [ComponentType.META]: MetaComponent;
};
