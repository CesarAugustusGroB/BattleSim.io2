import { World } from './World';

export interface System {
    update(world: World, delta: number): void;
}
