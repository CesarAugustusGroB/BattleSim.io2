import { Unit, UnitType, Team, Vector2, Particle, UnitState, TeamStrategy } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE, UNIT_CONFIGS } from '../constants';

// Utility for unique IDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// Simple Vector Math
const distSq = (v1: Vector2, v2: Vector2) => (v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2;
const normalize = (v: Vector2): Vector2 => {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y);
  return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
};

// Spatial Partitioning Grid
class SpatialGrid {
  cells: Map<string, string[]> = new Map();

  clear() {
    this.cells.clear();
  }

  getKey(pos: Vector2): string {
    const gx = Math.floor(pos.x / GRID_SIZE);
    const gy = Math.floor(pos.y / GRID_SIZE);
    return `${gx},${gy}`;
  }

  add(unit: Unit) {
    const key = this.getKey(unit.position);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key)!.push(unit.id);
  }

  // Get units in current and adjacent cells
  getNearby(pos: Vector2): string[] {
    const ids: string[] = [];
    const gx = Math.floor(pos.x / GRID_SIZE);
    const gy = Math.floor(pos.y / GRID_SIZE);

    for (let x = gx - 1; x <= gx + 1; x++) {
      for (let y = gy - 1; y <= gy + 1; y++) {
        const key = `${x},${y}`;
        const cell = this.cells.get(key);
        if (cell) {
          for (const id of cell) {
            ids.push(id);
          }
        }
      }
    }
    return ids;
  }
}

export class SimulationEngine {
  units: Map<string, Unit> = new Map();
  particles: Particle[] = [];
  grid: SpatialGrid = new SpatialGrid();
  teamStrategies: Map<Team, TeamStrategy> = new Map([
    [Team.RED, TeamStrategy.ATTACK],
    [Team.BLUE, TeamStrategy.ATTACK]
  ]);

  // For throttling AI logic
  frame: number = 0;

  constructor() { }

  reset() {
    this.units.clear();
    this.particles = [];
    this.grid.clear();
    this.frame = 0;
  }

  spawnUnit(x: number, y: number, team: Team, type: UnitType) {
    // Add some jitter to spawn position to prevent stacking instant explosions
    const jitterX = (Math.random() - 0.5) * 10;
    const jitterY = (Math.random() - 0.5) * 10;

    const config = UNIT_CONFIGS[type];
    const unit: Unit = {
      id: uuid(),
      type,
      team,
      position: { x: Math.max(0, Math.min(WORLD_WIDTH, x + jitterX)), y: Math.max(0, Math.min(WORLD_HEIGHT, y + jitterY)) },
      velocity: { x: 0, y: 0 },
      radius: config.radius,
      mass: config.mass,
      health: config.health,
      maxHealth: config.health,
      targetId: null,
      cooldownTimer: Math.random() * config.attackCooldown, // Random start cooldown

      // RTS Props Init
      state: UnitState.IDLE,
      selected: false,
      morale: 100, // Starts full
      commandTarget: null,
      cachedFlockingForce: { x: 0, y: 0 }
    };
    this.units.set(unit.id, unit);
  }

