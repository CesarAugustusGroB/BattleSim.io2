import { System } from '../System';
import { World } from '../World';
import { ComponentType, TransformComponent, PathfindingComponent, CombatComponent, UnitStateComponent, MetaComponent } from '../components';
import { SpatialGrid } from '../../SpatialGrid';
import { Pathfinder } from '../../pathfinding'; // Assuming it's in services/pathfinding.ts
import { TerrainMap, UnitState } from '../../../types';
import { WORLD_HEIGHT, TERRAIN_CONFIGS } from '../../../constants';

export class PathfindingSystem implements System {
    private grid: SpatialGrid;
    private terrain: TerrainMap;

    constructor(grid: SpatialGrid, terrain: TerrainMap) {
        this.grid = grid;
        this.terrain = terrain;
    }

    setTerrain(terrain: TerrainMap) {
        this.terrain = terrain;
    }

    update(world: World, delta: number): void {
        const entities = world.query([
            ComponentType.TRANSFORM,
            ComponentType.PATHFINDING,
            ComponentType.COMBAT,
            ComponentType.UNIT_STATE,
            ComponentType.META
        ]);

        for (const id of entities) {
            const transform = world.getComponent(id, ComponentType.TRANSFORM)!;
            const pathfinding = world.getComponent(id, ComponentType.PATHFINDING)!;
            const combat = world.getComponent(id, ComponentType.COMBAT)!;
            const state = world.getComponent(id, ComponentType.UNIT_STATE)!;
            const meta = world.getComponent(id, ComponentType.META)!;

            // If not moving, clear path?
            if (state.state !== UnitState.MOVING) {
                if (pathfinding.path) pathfinding.path = null;
                continue;
            }

            // Determine Destination
            let targetX = 0;
            let targetY = 0;
            let hasTarget = false;

            if (state.commandTarget) {
                targetX = state.commandTarget.x;
                targetY = state.commandTarget.y;
                hasTarget = true;
            } else if (combat.targetId) {
                // Resolve target pos
                // Wait, combat.targetId is EntityID (number).
                // Ensure target exists
                const targetId = combat.targetId;
                if (world.hasComponent(targetId, ComponentType.TRANSFORM)) {
                    const tTransform = world.getComponent(targetId, ComponentType.TRANSFORM)!;
                    targetX = tTransform.x;
                    targetY = tTransform.y;
                    hasTarget = true;
                }
            }

            if (!hasTarget) continue;

            // Path Request Logic
            // If no path, check if we need one
            // Throttle: lastPathRequest is frame number. delta is assumed to include frame increment or we track frame in a MetaSystem?
            // Let's assume passed `delta` is the current frame number (from SimulationEngine).

            if (!pathfinding.path && delta > pathfinding.lastPathRequest + 60) {
                const start = { x: transform.x, y: transform.y };
                const end = { x: targetX, y: targetY };

                if (this.isLineBlocked(start, end)) {
                    pathfinding.lastPathRequest = delta + Math.floor(Math.random() * 30); // Jitter
                    const path = Pathfinder.findPath(
                        start,
                        end,
                        this.grid.gridSize,
                        this.grid.cols,
                        Math.ceil(WORLD_HEIGHT / this.grid.gridSize),
                        this.terrain
                    );
                    if (path) {
                        pathfinding.path = path;
                        pathfinding.pathIndex = 0;
                    }
                }
            }
        }
    }


    isLineBlocked(start: { x: number, y: number }, end: { x: number, y: number }): boolean {
        const startHex = this.grid.getHexCoords(start.x, start.y);
        const endHex = this.grid.getHexCoords(end.x, end.y);
        const startAxial = this.grid.offsetToAxial(startHex.col, startHex.row);
        const endAxial = this.grid.offsetToAxial(endHex.col, endHex.row);

        const N = Math.max(
            Math.abs(startAxial.q - endAxial.q),
            Math.abs(startAxial.r - endAxial.r),
            Math.abs((-startAxial.q - startAxial.r) - (-endAxial.q - endAxial.r))
        );

        for (let i = 0; i <= N; i++) {
            const t = N === 0 ? 0 : i / N;
            const q = startAxial.q * (1 - t) + endAxial.q * t;
            const r = startAxial.r * (1 - t) + endAxial.r * t;
            const s = (-startAxial.q - startAxial.r) * (1 - t) + (-endAxial.q - endAxial.r) * t;

            const { q: rq, r: rr } = this.grid.cubeRound(q, s, r);
            const { col, row } = this.grid.axialToOffset({ q: rq, r: rr });
            const key = this.grid.getKeyFromIndex(col, row);

            const type = this.terrain[key];
            if (type && TERRAIN_CONFIGS[type].isWall) {
                return true;
            }
        }
        return false;
    }
}
