import { Unit, UnitType, Team, Vector2, Particle, OrderType, ElevationZone } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE, UNIT_CONFIGS, FLOCKING_CONFIG, ELEVATION_CONFIG } from '../constants';

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
  
  // Dynamic Terrain
  terrainZones: ElevationZone[] = [];

  // Squad Management
  squads: Map<string, Unit[]> = new Map();
  squadCentroids: Map<string, Vector2> = new Map();
  
  // Navigation: Track squad locations by team for "Attack Nearest" logic
  private teamSquadCentroids: Record<Team, Vector2[]> = { [Team.RED]: [], [Team.BLUE]: [] };
  
  private teamSquadCounters: Record<Team, number> = { [Team.RED]: 0, [Team.BLUE]: 0 };
  private currentSquadCounts: Record<Team, number> = { [Team.RED]: 0, [Team.BLUE]: 0 };
  
  // Optimization: Track HQs separately for fast lookups
  private hqs: Set<string> = new Set();
  
  // Optimization: Track HQs by team for Defend order
  private teamHQs: Record<Team, Unit[]> = { [Team.RED]: [], [Team.BLUE]: [] };

  // Orders
  teamOrders: Record<Team, OrderType> = {
    [Team.RED]: OrderType.ATTACK,
    [Team.BLUE]: OrderType.ATTACK
  };

  // For throttling AI logic
  frame: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.units.clear();
    this.particles = [];
    this.grid.clear();
    this.squads.clear();
    this.squadCentroids.clear();
    this.hqs.clear();
    this.teamSquadCounters = { [Team.RED]: 0, [Team.BLUE]: 0 };
    this.currentSquadCounts = { [Team.RED]: 0, [Team.BLUE]: 0 };
    this.teamOrders = { [Team.RED]: OrderType.ATTACK, [Team.BLUE]: OrderType.ATTACK };
    this.teamSquadCentroids = { [Team.RED]: [], [Team.BLUE]: [] };
    this.teamHQs = { [Team.RED]: [], [Team.BLUE]: [] };
    this.frame = 0;

    // Spawn Default HQs
    this.spawnUnit(150, WORLD_HEIGHT / 2, Team.RED, UnitType.HQ);
    this.spawnUnit(WORLD_WIDTH - 150, WORLD_HEIGHT / 2, Team.BLUE, UnitType.HQ);
  }
  
  // Add a dynamic elevation zone (Hill)
  addTerrainZone(x: number, y: number, radius: number, elevation: number) {
      this.terrainZones.push({
          id: uuid(),
          x,
          y,
          radius,
          elevation
      });
  }

  // Remove entity (Terrain or Unit) at position
  removeEntityAt(x: number, y: number) {
      // 1. Check Terrain Zones (Iterate reverse to hit top-most)
      for (let i = this.terrainZones.length - 1; i >= 0; i--) {
          const z = this.terrainZones[i];
          const d = Math.sqrt((x - z.x)**2 + (y - z.y)**2);
          if (d < z.radius) {
              this.terrainZones.splice(i, 1);
              return; 
          }
      }

      // 2. Check Units (Prioritize HQs)
      // We check all HQs explicitly first as they are important map objects
      for (const id of this.hqs) {
          const u = this.units.get(id);
          if (u) {
             const d = Math.sqrt((x - u.position.x)**2 + (y - u.position.y)**2);
             if (d < u.radius) {
                 this.units.delete(id);
                 this.hqs.delete(id);
                 return;
             }
          }
      }

      // 3. Check General Units (via Grid for efficiency)
      const nearby = this.grid.getNearby({x, y});
      for (const id of nearby) {
          const u = this.units.get(id);
          if (u) {
              const d = Math.sqrt((x - u.position.x)**2 + (y - u.position.y)**2);
              if (d < u.radius * 1.5) { // Slightly generous hit box for small units
                  this.units.delete(id);
                  if (u.type === UnitType.HQ) this.hqs.delete(id); // Safety check
                  return;
              }
          }
      }
  }

  setOrder(team: Team, order: OrderType) {
    this.teamOrders[team] = order;
  }

  // Check if a position is on high ground
  getElevation(pos: Vector2): number {
      // Check all zones. If overlapping, take the max elevation.
      let maxEl = 0;
      for (const zone of this.terrainZones) {
          const dx = pos.x - zone.x;
          const dy = pos.y - zone.y;
          if (dx * dx + dy * dy < zone.radius * zone.radius) {
              if (zone.elevation > maxEl) maxEl = zone.elevation;
          }
      }
      return maxEl;
  }

  // Calculate effective range based on elevation
  getEffectiveRange(unit: Unit): number {
      const config = UNIT_CONFIGS[unit.type];
      const elevation = this.getElevation(unit.position);
      // Base range * (1 + bonus * elevation)
      return config.range * (1 + (elevation * ELEVATION_CONFIG.RANGE_BONUS_PER_LEVEL));
  }

  spawnUnit(x: number, y: number, team: Team, type: UnitType) {
    // Add some jitter to spawn position to prevent stacking instant explosions
    const jitterX = (Math.random() - 0.5) * 10;
    const jitterY = (Math.random() - 0.5) * 10;
    
    // Squad Assignment Logic
    let squadId: string;
    
    if (type === UnitType.HQ) {
        squadId = `${team}_HQ`;
    } else {
        // Every 100 units gets a new Squad ID
        const SQUAD_SIZE_LIMIT = 100;
        if (this.currentSquadCounts[team] >= SQUAD_SIZE_LIMIT) {
            this.teamSquadCounters[team]++;
            this.currentSquadCounts[team] = 0;
        }
        squadId = `${team}_SQUAD_${this.teamSquadCounters[team]}`;
        this.currentSquadCounts[team]++;
    }

    const config = UNIT_CONFIGS[type];
    const unit: Unit = {
      id: uuid(),
      squadId: squadId, // Assign squad ID
      type,
      team,
      position: { x: Math.max(0, Math.min(WORLD_WIDTH, x + jitterX)), y: Math.max(0, Math.min(WORLD_HEIGHT, y + jitterY)) },
      velocity: { x: 0, y: 0 },
      radius: config.radius,
      mass: config.mass,
      defense: config.defense,
      health: config.health,
      maxHealth: config.health,
      targetId: null,
      cooldownTimer: Math.random() * config.attackCooldown, // Random start cooldown
      captureProgress: 0
    };
    this.units.set(unit.id, unit);

    if (type === UnitType.HQ) {
        this.hqs.add(unit.id);
    }

    // Initial map population
    if (!this.squads.has(squadId)) {
      this.squads.set(squadId, []);
    }
    this.squads.get(squadId)!.push(unit);
  }

  spawnFormation(centerX: number, centerY: number, team: Team, type: UnitType, count: number) {
    // If spawning HQ, only spawn 1 regardless of count
    if (type === UnitType.HQ) {
        this.spawnUnit(centerX, centerY, team, type);
        return;
    }

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
    
    // 1. Rebuild Grid & Squad Maps
    this.grid.clear();
    this.squads.clear();
    this.squadCentroids.clear();
    this.teamSquadCentroids = { [Team.RED]: [], [Team.BLUE]: [] };
    this.teamHQs = { [Team.RED]: [], [Team.BLUE]: [] };

    for (const unit of this.units.values()) {
      this.grid.add(unit);
      
      // Track HQs
      if (unit.type === UnitType.HQ) {
          this.teamHQs[unit.team].push(unit);
      }

      // Populate Squad Map
      if (!this.squads.has(unit.squadId)) {
        this.squads.set(unit.squadId, []);
      }
      this.squads.get(unit.squadId)!.push(unit);
    }

    // Calculate Squad Centroids & Populate Team Squad Lists
    for (const [sid, members] of this.squads) {
        if (members.length === 0) continue;
        let sumX = 0;
        let sumY = 0;
        let team: Team = members[0].team;
        
        for (const u of members) {
            sumX += u.position.x;
            sumY += u.position.y;
        }
        const centroid = { x: sumX / members.length, y: sumY / members.length };
        this.squadCentroids.set(sid, centroid);
        
        // Add to team list for navigation
        this.teamSquadCentroids[team].push(centroid);
    }

    const deadUnits: string[] = [];

    // 2. Unit Logic
    for (const unit of this.units.values()) {
      const config = UNIT_CONFIGS[unit.type];
      
      // --- HQ SPECIAL LOGIC (Capture, Invulnerability) ---
      if (unit.type === UnitType.HQ) {
          unit.health = unit.maxHealth; // Reset HP (invulnerable)
          unit.velocity.x = 0; 
          unit.velocity.y = 0;

          // Capture Logic
          const nearby = this.grid.getNearby(unit.position);
          let attackers = 0;
          let defenders = 0;
          
          for (const nid of nearby) {
              if (nid === unit.id) continue;
              const other = this.units.get(nid);
              if (!other || other.type === UnitType.HQ) continue;
              
              // Check exact distance to be inside the circle
              const dSq = distSq(unit.position, other.position);
              if (dSq < unit.radius * unit.radius) {
                  if (other.team === unit.team) defenders++;
                  else attackers++;
              }
          }

          // Rule: Must be occupied (attackers > 0) with NO defenders inside to capture
          if (defenders === 0 && attackers > 0) {
              // Dynamic capture rate: Base + Bonus per unit (capped)
              const baseRate = 0.2;
              const perUnitBonus = 0.05;
              const maxBonus = 1.0;
              const rate = baseRate + Math.min(maxBonus, attackers * perUnitBonus);
              
              unit.captureProgress += rate;
              if (unit.captureProgress >= 100) {
                  // Capture Complete!
                  unit.team = unit.team === Team.RED ? Team.BLUE : Team.RED;
                  unit.captureProgress = 0;
                  // Effects
                  this.spawnParticles(unit.position.x, unit.position.y, '#ffffff', 80, 12);
                  this.spawnParticles(unit.position.x, unit.position.y, unit.team === Team.RED ? '#ef4444' : '#3b82f6', 60, 10);
              }
          } else if (unit.captureProgress > 0) {
              // Decay
              // If defenders present, decay fast. If empty, decay slowly.
              const decay = defenders > 0 ? 2.0 : 0.5;
              unit.captureProgress = Math.max(0, unit.captureProgress - decay);
          }
          
          continue; // Skip standard movement/combat logic for HQ
      }


      const order = this.teamOrders[unit.team];
      
      // A. Target Finding (Throttled)
      // We rely heavily on "Attack Nearest" logic via movement, so targeting is only needed for combat engagement
      if (!unit.targetId || this.frame % 15 === parseInt(unit.id.slice(-1), 36) % 15) {
        unit.targetId = this.findTarget(unit, order);
      }

      // B. MOVEMENT & FLOCKING
      let force = { x: 0, y: 0 };
      
      // 1. SEEK TARGET or NAVIGATE
      let distToTarget = Infinity;
      
      if (unit.targetId) {
        const target = this.units.get(unit.targetId);
        if (target) {
          distToTarget = Math.sqrt(distSq(unit.position, target.position));
          
          // Use Effective Range (includes High Ground Bonus)
          const effectiveRange = this.getEffectiveRange(unit);
          let desiredRange = effectiveRange * 0.8;
          
          // SPECIAL: If capturing HQ, ignore range and move to center
          if (order === OrderType.CAPTURE && target.type === UnitType.HQ) {
              desiredRange = 0;
          }
          
          if (distToTarget > desiredRange) {
             const seekDir = normalize({
                 x: target.position.x - unit.position.x,
                 y: target.position.y - unit.position.y
             });
             force.x += seekDir.x * 0.8; 
             force.y += seekDir.y * 0.8;
          } else if (unit.type === UnitType.ARCHER && distToTarget < desiredRange * 0.5 && target.type !== UnitType.HQ) {
             // Archers keep distance (unless capturing HQ)
             const fleeDir = normalize({
                x: unit.position.x - target.position.x,
                y: unit.position.y - target.position.y
            });
            force.x += fleeDir.x * 0.5;
            force.y += fleeDir.y * 0.5;
          }
        } else {
            unit.targetId = null;
        }
      } 
      
      // 2. ORDER SPECIFIC NAVIGATION

      // DEFEND: Gravitate towards HQ (Always applies, acting as a leash)
      if (order === OrderType.DEFEND) {
          const friendlyHQs = this.teamHQs[unit.team];
          if (friendlyHQs.length > 0) {
              // Find nearest HQ
              let nearestHQ = friendlyHQs[0];
              let minHQDistSq = distSq(unit.position, nearestHQ.position);
              
              for (let i = 1; i < friendlyHQs.length; i++) {
                  const d = distSq(unit.position, friendlyHQs[i].position);
                  if (d < minHQDistSq) {
                      minHQDistSq = d;
                      nearestHQ = friendlyHQs[i];
                  }
              }

              const seekDir = normalize({
                  x: nearestHQ.position.x - unit.position.x,
                  y: nearestHQ.position.y - unit.position.y
              });
              
              const dist = Math.sqrt(minHQDistSq);

              if (unit.targetId) {
                   // Combat Leash: Allows fighting but prevents over-chasing
                   // If fighting, we allow a bit more range (e.g. 350px) before pulling back hard
                   if (dist > 350) {
                       // Hard leash - get back to base
                       force.x += seekDir.x * 3.0; 
                       force.y += seekDir.y * 3.0;
                   } else if (dist > 150) {
                       // Soft leash - bias towards base
                       force.x += seekDir.x * 0.5;
                       force.y += seekDir.y * 0.5;
                   }
              } else {
                   // Idle: Return to center
                   // Always pull towards center to form a tight defensive cluster on the HQ
                   force.x += seekDir.x * 1.5; 
                   force.y += seekDir.y * 1.5;
              }
          }
      }

      // ATTACK: Search for enemies (Only if no target)
      if (!unit.targetId && order === OrderType.ATTACK) {
            // ATTACK NEAREST LOGIC
            // If we don't have a direct target, move towards the nearest Enemy Squad Centroid.
            // This ensures units don't just stand around if enemies are far away, and they
            // naturally gravitate towards the closest fight.
            const enemyTeam = unit.team === Team.RED ? Team.BLUE : Team.RED;
            const enemySquads = this.teamSquadCentroids[enemyTeam];
            
            if (enemySquads.length > 0) {
                let nearestSquad = enemySquads[0];
                let minSquadDistSq = distSq(unit.position, nearestSquad);

                // Find closest enemy squad
                for (let i = 1; i < enemySquads.length; i++) {
                    const d = distSq(unit.position, enemySquads[i]);
                    if (d < minSquadDistSq) {
                        minSquadDistSq = d;
                        nearestSquad = enemySquads[i];
                    }
                }
                
                // Move towards that squad
                const seekDir = normalize({
                    x: nearestSquad.x - unit.position.x,
                    y: nearestSquad.y - unit.position.y
                });
                force.x += seekDir.x * 0.7; // Slightly weaker than target seek
                force.y += seekDir.y * 0.7;
            }
      }

      // 3. FLOCKING (Separation, Alignment, Cohesion)
      const nearby = this.grid.getNearby(unit.position);
      let sepForce = { x: 0, y: 0 };
      let alignForce = { x: 0, y: 0 };
      let cohesionForce = { x: 0, y: 0 };
      let squadNeighbors = 0;

      for (const nid of nearby) {
          if (nid === unit.id) continue;
          const other = this.units.get(nid);
          if (!other) continue;

          const d = Math.sqrt(distSq(unit.position, other.position));
          
          // Separation: Avoid crowding (applies to ALL units)
          if (d < FLOCKING_CONFIG.SEPARATION_RADIUS && d > 0) {
              const push = normalize({ x: unit.position.x - other.position.x, y: unit.position.y - other.position.y });
              // Weight by distance (closer = stronger push)
              sepForce.x += push.x / d;
              sepForce.y += push.y / d;
          }

          // Alignment & Cohesion: ONLY apply to Squad Mates
          if (other.squadId === unit.squadId && d < FLOCKING_CONFIG.NEIGHBOR_RADIUS) {
              alignForce.x += other.velocity.x;
              alignForce.y += other.velocity.y;
              cohesionForce.x += other.position.x;
              cohesionForce.y += other.position.y;
              squadNeighbors++;
          }
      }

      // Apply Flocking Averages
      if (squadNeighbors > 0) {
          // Alignment (Match velocity)
          alignForce.x /= squadNeighbors;
          alignForce.y /= squadNeighbors;
          alignForce = normalize(alignForce); // Direction only
          
          // Cohesion (Steer towards local center)
          cohesionForce.x /= squadNeighbors;
          cohesionForce.y /= squadNeighbors;
          let steerToCenter = { x: cohesionForce.x - unit.position.x, y: cohesionForce.y - unit.position.y };
          steerToCenter = normalize(steerToCenter);

          force.x += alignForce.x * FLOCKING_CONFIG.ALIGNMENT_WEIGHT;
          force.y += alignForce.y * FLOCKING_CONFIG.ALIGNMENT_WEIGHT;
          force.x += steerToCenter.x * FLOCKING_CONFIG.COHESION_WEIGHT;
          force.y += steerToCenter.y * FLOCKING_CONFIG.COHESION_WEIGHT;
      }

      // Separation is always applied
      force.x += sepForce.x * FLOCKING_CONFIG.SEPARATION_WEIGHT;
      force.y += sepForce.y * FLOCKING_CONFIG.SEPARATION_WEIGHT;

      // 4. SQUAD MAGNETISM (Global Cohesion)
      // Pull stragglers back to the main squad body even if they have no immediate neighbors
      const squadCenter = this.squadCentroids.get(unit.squadId);
      if (squadCenter) {
          const distToSquadCenter = Math.sqrt(distSq(unit.position, squadCenter));
          if (distToSquadCenter > FLOCKING_CONFIG.NEIGHBOR_RADIUS) {
               let toCenter = { x: squadCenter.x - unit.position.x, y: squadCenter.y - unit.position.y };
               toCenter = normalize(toCenter);
               force.x += toCenter.x * FLOCKING_CONFIG.SQUAD_MAGNETISM_WEIGHT;
               force.y += toCenter.y * FLOCKING_CONFIG.SQUAD_MAGNETISM_WEIGHT;
          }
      }

      // Physics Integration
      // Apply Force to Velocity with ACCELERATION
      unit.velocity.x += force.x * config.acceleration; 
      unit.velocity.y += force.y * config.acceleration;

      // Friction / Damping
      // If Defending and no target, apply stronger braking to "Hold Ground"
      const friction = (order === OrderType.DEFEND && !unit.targetId) ? 0.8 : 0.9;
      unit.velocity.x *= friction;
      unit.velocity.y *= friction;

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
          // Note: distToTarget is from before movement, but it's a good enough approximation for melee range check logic
          if (target) {
              const distToTarget = Math.sqrt(distSq(unit.position, target.position));
              const effectiveRange = this.getEffectiveRange(unit);

              // If target is HQ, just stand there (Capture logic is in HQ update loop)
              if (target.type === UnitType.HQ) {
                 // No attack actions
              } else if (distToTarget <= effectiveRange + target.radius) {
                  
                  // --- CHARGE LOGIC ---
                  const speed = Math.sqrt(unit.velocity.x ** 2 + unit.velocity.y ** 2);
                  const momentumBonus = 1.0 + (speed * 0.5);
                  const isCharge = speed > config.speed * 0.75;

                  // --- ELEVATION TACTICS ---
                  const attackerEl = this.getElevation(unit.position);
                  const targetEl = this.getElevation(target.position);
                  
                  let elevationDamageMult = 1.0;
                  let elevationKnockbackMult = 1.0;
                  
                  // Scenario 1: High Ground Attacking Low (Advantage)
                  if (attackerEl > targetEl) {
                      elevationDamageMult = ELEVATION_CONFIG.DAMAGE_BONUS_HIGH_TO_LOW;
                      elevationKnockbackMult = ELEVATION_CONFIG.KNOCKBACK_BONUS;
                  }
                  
                  // Scenario 2: Low Ground Attacking High (Disadvantage/Cover)
                  if (attackerEl < targetEl) {
                      elevationDamageMult = ELEVATION_CONFIG.DAMAGE_REDUCTION_LOW_TO_HIGH;
                  }

                  // Attack!
                  const rawDamage = config.damage * momentumBonus * elevationDamageMult;
                  const damage = Math.max(1, rawDamage - target.defense);
                  
                  target.health -= damage;
                  unit.cooldownTimer = config.attackCooldown;

                  // --- MOMENTUM TRANSFER (Knockback) ---
                  // If charging, the attacker's momentum is transferred to the target BEFORE dampening.
                  if (isCharge) {
                    // Calculate momentum vector
                    const knockbackForce = 0.8 * elevationKnockbackMult; // Efficiency of transfer
                    const momentumX = unit.velocity.x * unit.mass * knockbackForce;
                    const momentumY = unit.velocity.y * unit.mass * knockbackForce;

                    // Apply to target (dv = p / m)
                    // Heavier targets (Tanks, HQs) will resist this much more than light targets.
                    target.velocity.x += momentumX / target.mass;
                    target.velocity.y += momentumY / target.mass;
                  }
                  
                  // Impact Shock: Attacker loses momentum on hit
                  const impactDampening = isCharge ? 0.05 : 0.25;
                  unit.velocity.x *= impactDampening;
                  unit.velocity.y *= impactDampening;

                  // Sparks on hit - scale size/count with damage intensity
                  const particleSize = Math.max(2, Math.min(6, damage / 3));
                  const particleCount = Math.floor(damage / 3) + 2;
                  this.spawnParticles(target.position.x, target.position.y, '#ffffff', particleCount, particleSize);
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
    const iterations = 4; // Increased from 2 to 4 for stiffer, less squishy collisions
    for (let k = 0; k < iterations; k++) {
      for (const unit of this.units.values()) {
        const neighbors = this.grid.getNearby(unit.position);
        for (const nid of neighbors) {
          if (unit.id === nid) continue;
          const other = this.units.get(nid);
          if (!other) continue;
          
          // Allow units to walk ON TOP of HQs for capture mechanic
          if (unit.type === UnitType.HQ || other.type === UnitType.HQ) continue;

          const dx = unit.position.x - other.position.x;
          const dy = unit.position.y - other.position.y;
          const distSq = dx * dx + dy * dy;
          const minDist = unit.radius + other.radius;

          if (distSq < minDist * minDist && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const penetration = minDist - dist;
            
            // Normalize collision normal
            const nx = dx / dist;
            const ny = dy / dist;

            // --- POSITIONAL CORRECTION ---
            // Move units apart so they don't overlap.
            // Heavier units move less.
            const totalMass = unit.mass + other.mass;
            const ratio1 = other.mass / totalMass; // unit's share of movement (inverse mass)
            const ratio2 = unit.mass / totalMass; 
            
            unit.position.x += nx * penetration * ratio1;
            unit.position.y += ny * penetration * ratio1;
            other.position.x -= nx * penetration * ratio2;
            other.position.y -= ny * penetration * ratio2;
            
            // --- VELOCITY IMPULSE (BOUNCE) ---
            // Only apply force if they are actually crashing into each other.
            
            const relVx = other.velocity.x - unit.velocity.x;
            const relVy = other.velocity.y - unit.velocity.y;
            const velAlongNormal = relVx * nx + relVy * ny;

            // Only resolve if objects are moving towards each other
            if (velAlongNormal < 0) {
                const restitution = 0.2; // Low elasticity (soft collisions)
                
                // Calculate impulse scalar
                let j = -(1 + restitution) * velAlongNormal;
                j /= (1 / unit.mass + 1 / other.mass);
                
                // Apply impulse
                const impulseX = j * nx;
                const impulseY = j * ny;
                
                unit.velocity.x -= impulseX * (1 / unit.mass);
                unit.velocity.y -= impulseY * (1 / unit.mass);
                other.velocity.x += impulseX * (1 / other.mass);
                other.velocity.y += impulseY * (1 / other.mass);
            }
          }
        }
      }
    }
  }

  findTarget(unit: Unit, order: OrderType): string | null {
    // 1. CAPTURE ORDER PRIORITY: Scan for NEAREST enemy HQ
    if (order === OrderType.CAPTURE) {
        let nearestHQ: string | null = null;
        let minHQDistSq = Infinity;

        // Optimization: Iterate only through HQ list
        for (const hqId of this.hqs) {
            const hq = this.units.get(hqId);
            if (hq && hq.team !== unit.team) {
                const d = distSq(unit.position, hq.position);
                if (d < minHQDistSq) {
                    minHQDistSq = d;
                    nearestHQ = hqId;
                }
            }
        }
        if (nearestHQ) return nearestHQ;
    }

    let bestTargetId: string | null = null;
    let minDistSq = Infinity;
    
    // 2. CHECK NEARBY (Spatial Grid)
    // This efficiently finds the NEAREST local enemy.
    const nearby = this.grid.getNearby(unit.position);

    for (const nid of nearby) {
        if (nid === unit.id) continue;
        const other = this.units.get(nid);
        
        // Skip same team OR HQ (HQ cannot be targeted for attacks, only capture order targets them)
        if (!other || other.team === unit.team || other.type === UnitType.HQ) continue;

        const d = distSq(unit.position, other.position);
        if (d < minDistSq) {
            minDistSq = d;
            bestTargetId = other.id;
        }
    }

    // If we found a local target, lock it.
    if (bestTargetId) return bestTargetId;

    // 3. NO GLOBAL FALLBACK
    // If no target is nearby, we return null.
    // The Update loop will then guide the unit towards the nearest Enemy Squad Centroid.
    // This simulates "Attacking Nearest" by moving the army closer until the spatial grid check succeeds.
    
    return null;
  }
}