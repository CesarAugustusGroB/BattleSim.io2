import { Unit, UnitType, Team, Vector2, Particle, UnitState, TeamStrategy } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE, UNIT_CONFIGS } from '../constants';

// Utility for unique IDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// Spatial Partitioning Grid - Optimized to INT keys
// Hash Formula: y * 1000 + x (Assuming grid width < 1000)
const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_SIZE);

class SpatialGrid {
  cells: Map<number, string[]> = new Map();

  clear() {
    this.cells.clear();
  }

  // Integer Key Generation (Garbage Free)
  getKey(x: number, y: number): number {
    const gx = Math.floor(x / GRID_SIZE);
    const gy = Math.floor(y / GRID_SIZE);
    return gy * GRID_COLS + gx;
  }

  add(unit: Unit) {
    const key = this.getKey(unit.position.x, unit.position.y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(unit.id);
  }

  // Get units in current and adjacent cells
  // alloc-free iteration would be better, but returning array is OK for now
  getNearby(x: number, y: number): string[] {
    const ids: string[] = [];
    const gx = Math.floor(x / GRID_SIZE);
    const gy = Math.floor(y / GRID_SIZE);

    // Unroll loop for speed (3x3 grid)
    for (let cy = gy - 1; cy <= gy + 1; cy++) {
      const rowOffset = cy * GRID_COLS;
      for (let cx = gx - 1; cx <= gx + 1; cx++) {
        const key = rowOffset + cx;
        const cell = this.cells.get(key);
        if (cell) {
          // Push individual items to avoid spread operator overhead if array is huge
          for (let i = 0; i < cell.length; i++) ids.push(cell[i]);
        }
      }
    }
    return ids;
  }
}

export class SimulationEngine {
  units: Map<string, Unit> = new Map();
  unitsArray: Unit[] = []; // Iteration Cache

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
    this.unitsArray = [];
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
    this.unitsArray.push(unit);
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

  update() {
    this.frame++;

    // 1. Rebuild Grid
    this.grid.clear();
    // Optimization: Loop array instead of iterator
    const len = this.unitsArray.length;
    for (let i = 0; i < len; i++) {
      this.grid.add(this.unitsArray[i]);
    }

    const deadUnits: string[] = [];

    // 2. Unit Logic
    for (let i = 0; i < len; i++) {
      const unit = this.unitsArray[i];
      const config = UNIT_CONFIGS[unit.type];

      // A. Target Finding (Throttled: check every 15 frames)
      if (unit.state !== UnitState.MOVING) {
        // Optimization: Simple integer modulus
        // Assuming unit.id last char is somewhat random, charCodeAt is fast
        const idHash = unit.id.charCodeAt(unit.id.length - 1);
        if (!unit.targetId || (this.frame + idHash) % 15 === 0) {
          unit.targetId = this.findTarget(unit);
        }
      }

      // B. Movement Forces
      let forceX = 0;
      let forceY = 0;

      // State-Based Steering
      if (unit.state === UnitState.MOVING && unit.commandTarget) {
        const dx = unit.commandTarget.x - unit.position.x;
        const dy = unit.commandTarget.y - unit.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < unit.radius + 10) {
          unit.state = UnitState.IDLE;
          unit.commandTarget = null;
        } else {
          // Normalize inline
          const idist = 1 / dist;
          const dirX = dx * idist;
          const dirY = dy * idist;
          const seekWeight = 2.5;
          forceX += dirX * seekWeight;
          forceY += dirY * seekWeight;
        }
      }

      const strategy = this.teamStrategies.get(unit.team) || TeamStrategy.ATTACK;

      if (unit.targetId) {
        const target = this.units.get(unit.targetId);
        if (target) {
          const dx = target.position.x - unit.position.x;
          const dy = target.position.y - unit.position.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);

          const idist = dist > 0 ? 1 / dist : 0;
          const dirX = dx * idist;
          const dirY = dy * idist;

          if (strategy === TeamStrategy.DEFEND) {
            if (dist > 300) { } // Hold
            else if (dist < config.range) { } // Hold
            else {
              forceX += dirX * 0.5;
              forceY += dirY * 0.5;
            }
          } else {
            // ATTACK
            if (unit.type === UnitType.ARCHER) {
              if (dist < config.range * 0.8) {
                forceX -= dirX * 0.8;
                forceY -= dirY * 0.8;
              } else if (dist > config.range) {
                forceX += dirX * 1.0;
                forceY += dirY * 1.0;
              }
            } else {
              forceX += dirX * 1.2;
              forceY += dirY * 1.2;
            }
          }
        }
      }