  spawnFormation(centerX: number, centerY: number, team: Team, type: UnitType, count: number) {
    const spacing = UNIT_CONFIGS[type].radius * 2.5;
    const cols = Math.ceil(Math.sqrt(count));

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const offsetX = (col - cols / 2) * spacing;
      const offsetY = (row - cols / 2) * spacing;
      this.spawnUnit(centerX + offsetX, centerY + offsetY, team, type);
    }
  }

  spawnParticles(x: number, y: number, color: string, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = Math.random() * speed;
      this.particles.push({
        id: uuid(),
        position: { x, y },
        velocity: { x: Math.cos(angle) * vel, y: Math.sin(angle) * vel },
        life: 20 + Math.random() * 20,
        maxLife: 40,
        color: color,
        size: 1 + Math.random() * 2
      });
    }
  }

  issueCommand(unitIds: string[], type: 'MOVE' | 'ATTACK' | 'DEFEND' | 'STOP', targetPos?: Vector2) {
    // Basic formation offset logic applied per unit relative to centroid?
    // For now, nice and simple: random jitter to prevent stacking

    for (const id of unitIds) {
      const unit = this.units.get(id);
      if (!unit) continue;

      switch (type) {
        case 'MOVE':
          if (targetPos) {
            unit.state = UnitState.MOVING;
            unit.commandTarget = { ...targetPos };
            // Simple jitter to prevent perfect stacking
            const offset = { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60 };
            unit.commandTarget.x += offset.x;
            unit.commandTarget.y += offset.y;

            unit.targetId = null; // Forget combat target while forcibly moving
          }
          break;
        case 'STOP':
          unit.state = UnitState.IDLE;
          unit.commandTarget = null;
          unit.velocity = { x: 0, y: 0 };
          break;
        case 'DEFEND':
          unit.state = UnitState.DEFENDING;
          unit.commandTarget = null;
          break;
        case 'ATTACK':
          unit.state = UnitState.ATTACKING;
          // Attack move logic would go here (move until enemy seen)
          if (targetPos) {
            unit.commandTarget = { ...targetPos };
          }
          break;
      }
    }
  }

  update() {
    this.frame++;

    // 1. Rebuild Grid
    this.grid.clear();
    for (const unit of this.units.values()) {
      this.grid.add(unit);
    }

    const deadUnits: string[] = [];

    // 2. Unit Logic
    for (const unit of this.units.values()) {
      const config = UNIT_CONFIGS[unit.type];

      // A. Target Finding (Throttled: check every 15 frames + random offset)
      // If MOVING, don't auto-acquire targets (force move) - unless we add Attack Move later
      if (unit.state !== UnitState.MOVING) {
        if (!unit.targetId || this.frame % 15 === parseInt(unit.id.slice(-1), 36) % 15) {
          unit.targetId = this.findTarget(unit);
        }
      }

      // B. Movement Forces
      let force = { x: 0, y: 0 };

      // State-Based Steering
      if (unit.state === UnitState.MOVING && unit.commandTarget) {
        // Move towards command target
        const dx = unit.commandTarget.x - unit.position.x;
        const dy = unit.commandTarget.y - unit.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < unit.radius + 10) {
          // Reached target
          unit.state = UnitState.IDLE;
          unit.commandTarget = null;
        } else {
          const dir = normalize({ x: dx, y: dy });
          const seekWeight = 2.5; // Strong pull to destination
          force.x += dir.x * seekWeight;
          force.y += dir.y * seekWeight;
        }
      }
      // State & Strategy Based Movement Logic
      const strategy = this.teamStrategies.get(unit.team) || TeamStrategy.ATTACK;

      // Override state based on strategy if IDLE
      if (unit.state === UnitState.IDLE) {
        // In Attack Mode, idle units should seek combat more aggressively
      }

      if (unit.targetId) {
        // Combat Seek
        const target = this.units.get(unit.targetId);
        if (target) {
          const dx = target.position.x - unit.position.x;
          const dy = target.position.y - unit.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dir = normalize({ x: dx, y: dy });

          // Strategy: DEFEND
          if (strategy === TeamStrategy.DEFEND) {
            // Only chase if very close, otherwise hold
            if (dist > 300) {
              // Too far, don't chase, just drop target if we had one (soft disengage)
              // But for now, just don't move
            } else if (dist < config.range) {
              // In range, hold
            } else {
              // In engage range but out of fire range (e.g. 200px)
              // Move slowly?
              force.x += dir.x * 0.5;
              force.y += dir.y * 0.5;
            }
          }
          // Strategy: ATTACK (Standard Aggressive)
          else {
            if (unit.type === UnitType.ARCHER) {
              if (dist < config.range * 0.8) {
                force.x -= dir.x * 0.8;
                force.y -= dir.y * 0.8;
              } else if (dist > config.range) {
                force.x += dir.x * 1.0;
                force.y += dir.y * 1.0;
              }
            } else {
              // Melee seek - simpler and aggressive
              force.x += dir.x * 1.2;
              force.y += dir.y * 1.2;
            }
          }
        }
      }
      // If no target and ATTACK strategy, move towards Enemy Centroid? (Advanced, maybe later)


      // Flocking forces (only consider nearby allies)
      // STAGGERED UPDATE: Only calculate flocking every 2nd frame per unit
      const unitHash = parseInt(unit.id.slice(-1), 36) || 0;
      const shouldUpdateFlocking = (this.frame + unitHash) % 2 === 0;

      let separationForce = { x: 0, y: 0 };

      if (shouldUpdateFlocking) {
        const neighbors = this.grid.getNearby(unit.position);
        let cohesionCenter = { x: 0, y: 0 };
        let alignmentVel = { x: 0, y: 0 };
        let allyCount = 0;
        let calculatedSeparation = { x: 0, y: 0 };

        for (const nid of neighbors) {
          if (nid === unit.id) continue;
          const other = this.units.get(nid);
          if (!other) continue;

          const dx = other.position.x - unit.position.x;
          const dy = other.position.y - unit.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (other.team !== unit.team) {
            // Repel from enemies slightly to avoid clipping through them
            if (dist < 30) {
              const repelStrength = (30 - dist) / 30;
              calculatedSeparation.x -= (dx / dist) * repelStrength * 1.0;
              calculatedSeparation.y -= (dy / dist) * repelStrength * 1.0;
            }
            continue;
          }

          if (dist < 80) { // Flocking radius
            allyCount++;

            // Cohesion & Alignment
            cohesionCenter.x += other.position.x;
            cohesionCenter.y += other.position.y;
            alignmentVel.x += other.velocity.x;
            alignmentVel.y += other.velocity.y;

            // Separation from allies
            if (dist < 25 && dist > 0.1) {
              const repelStrength = (25 - dist) / 25;
              calculatedSeparation.x -= (dx / dist) * repelStrength * 1.5;
              calculatedSeparation.y -= (dy / dist) * repelStrength * 1.5;
            }
          }
        }

        // Apply flocking forces
        let newFlockingForce = { x: 0, y: 0 };

        if (allyCount > 0 && unit.state !== UnitState.MOVING) {
          // Cohesion
          cohesionCenter.x /= allyCount;
          cohesionCenter.y /= allyCount;
          const cohesionDir = normalize({
            x: cohesionCenter.x - unit.position.x,
            y: cohesionCenter.y - unit.position.y
          });
          newFlockingForce.x += cohesionDir.x * 0.1;
          newFlockingForce.y += cohesionDir.y * 0.1;

          // Alignment
          alignmentVel.x /= allyCount;
          alignmentVel.y /= allyCount;
          newFlockingForce.x += alignmentVel.x * 0.05;
          newFlockingForce.y += alignmentVel.y * 0.05;
        }

        unit.cachedFlockingForce = {
          x: newFlockingForce.x + calculatedSeparation.x,
          y: newFlockingForce.y + calculatedSeparation.y
        };
      }

      // Always apply cached force (smoothed over frames)
      force.x += unit.cachedFlockingForce.x;
      force.y += unit.cachedFlockingForce.y;



      // Apply Force to Velocity using unit's acceleration
      unit.velocity.x += force.x * config.acceleration;
      unit.velocity.y += force.y * config.acceleration;

      // Friction / Damping
      const friction = 0.95;
      unit.velocity.x *= friction;
      unit.velocity.y *= friction;

      // Clamp Velocity to max speed
      const currentSpeed = Math.sqrt(unit.velocity.x ** 2 + unit.velocity.y ** 2);
      if (currentSpeed > config.speed) {
        unit.velocity.x = (unit.velocity.x / currentSpeed) * config.speed;
        unit.velocity.y = (unit.velocity.y / currentSpeed) * config.speed;
      }

      // Apply Position
      unit.position.x += unit.velocity.x;
      unit.position.y += unit.velocity.y;

      // Boundary Checks
      unit.position.x = Math.max(unit.radius, Math.min(WORLD_WIDTH - unit.radius, unit.position.x));
      unit.position.y = Math.max(unit.radius, Math.min(WORLD_HEIGHT - unit.radius, unit.position.y));

      // Morale Recovery & Fleeing Check
      if (unit.state === UnitState.FLEEING) {
        unit.morale += 0.2; // Recover faster while fleeing
        // Run away from nearest enemy!
        if (unit.morale > 50) {
          unit.state = UnitState.IDLE; // Rally!
        }
      } else {
        // Natural recovery if high health
        if (unit.health > unit.maxHealth * 0.5) {
          unit.morale = Math.min(100, unit.morale + 0.05);
        }
      }

      // C. Combat Logic
      if (unit.cooldownTimer > 0) {
        unit.cooldownTimer--;
      }

      if (unit.targetId && unit.cooldownTimer <= 0 && unit.state !== UnitState.FLEEING) {
        const target = this.units.get(unit.targetId);
        if (target) {
          const distToTarget = Math.sqrt(distSq(unit.position, target.position));

          if (distToTarget <= config.range + target.radius) {
            // Calculate base damage with defense reduction
            const targetConfig = UNIT_CONFIGS[target.type];
            let baseDamage = config.damage;

            // Cavalry charge bonus: damage scales with speed
            if (unit.type === UnitType.CAVALRY) {
              const currentSpeed = Math.sqrt(unit.velocity.x ** 2 + unit.velocity.y ** 2);
              const speedRatio = currentSpeed / config.speed; // 0 to 1
              const chargeMultiplier = 1 + speedRatio; // 1x to 2x damage
              baseDamage = Math.floor(config.damage * chargeMultiplier);

              // Extra impact particles for cavalry charge
              if (speedRatio > 0.5) {
                this.spawnParticles(target.position.x, target.position.y, '#ffcc00', 6, 5);
              }
            }

            const effectiveDamage = Math.max(1, baseDamage - targetConfig.defense);
            target.health -= effectiveDamage;
            unit.cooldownTimer = config.attackCooldown;

            // Morale Damage
            target.morale -= effectiveDamage * 0.8;
            if (target.morale <= 0 && target.state !== UnitState.FLEEING) {
              target.state = UnitState.FLEEING;
              // Drop command target
              target.commandTarget = null;
            }

            // Knockback: Push target away from attacker
            const knockbackDir = normalize({
              x: target.position.x - unit.position.x,
              y: target.position.y - unit.position.y
            });
            const knockbackStrength = (effectiveDamage * 0.15) / target.mass;
            target.velocity.x += knockbackDir.x * knockbackStrength;
            target.velocity.y += knockbackDir.y * knockbackStrength;

            // Hit effects - more particles for impact feel
            this.spawnParticles(target.position.x, target.position.y, '#ffffff', 4, 3);
            this.spawnParticles(target.position.x, target.position.y, target.team === Team.RED ? '#ff6666' : '#6699ff', 3, 2);

            if (target.health <= 0) {
              // Defer deletion
            }
          }
        }
      }

      if (unit.health <= 0) {
        deadUnits.push(unit.id);
      }
    }

    // 3. Resolve Collisions (Iterative Mass-Based)
    this.resolveCollisions();

    // Cleanup Dead Units with dramatic death effects
    for (const id of deadUnits) {
      const u = this.units.get(id);
      if (u) {
        const teamColor = u.team === Team.RED ? '#ef4444' : '#3b82f6';
        // Big death burst
        this.spawnParticles(u.position.x, u.position.y, teamColor, 12, 6);
        this.spawnParticles(u.position.x, u.position.y, '#ffffff', 6, 4);
        this.spawnParticles(u.position.x, u.position.y, '#ffcc00', 4, 3);
        this.units.delete(id);
      }
    }

    // 4. Particle Logic
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  resolveCollisions() {
    const iterations = 2; // Iterative solver for stability
    for (let k = 0; k < iterations; k++) {
      for (const unit of this.units.values()) {
        const neighbors = this.grid.getNearby(unit.position);
        for (const nid of neighbors) {
          if (unit.id === nid) continue;
          const other = this.units.get(nid);
          if (!other) continue;

          const dx = unit.position.x - other.position.x;
          const dy = unit.position.y - other.position.y;
          const distSq = dx * dx + dy * dy;
          const minDist = unit.radius + other.radius;

          if (distSq < minDist * minDist && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const penetration = minDist - dist;

            // Mass-based displacement
            const totalMass = unit.mass + other.mass;
            const ratio1 = other.mass / totalMass; // Move unit less if it has more mass (inverse logic, handled by ratio)
            const ratio2 = unit.mass / totalMass;

            // NOTE: Ratio logic: 
            // If unit is Mass 10, other is Mass 1. Total = 11.
            // unit moves: 1/11th of overlap.
            // other moves: 10/11th of overlap.
            // This is correct.

            const nx = dx / dist;
            const ny = dy / dist;

            // Apply displacement
            unit.position.x += nx * penetration * ratio1;
            unit.position.y += ny * penetration * ratio1;
            other.position.x -= nx * penetration * ratio2;
            other.position.y -= ny * penetration * ratio2;

            // Momentum/Impulse Transfer (Slight bump to velocity)
            const impactFactor = 0.05;
            unit.velocity.x += nx * impactFactor * ratio1;
            unit.velocity.y += ny * impactFactor * ratio1;
            other.velocity.x -= nx * impactFactor * ratio2;
            other.velocity.y -= ny * impactFactor * ratio2;
          }
        }
      }
    }
  }

  findTarget(unit: Unit): string | null {
    let bestTargetId: string | null = null;
    let minDistSq = Infinity;

    // Optimization: Check nearby cells first
    const nearby = this.grid.getNearby(unit.position);
    let foundNearby = false;

    for (const nid of nearby) {
      if (nid === unit.id) continue;
      const other = this.units.get(nid);
      if (!other || other.team === unit.team) continue;

      const d = distSq(unit.position, other.position);
      if (d < minDistSq) {
        minDistSq = d;
        bestTargetId = other.id;
        foundNearby = true;
      }
    }

    if (foundNearby) return bestTargetId;

    // Fallback: Global search (expensive, but necessary if no local targets)
    // Only do this if the grid check failed.
    // To prevent massive lag, maybe only check a random subset of units? 
    // For now, simple closest search if local fails.
    // Global scan modified by Strategy
    const strategy = this.teamStrategies.get(unit.team) || TeamStrategy.ATTACK;
    let globalScanLimit = 20;

    // If DEFENDING, do NOT do global scan (hold ground, only fight what comes close)
    if (strategy === TeamStrategy.DEFEND) {
      return null;
    }

    // If ATTACKING, scan aggressively
    if (strategy === TeamStrategy.ATTACK) {
      globalScanLimit = 50; // Look harder
    }



    let count = 0;

    for (const other of this.units.values()) {
      if (other.team !== unit.team) {
        const d = distSq(unit.position, other.position);
        if (d < minDistSq) {
          minDistSq = d;
          bestTargetId = other.id;
        }
        count++;
        if (count > globalScanLimit) break;
      }
    }

    return bestTargetId;
  }
}