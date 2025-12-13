import { System } from '../System';
import { World } from '../World';
import { ComponentType, PhysicsComponent, TransformComponent } from '../components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../../constants';

export class MovementSystem implements System {
    update(world: World, delta: number): void {
        const entities = world.query([ComponentType.TRANSFORM, ComponentType.PHYSICS]);

        for (const id of entities) {
            const transform = world.getComponent(id, ComponentType.TRANSFORM)!;
            const physics = world.getComponent(id, ComponentType.PHYSICS)!;

            // Friction
            physics.velocity.x *= 0.95;
            physics.velocity.y *= 0.95;

            // Clamp Speed
            const speedSq = physics.velocity.x ** 2 + physics.velocity.y ** 2;
            if (speedSq > physics.speed * physics.speed) {
                const speed = Math.sqrt(speedSq);
                physics.velocity.x = (physics.velocity.x / speed) * physics.speed;
                physics.velocity.y = (physics.velocity.y / speed) * physics.speed;
            }

            // Apply Velocity
            transform.x += physics.velocity.x;
            transform.y += physics.velocity.y;

            // Bounds
            transform.x = Math.max(physics.radius, Math.min(WORLD_WIDTH - physics.radius, transform.x));
            transform.y = Math.max(physics.radius, Math.min(WORLD_HEIGHT - physics.radius, transform.y));
        }
    }
}