      // Flocking forces
      const unitHash = unit.id.charCodeAt(unit.id.length - 1);
      const shouldUpdateFlocking = (this.frame + unitHash) % 2 === 0;

      if (shouldUpdateFlocking) {
        const neighbors = this.grid.getNearby(unit.position.x, unit.position.y);
        let cohX = 0, cohY = 0;
        let alignX = 0, alignY = 0;
        let allyCount = 0;
        let sepX = 0, sepY = 0;

        for (let j = 0; j < neighbors.length; j++) {
          const nid = neighbors[j];
          if (nid === unit.id) continue;
          const other = this.units.get(nid);
          if (!other) continue;

          const dx = other.position.x - unit.position.x;
          const dy = other.position.y - unit.position.y;
          const d2 = dx * dx + dy * dy;

          if (other.team !== unit.team) {
            // Enemy Repel
            if (d2 < 900) { // 30^2
              const d = Math.sqrt(d2);
              const repelStrength = (30 - d) / 30;
              // Normalized dx/d * repel
              const push = repelStrength * 1.0;
              sepX -= (dx / d) * push;
              sepY -= (dy / d) * push;
            }
            continue;
          }

          if (d2 < 6400) { // 80^2
            allyCount++;
            cohX += other.position.x;
            cohY += other.position.y;
            alignX += other.velocity.x;
            alignY += other.velocity.y;

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

        if (allyCount > 0 && unit.state !== UnitState.MOVING) {
          cohX /= allyCount;
          cohY /= allyCount;
          const cdx = cohX - unit.position.x;
          const cdy = cohY - unit.position.y;
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

        unit.cachedFlockingForce.x = newFlockX + sepX;
        unit.cachedFlockingForce.y = newFlockY + sepY;
      }

      forceX += unit.cachedFlockingForce.x;
      forceY += unit.cachedFlockingForce.y;

      // Apply Physics
      unit.velocity.x += forceX * config.acceleration;
      unit.velocity.y += forceY * config.acceleration;

      // Friction
      unit.velocity.x *= 0.95;
      unit.velocity.y *= 0.95;

      // Clamp Speed
      const speedSq = unit.velocity.x ** 2 + unit.velocity.y ** 2;
      if (speedSq > config.speed * config.speed) {
        const speed = Math.sqrt(speedSq);
        unit.velocity.x = (unit.velocity.x / speed) * config.speed;
        unit.velocity.y = (unit.velocity.y / speed) * config.speed;
      }

      unit.position.x += unit.velocity.x;
      unit.position.y += unit.velocity.y;

      // Bounds
      unit.position.x = Math.max(unit.radius, Math.min(WORLD_WIDTH - unit.radius, unit.position.x));
      unit.position.y = Math.max(unit.radius, Math.min(WORLD_HEIGHT - unit.radius, unit.position.y));

      // Morale/Combat Logic
      if (unit.state === UnitState.FLEEING) {
        unit.morale += 0.2;
        if (unit.morale > 50) unit.state = UnitState.IDLE;
      } else {
        if (unit.health > unit.maxHealth * 0.5) unit.morale = Math.min(100, unit.morale + 0.05);
      }

      // Attack
      if (unit.cooldownTimer > 0) unit.cooldownTimer--;

      if (unit.targetId && unit.cooldownTimer <= 0 && unit.state !== UnitState.FLEEING) {
        const target = this.units.get(unit.targetId);
        if (target) {
          const dx = target.position.x - unit.position.x;
          const dy = target.position.y - unit.position.y;
          const dSq = dx * dx + dy * dy;
          const range = config.range + target.radius;

          if (dSq <= range * range) {
            const targetConfig = UNIT_CONFIGS[target.type];
            let dmg = config.damage;

            if (unit.type === UnitType.CAVALRY) {
              const spd = Math.sqrt(speedSq);
              const ratio = spd / config.speed;
              dmg = Math.floor(dmg * (1 + ratio));
              if (ratio > 0.5) this.spawnParticles(target.position.x, target.position.y, '#ffcc00', 6, 5);
            }

            const effDmg = Math.max(1, dmg - targetConfig.defense);
            target.health -= effDmg;
            unit.cooldownTimer = config.attackCooldown;
            target.morale -= effDmg * 0.8;

            if (target.morale <= 0 && target.state !== UnitState.FLEEING) {
              target.state = UnitState.FLEEING;
              target.commandTarget = null;
            }

            const d = Math.sqrt(dSq);
            const nx = dx / d;
            const ny = dy / d;
            const kb = (effDmg * 0.15) / target.mass;
            target.velocity.x += nx * kb;
            target.velocity.y += ny * kb;

            this.spawnParticles(target.position.x, target.position.y, '#ffffff', 4, 3);
            this.spawnParticles(target.position.x, target.position.y, target.team === Team.RED ? '#ff6666' : '#6699ff', 3, 2);
          }
        }
      }

      if (unit.health <= 0) {
        deadUnits.push(unit.id);
      }
    }

    // 3. Resolve Collisions
    this.resolveCollisions();

    // Cleanup
    for (let i = 0; i < deadUnits.length; i++) {
      const u = this.units.get(deadUnits[i]);
      if (u) {
        this.spawnParticles(u.position.x, u.position.y, u.team === Team.RED ? '#ef4444' : '#3b82f6', 12, 6);
        this.units.delete(u.id);
        // Remove from array - O(N) but OK for deaths
        const idx = this.unitsArray.findIndex(unit => unit.id === u.id);
        if (idx !== -1) {
          this.unitsArray[idx] = this.unitsArray[this.unitsArray.length - 1];
          this.unitsArray.pop();
        }
      }
    }

    // 4. Particles (Reverse Loop for safe splice)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  resolveCollisions() {
    const iterations = 2;
    for (let k = 0; k < iterations; k++) {
      const len = this.unitsArray.length;
      for (let i = 0; i < len; i++) {
        const unit = this.unitsArray[i];
        const neighbors = this.grid.getNearby(unit.position.x, unit.position.y);

        for (let j = 0; j < neighbors.length; j++) {
          const nid = neighbors[j];
          if (unit.id === nid) continue;
          const other = this.units.get(nid);
          if (!other) continue;

          const dx = unit.position.x - other.position.x;
          const dy = unit.position.y - other.position.y;
          const d2 = dx * dx + dy * dy;
          const minDist = unit.radius + other.radius;
          const minDist2 = minDist * minDist;

          if (d2 < minDist2 && d2 > 0.0001) {
            const dist = Math.sqrt(d2);
            const pen = minDist - dist;
            const totalMass = unit.mass + other.mass;
            const r1 = other.mass / totalMass;
            const r2 = unit.mass / totalMass;

            const nx = dx / dist;
            const ny = dy / dist;

            unit.position.x += nx * pen * r1;
            unit.position.y += ny * pen * r1;
            other.position.x -= nx * pen * r2;
            other.position.y -= ny * pen * r2;

            // Impulse
            const imp = 0.05;
            unit.velocity.x += nx * imp * r1;
            unit.velocity.y += ny * imp * r1;
            other.velocity.x -= nx * imp * r2;
            other.velocity.y -= ny * imp * r2;
          }
        }
      }
    }
  }

  findTarget(unit: Unit): string | null {
    let bestId: string | null = null;
    let minD2 = Infinity;

    // Local Check
    const nearby = this.grid.getNearby(unit.position.x, unit.position.y);
    let found = false;

    for (let i = 0; i < nearby.length; i++) {
      const nid = nearby[i];
      if (nid === unit.id) continue;
      const other = this.units.get(nid);
      if (!other || other.team === unit.team) continue;

      const dx = unit.position.x - other.position.x;
      const dy = unit.position.y - other.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) {
        minD2 = d2;
        bestId = other.id;
        found = true;
      }
    }

    if (found) return bestId;

    // Global Fallback
    const strategy = this.teamStrategies.get(unit.team) || TeamStrategy.ATTACK;
    if (strategy === TeamStrategy.DEFEND) return null;

    let scanLimit = strategy === TeamStrategy.ATTACK ? 50 : 20;
    let count = 0;

    // Iterate cached array
    for (let i = 0; i < this.unitsArray.length; i++) {
      const other = this.unitsArray[i];
      if (other.team !== unit.team) {
        const dx = unit.position.x - other.position.x;
        const dy = unit.position.y - other.position.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD2) {
          minD2 = d2;
          bestId = other.id;
        }
        count++;
        if (count > scanLimit) break;
      }
    }

    return bestId;
  }
}