import { System } from '../System';
import { World } from '../World';
import { ComponentType, CombatComponent, TeamComponent, TransformComponent, UnitStateComponent, MetaComponent } from '../components';
import { TeamStrategy, Team, UnitState } from '../../../types';
import { SpatialGrid } from '../../SpatialGrid';

export class SensorSystem implements System {
    private grid: SpatialGrid;
    private teamStrategies: Map<Team, TeamStrategy>;
    private buffer: number[] = [];

    constructor(grid: SpatialGrid, strategies: Map<Team, TeamStrategy>) {
        this.grid = grid;
        this.teamStrategies = strategies;
    }

    update(world: World, delta: number): void {
        const entities = world.query([
            ComponentType.TRANSFORM,
            ComponentType.TEAM,
            ComponentType.UNIT_STATE,
            ComponentType.COMBAT,
            ComponentType.META // For hash check
        ]);

        for (const id of entities) {
            const state = world.getComponent(id, ComponentType.UNIT_STATE)!;
            const combat = world.getComponent(id, ComponentType.COMBAT)!;
            const meta = world.getComponent(id, ComponentType.META)!;

            // throttling
            const idHash = meta.id.charCodeAt(meta.id.length - 1);
            if (!combat.targetId || (state.state !== UnitState.MOVING && (delta + idHash) % 15 === 0)) { // delta is frame count passed from Engine
                this.findTarget(id, world);
            }
        }
    }

    findTarget(entityId: number, world: World) {
        const transform = world.getComponent(entityId, ComponentType.TRANSFORM)!;
        const team = world.getComponent(entityId, ComponentType.TEAM)!;
        const combat = world.getComponent(entityId, ComponentType.COMBAT)!;

        let bestId: number | null = null;
        let minD2 = Infinity;

        // Local Check
        // Local Check
        this.grid.getNearby(transform.x, transform.y, this.buffer);
        let found = false;

        for (const nid of this.buffer) {
            if (nid === entityId) continue;

            // Check if nid is valid in text? grid might have stale IDs if not cleared? 
            // World clears grid every frame in Engine.

            if (!world.hasComponent(nid, ComponentType.TEAM)) continue;

            const otherTeam = world.getComponent(nid, ComponentType.TEAM)!;
            if (otherTeam.team === team.team) continue;

            const otherTransform = world.getComponent(nid, ComponentType.TRANSFORM)!;
            const dx = transform.x - otherTransform.x;
            const dy = transform.y - otherTransform.y;
            const d2 = dx * dx + dy * dy;

            if (d2 < minD2) {
                minD2 = d2;
                bestId = nid;
                found = true;
            }
        }

        if (found) {
            combat.targetId = bestId;
            return;
        }

        // Global Fallback
        const strategy = this.teamStrategies.get(team.team) || TeamStrategy.ATTACK;
        if (strategy === TeamStrategy.DEFEND) {
            combat.targetId = null;
            return;
        }

        // Scan random sample or all? Original scanned "cached array".
        // We can scan all entities with Team component?
        // Optimization: Just scan a subset?
        // Let's iterate all entities (assuming <1000 it is fine)
        // Actually `World` doesn't have a fast generic list of all entities with specific component without query.
        // We can Query all units.

        // NOTE: This could be slow if we do it for every unit every frame.
        // The original code had `scanLimit` and broke early.

        const allUnits = world.query([ComponentType.TEAM, ComponentType.TRANSFORM]);
        let scanCount = 0;
        const scanLimit = 50;

        for (const otherId of allUnits) {
            if (otherId === entityId) continue;
            const otherTeam = world.getComponent(otherId, ComponentType.TEAM)!;
            if (otherTeam.team === team.team) continue;

            const otherTransform = world.getComponent(otherId, ComponentType.TRANSFORM)!;
            const dx = transform.x - otherTransform.x;
            const dy = transform.y - otherTransform.y;
            const d2 = dx * dx + dy * dy;

            if (d2 < minD2) {
                minD2 = d2;
                bestId = otherId;
            }

            scanCount++;
            if (scanCount > scanLimit) break;
        }

        combat.targetId = bestId;
    }
}
