import { Unit, UnitType, Team, Vector2, Particle, UnitState, TeamStrategy, TerrainType, TerrainMap } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, DEFAULT_GRID_SIZE, UNIT_CONFIGS } from '../constants';
import { World } from './ecs/World';
import { ComponentType } from './ecs/components';
import { System } from './ecs/System';
import { MovementSystem } from './ecs/systems/MovementSystem';
import { CombatSystem } from './ecs/systems/CombatSystem';
import { SteeringSystem } from './ecs/systems/SteeringSystem';
import { CollisionSystem } from './ecs/systems/CollisionSystem';
import { PathfindingSystem } from './ecs/systems/PathfindingSystem';
import { SensorSystem } from './ecs/systems/SensorSystem';
import { SpatialGrid } from './SpatialGrid';

// Utility for unique IDs
const uuid = () => Math.random().toString(36).substring(2, 9);

export class SimulationEngine {
  world: World;
  systems: System[];

  // Auxiliary for particles (not strict ECS yet)
  particles: Particle[] = [];

  // Shared State
  grid: SpatialGrid;
  terrain: TerrainMap = {};
  teamStrategies: Map<Team, TeamStrategy>;

  frame: number = 0;
  gridSize: number = DEFAULT_GRID_SIZE;

  // Collision System Ref for updates
  private collisionSystem: CollisionSystem;
  private pathfindingSystem: PathfindingSystem;

  constructor() {
    this.world = new World();
    this.grid = new SpatialGrid(this.gridSize);

    this.teamStrategies = new Map([
      [Team.RED, TeamStrategy.ATTACK],
      [Team.BLUE, TeamStrategy.ATTACK]
    ]);

    // Initialize Systems
    this.collisionSystem = new CollisionSystem(this.grid, this.terrain);
    this.pathfindingSystem = new PathfindingSystem(this.grid, this.terrain);


    // Re-assigning array to be clean
    this.systems = [
      new SensorSystem(this.grid, this.teamStrategies),
      this.pathfindingSystem,
      new SteeringSystem(this.grid, this.teamStrategies),
      this.collisionSystem,
      new MovementSystem(),
      new CombatSystem(this) // Passing 'this' as ParticleSpawner
    ];
  }

  // Implementation of ParticleSpawner interface
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

  reset() {
    this.world.clear();
    this.particles = [];
    this.grid.clear();
    this.frame = 0;
  }

