import { Unit, UnitType, Team, Vector2, Particle } from '../types';
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
  
  // For throttling AI logic
  frame: number = 0;

  constructor() {}

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
      cooldownTimer: Math.random() * config.attackCooldown // Random start cooldown
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
      if (!unit.targetId || this.frame % 15 === parseInt(unit.id.slice(-1), 36) % 15) {
        unit.targetId = this.findTarget(unit);
      }

      // B. Movement Forces
      let force = { x: 0, y: 0 };
      
      // Seek Target
      let distToTarget = Infinity;
      if (unit.targetId) {
        const target = this.units.get(unit.targetId);
        if (target) {
          distToTarget = Math.sqrt(distSq(unit.position, target.position));
          // If out of range, move closer. If archer, stay at range.
          const desiredRange = config.range * 0.8;
          
          if (distToTarget > desiredRange) {
             const seekDir = normalize({
                 x: target.position.x - unit.position.x,
                 y: target.position.y - unit.position.y
             });
             force.x += seekDir.x * 0.8; // Seek weight
             force.y += seekDir.y * 0.8;
          } else if (unit.type === UnitType.ARCHER && distToTarget < desiredRange * 0.5) {
             // Archers back up if too close
             const fleeDir = normalize({
                x: unit.position.x - target.position.x,
                y: unit.position.y - target.position.y
            });
            force.x += fleeDir.x * 0.5;
            force.y += fleeDir.y * 0.5;
          }
        } else {
            unit.targetId = null; // Target dead
        }
      }

      // Apply Force to Velocity
      unit.velocity.x += force.x * 0.2; // Acceleration
      unit.velocity.y += force.y * 0.2;

      // Friction / Damping
      unit.velocity.x *= 0.9;
      unit.velocity.y *= 0.9;

      // Clamp Velocity
      const currentSpeed = Math.sqrt(unit.velocity.x**2 + unit.velocity.y**2);
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

      // C. Combat Logic
      if (unit.cooldownTimer > 0) {
        unit.cooldownTimer--;
      }

      if (unit.targetId && unit.cooldownTimer <= 0) {
          const target = this.units.get(unit.targetId);
          if (target && distToTarget <= config.range + target.radius) {
              // Attack!
              target.health -= config.damage;
              unit.cooldownTimer = config.attackCooldown;
              
              // Sparks on hit
              this.spawnParticles(target.position.x, target.position.y, '#ffffff', 2, 2);

              if (target.health <= 0) {
                 // Defer deletion
              }
          }
      }
      
      if (unit.health <= 0) {
          deadUnits.push(unit.id);
      }
    }

    // 3. Resolve Collisions (Iterative Mass-Based)
    this.resolveCollisions();

    // Cleanup Dead Units
    for (const id of deadUnits) {
        const u = this.units.get(id);
        if (u) {
            this.spawnParticles(u.position.x, u.position.y, u.team === Team.RED ? '#ef4444' : '#3b82f6', 5, 4);
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
    let globalScanLimit = 20; // Only check 20 random units to save FPS
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