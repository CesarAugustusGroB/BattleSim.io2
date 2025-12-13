import { System } from '../System';
import { World } from '../World';
import { ComponentType, TransformComponent, PhysicsComponent } from '../components';
import { SpatialGrid } from '../../SpatialGrid';
import { TerrainMap, TerrainType } from '../../../types';
import { TERRAIN_CONFIGS } from '../../../constants';

export class CollisionSystem implements System {
    private grid: SpatialGrid;
    private terrain: TerrainMap;
    private buffer: number[] = [];

    constructor(grid: SpatialGrid, terrain: TerrainMap) {
        this.grid = grid;
        this.terrain = terrain;
    }

    // Update terrain reference (since App replaces the object)
    setTerrain(terrain: TerrainMap) {
        this.terrain = terrain;
    }

    update(world: World, delta: number): void {
        const entities = world.query([ComponentType.TRANSFORM, ComponentType.PHYSICS]);
        // Optimization: we could iterate the grid cells?
        // Or iterate entities and check neighbors?
        // Since we rebuild grid every frame, checking neighbors via grid is O(N * 9 * Density).

        const iterations = 3;
        for (let k = 0; k < iterations; k++) {
            for (const id of entities) {
                // Resolve Units
                const transform = world.getComponent(id, ComponentType.TRANSFORM)!;
                const physics = world.getComponent(id, ComponentType.PHYSICS)!;

                this.grid.getNearby(transform.x, transform.y, this.buffer);
                for (const nid of this.buffer) {
                    if (nid === id) continue;
                    if (!world.hasComponent(nid, ComponentType.PHYSICS)) continue;

                    const nTransform = world.getComponent(nid, ComponentType.TRANSFORM)!;
                    const nPhysics = world.getComponent(nid, ComponentType.PHYSICS)!;

                    const dx = transform.x - nTransform.x;
                    const dy = transform.y - nTransform.y;
                    const d2 = dx * dx + dy * dy;
                    const minDist = physics.radius + nPhysics.radius;
                    const minDist2 = minDist * minDist;

                    if (d2 < minDist2 && d2 > 0.0001) {
                        const dist = Math.sqrt(d2);
                        const pen = minDist - dist;
                        const totalMass = physics.mass + nPhysics.mass;
                        const r1 = nPhysics.mass / totalMass;
                        const r2 = physics.mass / totalMass;

                        const nx = dx / dist;
                        const ny = dy / dist;

                        // Push
                        transform.x += nx * pen * r1;
                        transform.y += ny * pen * r1;
                        nTransform.x -= nx * pen * r2;
                        nTransform.y -= ny * pen * r2;

                        // Impulse (Bounce)
                        const imp = 0.05;
                        physics.velocity.x += nx * imp * r1;
                        physics.velocity.y += ny * imp * r1;
                        nPhysics.velocity.x -= nx * imp * r2;
                        nPhysics.velocity.y -= ny * imp * r2;
                    }
                }
                // Resolve Terrain
                this.resolveTerrainCollision(id, world, this.grid);
            }
        }
    }


    resolveTerrainCollision(id: number, world: World, grid: SpatialGrid) {
        const transform = world.getComponent(id, ComponentType.TRANSFORM)!;
        const physics = world.getComponent(id, ComponentType.PHYSICS)!;

        const { col: centerCol, row: centerRow } = grid.getHexCoords(transform.x, transform.y);
        const centerAxial = grid.offsetToAxial(centerCol, centerRow);

        // Check Center + 6 Neighbors
        const directions = [
            { q: 0, r: 0 },
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ];

        for (const d of directions) {
            const nQ = centerAxial.q + d.q;
            const nR = centerAxial.r + d.r;
            const { col, row } = grid.axialToOffset({ q: nQ, r: nR });

            const key = grid.getKeyFromIndex(col, row);
            const type = this.terrain[key];

            if (type) {
                const config = TERRAIN_CONFIGS[type];

                // Calculate Hex Center
                const size = grid.gridSize;
                const hexX = size * Math.sqrt(3) * (col + 0.5 * (row & 1));
                const hexY = size * 3 / 2 * row;

                // Speed Mod (Only for center hex, otherwise we get slowed by nearby rough terrain)
                if (d.q === 0 && d.r === 0 && config.speedMultiplier !== 1) {
                    physics.velocity.x *= config.speedMultiplier;
                    physics.velocity.y *= config.speedMultiplier;
                }

                // Hard Collision (Walls blocked from all directions)
                if (config.isWall) {
                    const dx = transform.x - hexX;
                    const dy = transform.y - hexY;
                    const distSq = dx * dx + dy * dy;

                    // Collision Radius = Hex Radius (size) + Unit Radius
                    // Using 'size' (outer radius) ensures no corner cutting.
                    const minDist = size + physics.radius;
                    const minDist2 = minDist * minDist;

                    if (distSq < minDist2) {
                        const dist = Math.sqrt(distSq);
                        const pushDist = minDist - dist;
                        const angle = Math.atan2(dy, dx);

                        const nx = Math.cos(angle);
                        const ny = Math.sin(angle);

                        // Push Out
                        transform.x += nx * pushDist;
                        transform.y += ny * pushDist;

                        // Bounce
                        const dot = physics.velocity.x * nx + physics.velocity.y * ny;
                        if (dot < 0) { // Only bounce if moving towards wall
                            physics.velocity.x -= 2 * dot * nx;
                            physics.velocity.y -= 2 * dot * ny;
                            physics.velocity.x *= 0.5;
                            physics.velocity.y *= 0.5;
                        }
                    }
                }
            }
        }
    }
}