  spawnUnit(x: number, y: number, team: Team, type: UnitType) {
    const jitterX = (Math.random() - 0.5) * 10;
    const jitterY = (Math.random() - 0.5) * 10;
    const posX = Math.max(0, Math.min(WORLD_WIDTH, x + jitterX));
    const posY = Math.max(0, Math.min(WORLD_HEIGHT, y + jitterY));

    const config = UNIT_CONFIGS[type];
    const entityId = this.world.createEntity();

    // Add Components
    this.world.addComponent(entityId, ComponentType.TRANSFORM, {
      x: posX, y: posY, rotation: 0
    });

    this.world.addComponent(entityId, ComponentType.PHYSICS, {
      velocity: { x: 0, y: 0 },
      mass: config.mass,
      radius: config.radius,
      speed: config.speed,
      acceleration: config.acceleration
    });

    this.world.addComponent(entityId, ComponentType.HEALTH, {
      current: config.health,
      max: config.health
    });

    this.world.addComponent(entityId, ComponentType.TEAM, { team });

    this.world.addComponent(entityId, ComponentType.UNIT_STATE, {
      state: UnitState.IDLE,
      morale: 100,
      commandTarget: null,
      selected: false
    });

    this.world.addComponent(entityId, ComponentType.COMBAT, {
      damage: config.damage,
      defense: config.defense,
      range: config.range,
      attackCooldown: config.attackCooldown,
      cooldownTimer: Math.random() * config.attackCooldown,
      targetId: null
    });

    this.world.addComponent(entityId, ComponentType.PATHFINDING, {
      path: null,
      pathIndex: 0,
      lastPathRequest: 0
    });

    this.world.addComponent(entityId, ComponentType.FLOCKING, {
      cachedForce: { x: 0, y: 0 }
    });

    this.world.addComponent(entityId, ComponentType.META, {
      id: uuid(), // Generate specific UUID for UI tracking
      type
    });
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

  update() {
    this.frame++;

    // 1. Rebuild Spatial Grid
    this.grid.clear();
    const entities = this.world.query([ComponentType.TRANSFORM]);
    for (const id of entities) {
      const t = this.world.getComponent(id, ComponentType.TRANSFORM)!;
      this.grid.add(id, t.x, t.y);
    }

    // 2. Run Systems
    for (const sys of this.systems) {
      sys.update(this.world, this.frame);
    }

    // 3. Cleanup Dead
    // This logic wasn't in Systems, so I do it here.
    const deathQuery = this.world.query([ComponentType.HEALTH, ComponentType.TRANSFORM, ComponentType.TEAM]);
    const toRemove: number[] = [];

    for (const id of deathQuery) {
      const h = this.world.getComponent(id, ComponentType.HEALTH)!;
      if (h.current <= 0) {
        toRemove.push(id);
        // Death Particles
        const t = this.world.getComponent(id, ComponentType.TRANSFORM)!;
        const team = this.world.getComponent(id, ComponentType.TEAM)!;
        this.spawnParticles(t.x, t.y, team.team === Team.RED ? '#ef4444' : '#3b82f6', 12, 6);
      }
    }

    for (const id of toRemove) {
      this.world.removeEntity(id);
    }

    // 4. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  // --- External Control ---

  setGridSize(size: number) {
    this.gridSize = size;
    this.grid.setSize(size);
    this.terrain = {};
    // Update systems
    this.collisionSystem.setTerrain(this.terrain);
    this.pathfindingSystem.setTerrain(this.terrain);
  }

  editTerrain(cellIndex: number, type: TerrainType) {
    if (type === TerrainType.GROUND) {
      delete this.terrain[cellIndex];
    } else {
      this.terrain[cellIndex] = type;
    }
    // Systems share reference, so they should see updates?
    // Arrays/Maps: yes. But simple object reference? 
    // `this.terrain = {}` created new object.
    // So `editTerrain` modifies the object referenced by systems IF I passed the object reference.
    // In constructor: `new CollisionSystem(..., this.terrain)`.
    // In `setGridSize`: `this.terrain = {}; this.collisionSystem.setTerrain(this.terrain);`.
    // So correct.
  }

  // --- Export State for UI ---

  // NOTE: This creates `Unit[]` from ECS to satisfy `SimState` interface.
  getLegacyUnits(): Unit[] {
    const all = this.world.query([
      ComponentType.TRANSFORM,
      ComponentType.PHYSICS,
      ComponentType.HEALTH,
      ComponentType.TEAM,
      ComponentType.META,
      ComponentType.UNIT_STATE,
      ComponentType.COMBAT,
      ComponentType.PATHFINDING,
      ComponentType.FLOCKING
    ]);

    // Optimization: Map targetId (number) to UUID (string)
    // The UI expects `Unit.targetId` to be string (UUID).
    // Our Component has `number` (EntityID).
    // We need to look up the UUID of the target entity.
    // We can build a map EntityID -> UUID for this frame.

    const idToUuid = new Map<number, string>();
    for (const id of all) {
      const meta = this.world.getComponent(id, ComponentType.META)!;
      idToUuid.set(id, meta.id);
    }

    const units: Unit[] = [];
    for (const id of all) {
      const t = this.world.getComponent(id, ComponentType.TRANSFORM)!;
      const p = this.world.getComponent(id, ComponentType.PHYSICS)!;
      const h = this.world.getComponent(id, ComponentType.HEALTH)!;
      const team = this.world.getComponent(id, ComponentType.TEAM)!;
      const meta = this.world.getComponent(id, ComponentType.META)!;
      const state = this.world.getComponent(id, ComponentType.UNIT_STATE)!;
      const combat = this.world.getComponent(id, ComponentType.COMBAT)!;
      const path = this.world.getComponent(id, ComponentType.PATHFINDING)!;
      const flock = this.world.getComponent(id, ComponentType.FLOCKING)!;

      // Resolve Target UUID
      let targetUuid: string | null = null;
      if (combat.targetId !== null) {
        targetUuid = idToUuid.get(combat.targetId) || null;
      }

      units.push({
        id: meta.id,
        type: meta.type,
        team: team.team,
        position: { x: t.x, y: t.y },
        velocity: p.velocity, // Reference copy, ok?
        radius: p.radius,
        mass: p.mass,
        health: h.current,
        maxHealth: h.max,
        targetId: targetUuid,
        cooldownTimer: combat.cooldownTimer,

        state: state.state,
        selected: state.selected, // UI doesn't seem to set this back to sim?
        morale: state.morale,
        commandTarget: state.commandTarget,
        cachedFlockingForce: flock.cachedForce,

        path: path.path,
        pathIndex: path.pathIndex,
        lastPathRequest: path.lastPathRequest
      });
    }
    return units;
  }
}