import { System } from '../System';
import { World } from '../World';
import { ComponentType } from '../components';
import { SpatialGrid } from '../../SpatialGrid';
import { TeamStrategy, UnitState, Team } from '../../../types';

export class SteeringSystem implements System {
    private grid: SpatialGrid;
    private teamStrategies: Map<Team, TeamStrategy>;
    private buffer: number[] = [];

    constructor(grid: SpatialGrid, strategies: Map<Team, TeamStrategy>) {
        this.grid = grid;
        this.teamStrategies = strategies;
    }

    update(world: World, delta: number): void {
        const entities = world.query([
            ComponentType.PHYSICS,
            ComponentType.TRANSFORM,
            ComponentType.TEAM,
            ComponentType.UNIT_STATE,
            ComponentType.FLOCKING,
            ComponentType.COMBAT,
            ComponentType.META,
            ComponentType.PATHFINDING // Added
        ]);

        for (const id of entities) {
            const physics = world.getComponent(id, ComponentType.PHYSICS)!;
            const transform = world.getComponent(id, ComponentType.TRANSFORM)!;
            const state = world.getComponent(id, ComponentType.UNIT_STATE)!;
            const flocking = world.getComponent(id, ComponentType.FLOCKING)!;
            const combat = world.getComponent(id, ComponentType.COMBAT)!;
            const team = world.getComponent(id, ComponentType.TEAM)!;
            const meta = world.getComponent(id, ComponentType.META)!;
            const pathfinding = world.getComponent(id, ComponentType.PATHFINDING)!;

            let forceX = 0;
            let forceY = 0;
            let moveDirX = 0;
            let moveDirY = 0;
            let hasPath = false;

            // 1. Path Following
            if (pathfinding.path) {
                const waypoint = pathfinding.path[pathfinding.pathIndex];
                if (waypoint) {
                    const dx = waypoint.x - transform.x;
                    const dy = waypoint.y - transform.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 10) {
                        pathfinding.pathIndex++;
                        if (pathfinding.pathIndex >= pathfinding.path.length) {
                            pathfinding.path = null;
                        }
                    } else {
                        moveDirX = dx / dist;
                        moveDirY = dy / dist;
                        hasPath = true;
                    }
                } else {
                    pathfinding.path = null;
                }
            }

            if (hasPath) {
                // Follow Path (Override Steering)
                forceX += moveDirX * 2.0;
                forceY += moveDirY * 2.0;
            } else {
                // Seek Logic (Original)
                if (state.state === UnitState.MOVING && state.commandTarget) {
                    const dx = state.commandTarget.x - transform.x;
                    const dy = state.commandTarget.y - transform.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < physics.radius + 10) {
                        state.state = UnitState.IDLE;
                        state.commandTarget = null;
                    } else {
                        const idist = 1 / dist;
                        const dirX = dx * idist;
                        const dirY = dy * idist;
                        const seekWeight = 2.5;
                        forceX += dirX * seekWeight;
                        forceY += dirY * seekWeight;
                    }
                } else {
                    // Team Strategy Logic
                    const strategy = this.teamStrategies.get(team.team) || TeamStrategy.ATTACK;

                    if (combat.targetId) {
                        const targetTransform = world.getComponent(combat.targetId, ComponentType.TRANSFORM);
                        // If target died, targetId might point to deleted entity.
                        // World handles this? `getComponent` returns undefined if entity deleted.
                        if (targetTransform) {
                            const dx = targetTransform.x - transform.x;
                            const dy = targetTransform.y - transform.y;
                            const distSq = dx * dx + dy * dy;
                            const dist = Math.sqrt(distSq);

                            const idist = dist > 0 ? 1 / dist : 0;
                            const dirX = dx * idist;
                            const dirY = dy * idist;

                            if (strategy === TeamStrategy.DEFEND) {
                                if (dist > 300) { } // Hold
                                else if (dist < combat.range) { } // Hold
                                else {
                                    forceX += dirX * 0.5;
                                    forceY += dirY * 0.5;
                                }
                            } else {
                                // ATTACK
                                if (combat.range > 100) { // Archer heuristic (range > 100)
                                    if (dist < combat.range * 0.8) { // Kite
                                        forceX -= dirX * 0.8;
                                        forceY -= dirY * 0.8;
                                    } else if (dist > combat.range) {
                                        forceX += dirX * 1.0;
                                        forceY += dirY * 1.0;
                                    }
                                } else {
                                    // Melee
                                    forceX += dirX * 1.2;
                                    forceY += dirY * 1.2;
                                }
                            }
                        } else {
                            // Target dead/gone
                            combat.targetId = null;
                        }
                    }
                }

                // 2. Flocking
                const unitHash = meta.id.charCodeAt(meta.id.length - 1);
                const shouldUpdateFlocking = (delta + unitHash) % 2 === 0;

                if (shouldUpdateFlocking) {
                    this.grid.getNearby(transform.x, transform.y, this.buffer);
                    let cohX = 0, cohY = 0;
                    let alignX = 0, alignY = 0;
                    let allyCount = 0;
                    let sepX = 0, sepY = 0;

                    for (const nid of this.buffer) {
                        if (nid === id) continue;
                        // Check if neighbor exists
                        if (!world.hasComponent(nid, ComponentType.TRANSFORM)) continue;

                        const nTransform = world.getComponent(nid, ComponentType.TRANSFORM)!;
                        const nTeam = world.getComponent(nid, ComponentType.TEAM); // might define team?
                        // Particle check? No, grid supposedly only has units.
                        if (!nTeam) continue;

                        const dx = nTransform.x - transform.x;
                        const dy = nTransform.y - transform.y;
                        const d2 = dx * dx + dy * dy;

                        if (nTeam.team !== team.team) {
                            // Enemy Repel
                            if (d2 < 900) { // 30^2
                                const d = Math.sqrt(d2);
                                const repelStrength = (30 - d) / 30;
                                const push = repelStrength * 1.0;
                                sepX -= (dx / d) * push;
                                sepY -= (dy / d) * push;
                            }
                            continue;
                        }

                        if (d2 < 6400) { // 80^2
                            const nPhysics = world.getComponent(nid, ComponentType.PHYSICS)!;
                            allyCount++;
                            cohX += nTransform.x;
                            cohY += nTransform.y;
                            alignX += nPhysics.velocity.x;
                            alignY += nPhysics.velocity.y;

                            if (d2 < 625 && d2 > 0.01) { // 25^2
                                const d = Math.sqrt(d2);
                                const repelStrength = (25 - d) / 25;
                                const push = repelStrength * 1.5;
                                sepX -= (dx / d) * push;
                                sepY -= (dy / d) * push;
                            }
                        }
                    }

                    let newFlockX = 0;
                    let newFlockY = 0;

                    if (allyCount > 0 && state.state !== UnitState.MOVING) {
                        cohX /= allyCount;
                        cohY /= allyCount;
                        const cdx = cohX - transform.x;
                        const cdy = cohY - transform.y;
                        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                        if (cdist > 0) {
                            newFlockX += (cdx / cdist) * 0.1;
                            newFlockY += (cdy / cdist) * 0.1;
                        }

                        alignX /= allyCount;
                        alignY /= allyCount;
                        newFlockX += alignX * 0.05;
                        newFlockY += alignY * 0.05;
                    }

                    flocking.cachedForce.x = newFlockX + sepX;
                    flocking.cachedForce.y = newFlockY + sepY;
                }

                forceX += flocking.cachedForce.x;
                forceY += flocking.cachedForce.y;

                // Apply to Velocity
                physics.velocity.x += forceX * physics.acceleration;
                physics.velocity.y += forceY * physics.acceleration;
            }
        }
    }
}
