import { System } from '../System';
import { World } from '../World';
import { ComponentType, CombatComponent, TransformComponent, UnitStateComponent, PhysicsComponent, MetaComponent, TeamComponent, HealthComponent } from '../components';
import { UnitType, UnitState, Team } from '../../../types';
import { UNIT_CONFIGS, TEAM_COLORS } from '../../../constants';
import { SimulationEngine } from '../../simulation'; // We might need to callback for particles? OR we emit events?
// ECS usually shouldn't depend on the Engine class directly to avoid cycles.
// We can pass a "ParticleEmitter" interface or similar to the System constructor?
// Or just let the loop handle particles?
// For now, I'll pass a simple callback interface to the constructor.

export interface ParticleSpawner {
    spawnParticles(x: number, y: number, color: string, count: number, speed: number): void;
}

export class CombatSystem implements System {
    private particleSpawner: ParticleSpawner;

    constructor(spawner: ParticleSpawner) {
        this.particleSpawner = spawner;
    }

    update(world: World, delta: number): void {
        const attackers = world.query([
            ComponentType.COMBAT,
            ComponentType.TRANSFORM,
            ComponentType.UNIT_STATE,
            ComponentType.META,
            ComponentType.PHYSICS,
            ComponentType.TEAM
        ]);

        for (const id of attackers) {
            const combat = world.getComponent(id, ComponentType.COMBAT)!;
            const transform = world.getComponent(id, ComponentType.TRANSFORM)!;
            const state = world.getComponent(id, ComponentType.UNIT_STATE)!;
            const meta = world.getComponent(id, ComponentType.META)!;
            const physics = world.getComponent(id, ComponentType.PHYSICS)!;
            const team = world.getComponent(id, ComponentType.TEAM)!;

            // Cooldown
            if (combat.cooldownTimer > 0) combat.cooldownTimer--;

            // Check Attack
            if (combat.targetId && combat.cooldownTimer <= 0 && state.state !== UnitState.FLEEING) {
                // Resolve Target ID (Which is an Original ID UUID string? No, component.targetId should ideally be Entity ID number?
                // Wait, simulation logic used UUID strings.
                // My components.ts defined targetId as string | null.
                // But World works with number IDs.
                // If I keep targetId as string, I need a map to lookup Entity ID from UUID.
                // OR I change targetId to number (EntityID).
                // Let's assume for now targetId is String (UUID) because `findTarget` returns UUID.
                // We need a lookup map in World? World doesn't track UUIDs.
                // I should probably switch `targetId` to be the Entity ID (number) internally.
                // But the UI might need UUIDs.
                // Let's assume I will implement a UUID->EntityID Map in the SimulationEngine wrapper 
                // OR I just change `targetId` to number in the component.
                // Let's change `targetId` to `number` (EntityID) in `CombatComponent`!
                // Wait, if I do that, I need to update `components.ts`. 
                // I will do that in a subsequent step if component.ts needs update.
                // Actually, looking at component.ts: `targetId: string | null;`
                // I should change this to `number | null`.

                // Let's stick to string for a second. If I stick to string, I have to iterate all entities to find the target. O(N). Bad.
                // I MUST switch to Entity ID (number).
                // I will assume `targetId` is number. I will update `components.ts` later.

                // Wait, `components.ts` was just written with string.
                // I'll cast it for now or update it?

                // I'm writing this file now. I'll treat it as `number` and I'll update `components.ts` in the next turn to fix the type.

                // Actually, let's look for `targetId` in the components.ts content I wrote...
                // `targetId: string | null;`
                // Ok I will fix `components.ts` to `targetId: number | null`.

                // For now, in this file, I'll assume it is number.

                const targetEntityId = combat.targetId as unknown as number;

                // Validate target exists
                if (!world.hasComponent(targetEntityId, ComponentType.TRANSFORM) ||
                    !world.hasComponent(targetEntityId, ComponentType.HEALTH)) {
                    combat.targetId = null;
                    continue;
                }

                const tTransform = world.getComponent(targetEntityId, ComponentType.TRANSFORM)!;
                const tHealth = world.getComponent(targetEntityId, ComponentType.HEALTH)!;
                const tPhysics = world.getComponent(targetEntityId, ComponentType.PHYSICS)!;
                const tMeta = world.getComponent(targetEntityId, ComponentType.META)!;
                const tState = world.getComponent(targetEntityId, ComponentType.UNIT_STATE)!;
                const tTeam = world.getComponent(targetEntityId, ComponentType.TEAM)!;

                const dx = tTransform.x - transform.x;
                const dy = tTransform.y - transform.y;
                const dSq = dx * dx + dy * dy;
                const range = combat.range + tPhysics.radius;

                if (dSq <= range * range) {
                    // Attack!
                    const targetConfig = UNIT_CONFIGS[tMeta.type];
                    let dmg = combat.damage;

                    // Cavalry Charge Bonus
                    if (meta.type === UnitType.CAVALRY) {
                        const speedSq = physics.velocity.x ** 2 + physics.velocity.y ** 2;
                        const ratio = Math.sqrt(speedSq) / physics.speed; // approx max speed
                        dmg = Math.floor(dmg * (1 + ratio));
                        if (ratio > 0.5) {
                            this.particleSpawner.spawnParticles(tTransform.x, tTransform.y, '#ffcc00', 6, 5);
                        }
                    }

                    const effDmg = Math.max(1, dmg - targetConfig.defense);
                    tHealth.current -= effDmg;
                    combat.cooldownTimer = combat.attackCooldown;

                    // Morale Damage
                    tState.morale -= effDmg * 0.8;
                    if (tState.morale <= 0 && tState.state !== UnitState.FLEEING) {
                        tState.state = UnitState.FLEEING;
                        tState.commandTarget = null;
                    }

                    // Knockback
                    const d = Math.sqrt(dSq);
                    const nx = dx / d;
                    const ny = dy / d;
                    const kb = (effDmg * 0.15) / tPhysics.mass;

                    const tPhys = world.getComponent(targetEntityId, ComponentType.PHYSICS)!;
                    tPhys.velocity.x += nx * kb;
                    tPhys.velocity.y += ny * kb;

                    // Particles
                    this.particleSpawner.spawnParticles(tTransform.x, tTransform.y, '#ffffff', 4, 3);
                    const bloodColor = tTeam.team === Team.RED ? '#ff6666' : '#6699ff';
                    this.particleSpawner.spawnParticles(tTransform.x, tTransform.y, bloodColor, 3, 2);
                }
            }

            // Check Deaths (Wait, should this be here or a separate DeathSystem? Or cleanup at end of frame?)
            // Actually `SimulationEngine` did specific death cleanup.
            // I'll leave death cleanup for the Engine to query entities with health <= 0 and remove them.
        }
    }
}
