import { ComponentType, ComponentDataMap } from './components';

export class World {
    private nextEntityId: number = 0;
    private entities: Set<number> = new Set();

    // Dense storage of components: ComponentType -> Map<EntityID, Data>
    private components: Map<ComponentType, Map<number, any>> = new Map();

    // Query Cache
    // Key: Sorted list of ComponentTypes joined by ','
    // Value: Array of Entity IDs
    private queryCache: Map<string, number[]> = new Map();

    constructor() {
        // Initialize maps for each component type
        for (const type of Object.values(ComponentType)) {
            this.components.set(type as ComponentType, new Map());
        }
    }

    createEntity(): number {
        const id = this.nextEntityId++;
        this.entities.add(id);
        return id; // creating entity doesn't affect queries until components added
    }

    removeEntity(id: number) {
        this.entities.delete(id);
        for (const map of this.components.values()) {
            map.delete(id);
        }
        // Invalidate All Caches?
        // Or iterate caches and remove ID?
        // Removing from all cached arrays is slow O(Queries * N).
        // Clearing cache is easiest but forces rebuild.
        // Given entities die infrequently compared to updates, clearing is safer for correctness.
        // Optimization: Mark dirty?
        this.queryCache.clear();
    }

    addComponent<K extends ComponentType>(entityId: number, type: K, data: ComponentDataMap[K]) {
        this.components.get(type)!.set(entityId, data);
        // Invalidate caches containing this component type?
        // Actually, adding a component might make an entity VALID for a query it wasn't before.
        // Simplest: Clear all caches.
        this.queryCache.clear();
    }

    getComponent<K extends ComponentType>(entityId: number, type: K): ComponentDataMap[K] | undefined {
        return this.components.get(type)!.get(entityId);
    }

    hasComponent(entityId: number, type: ComponentType): boolean {
        return this.components.get(type)!.has(entityId);
    }

    // Basic query: Get entities that have ALL specified components
    query(types: ComponentType[]): number[] {
        if (types.length === 0) return Array.from(this.entities);

        // Create Cache Key
        // Sort to ensure [A, B] == [B, A]
        // Since ComponentType is string Enum, sort works.
        const key = types.slice().sort().join(',');

        if (this.queryCache.has(key)) {
            return this.queryCache.get(key)!;
        }

        const firstType = types[0];
        const firstMap = this.components.get(firstType)!;
        const candidates: number[] = [];

        for (const id of firstMap.keys()) {
            let match = true;
            for (let i = 1; i < types.length; i++) {
                if (!this.components.get(types[i])!.has(id)) {
                    match = false;
                    break;
                }
            }
            if (match) candidates.push(id);
        }

        this.queryCache.set(key, candidates);
        return candidates;
    }

    clear() {
        this.entities.clear();
        for (const map of this.components.values()) {
            map.clear();
        }
        this.queryCache.clear();
        this.nextEntityId = 0;
    }

    getAllEntities(): number[] {
        return Array.from(this.entities);
    }
}
