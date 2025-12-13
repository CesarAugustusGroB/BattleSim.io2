import { SimulationEngine } from '../services/simulation';
import { WorkerMessage, WorkerResponse, UnitType, Team, GameStateStats } from '../types';

const simulation = new SimulationEngine();
let intervalId: number | null = null;
const FPS = 60;

// Helper to compute stats on the worker thread
const computeStats = (units: any[]): GameStateStats => { // Using any[] temporarily if Unit type import is tricky, but it is imported.
    const stats: GameStateStats = {
        redCount: 0,
        blueCount: 0,
        redComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 },
        blueComposition: { [UnitType.SOLDIER]: 0, [UnitType.TANK]: 0, [UnitType.ARCHER]: 0, [UnitType.CAVALRY]: 0 }
    };

    for (const unit of units) {
        if (unit.team === Team.RED) {
            stats.redCount++;
            stats.redComposition[unit.type as UnitType]++;
        } else {
            stats.blueCount++;
            stats.blueComposition[unit.type as UnitType]++;
        }
    }
    return stats;
};

const tick = () => {
    simulation.update();

    // Map units Map to Array for transfer
    // We send unit objects directly. Structured Clone algorithm handles objects.
    const unitsArray = simulation.getLegacyUnits();

    // Compute stats here to save main thread cycles
    const stats = computeStats(unitsArray);

    const response: WorkerResponse = {
        type: 'TICK',
        payload: {
            units: unitsArray,
            particles: simulation.particles,
            stats: stats,
            frame: simulation.frame,
            gridSize: simulation.gridSize,
            terrain: simulation.terrain
        }
    };

    self.postMessage(response);
};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;

    switch (msg.type) {
        case 'START':
            if (!intervalId) {
                intervalId = self.setInterval(tick, 1000 / FPS) as unknown as number;
            }
            break;
        case 'PAUSE':
            if (intervalId) {
                self.clearInterval(intervalId);
                intervalId = null;
            }
            break;
        case 'RESET':
            simulation.reset();
            // Send one tick to clear the screen immediately
            tick();
            break;
        case 'SPAWN':
            simulation.spawnFormation(
                msg.payload.x,
                msg.payload.y,
                msg.payload.team,
                msg.payload.type,
                msg.payload.count
            );
            break;
        case 'UPDATE_STRATEGY':
            simulation.teamStrategies.set(msg.payload.team, msg.payload.strategy);
            break;
        case 'SET_GRID_SIZE':
            simulation.setGridSize(msg.payload);
            break;
        case 'EDIT_TERRAIN':
            simulation.editTerrain(
                msg.payload.cellIndex,
                msg.payload.type
            );
            break;
    }
};
