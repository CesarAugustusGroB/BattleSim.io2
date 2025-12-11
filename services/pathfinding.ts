import { Vector2, TerrainMap, TerrainType } from '../types';
import { TERRAIN_CONFIGS } from '../constants';

// Min Heap for A* Open Set
class MinHeap<T> {
    content: T[];
    scoreFunction: (x: T) => number;

    constructor(scoreFunction: (x: T) => number) {
        this.content = [];
        this.scoreFunction = scoreFunction;
    }

    push(element: T) {
        this.content.push(element);
        this.bubbleUp(this.content.length - 1);
    }

    pop(): T {
        const result = this.content[0];
        const end = this.content.pop();
        if (this.content.length > 0 && end !== undefined) {
            this.content[0] = end;
            this.sinkDown(0);
        }
        return result;
    }

    size() {
        return this.content.length;
    }

    bubbleUp(n: number) {
        const element = this.content[n];
        const score = this.scoreFunction(element);
        while (n > 0) {
            const parentN = Math.floor((n + 1) / 2) - 1;
            const parent = this.content[parentN];
            if (score >= this.scoreFunction(parent)) break;
            this.content[parentN] = element;
            this.content[n] = parent;
            n = parentN;
        }
    }

    sinkDown(n: number) {
        const length = this.content.length;
        const element = this.content[n];
        const elemScore = this.scoreFunction(element);

        while (true) {
            const child2N = (n + 1) * 2;
            const child1N = child2N - 1;
            let swap = -1;
            let child1Score = 0;

            if (child1N < length) {
                const child1 = this.content[child1N];
                child1Score = this.scoreFunction(child1);
                if (child1Score < elemScore) swap = child1N;
            }

            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Score = this.scoreFunction(child2);
                if (child2Score < (swap === null ? elemScore : child1Score)) swap = child2N;
            }

            if (swap !== -1) {
                this.content[n] = this.content[swap];
                this.content[swap] = element;
                n = swap;
            } else {
                break;
            }
        }
    }
}

interface Node {
    x: number;
    y: number;
    g: number; // Cost from start
    h: number; // Heuristic to end
    f: number; // Total cost
    parent: Node | null;
}

// Helper for Hex Math (Inline to avoid complex imports)
// Odd-r Offset <-> Axial
function offsetToAxial(col: number, row: number) {
    const q = col - (row - (row & 1)) / 2;
    const r = row;
    return { q, r };
}
function axialToOffset(q: number, r: number) {
    const col = q + (r - (r & 1)) / 2;
    const row = r;
    return { col, row };
}

export class Pathfinder {
    static findPath(
        start: Vector2,
        end: Vector2,
        gridSize: number,
        // We pass helpers or raw cols?
        // Using simple hash row*5000+col from Simulation
        cols: number,
        rows: number,
        terrain: TerrainMap
    ): Vector2[] | null {

        // 1. Convert World -> Hex (Pointy Top)
        // q = (sqrt(3)/3 * x - 1/3 * y) / size
        // r = (2/3 * y) / size
        const hexRound = (q: number, r: number) => {
            let s = -q - r;
            let rq = Math.round(q);
            let rr = Math.round(r);
            let rs = Math.round(s);
            const q_diff = Math.abs(rq - q);
            const r_diff = Math.abs(rr - r);
            const s_diff = Math.abs(rs - s);
            if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
            else if (r_diff > s_diff) rr = -rq - rs;
            return { q: rq, r: rr };
        }

        const worldToHex = (p: Vector2) => {
            const q = (Math.sqrt(3) / 3 * p.x - 1 / 3 * p.y) / gridSize;
            const r = (2 / 3 * p.y) / gridSize;
            const ax = hexRound(q, r);
            return offsetToAxial(axialToOffset(ax.q, ax.r).col, axialToOffset(ax.q, ax.r).row); // Normalized
        }

        // We work in AXIAL coords for A*
        const startHex = worldToHex(start);
        const endHex = worldToHex(end);

        // Heuristic: Hex Distance
        const heuristic = (a: { q: number, r: number }, b: { q: number, r: number }) => {
            return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;
        };

        const getKey = (q: number, r: number) => {
            const { col, row } = axialToOffset(q, r);
            return row * 5000 + col; // Must match Simulation.getKeyFromIndex
        };

        if (startHex.q === endHex.q && startHex.r === endHex.r) return [{ x: end.x, y: end.y }];

        const endKey = getKey(endHex.q, endHex.r);
        if (terrain[endKey] === TerrainType.WALL) return null;

        interface HexNode {
            q: number;
            r: number;
            g: number;
            f: number;
            parent: HexNode | null;
        }

        const openSet = new MinHeap<HexNode>((n) => n.f);
        const closedSet = new Set<number>();

        const root: HexNode = { q: startHex.q, r: startHex.r, g: 0, f: 0, parent: null };
        root.f = heuristic(startHex, endHex);
        openSet.push(root);

        let iterations = 0;
        while (openSet.size() > 0) {
            if (iterations++ > 500) return null;

            const current = openSet.pop();
            const currentKey = getKey(current.q, current.r);

            if (current.q === endHex.q && current.r === endHex.r) {
                const path: Vector2[] = [];
                let curr: HexNode | null = current;
                while (curr) {
                    // Hex Center
                    const { col, row } = axialToOffset(curr.q, curr.r);
                    path.push({
                        x: gridSize * Math.sqrt(3) * (col + 0.5 * (row & 1)),
                        y: gridSize * 3 / 2 * row
                    });
                    curr = curr.parent;
                }
                path.pop();
                path.reverse();
                if (path.length > 0) path[path.length - 1] = { x: end.x, y: end.y };
                else path.push({ x: end.x, y: end.y });
                return path;
            }

            closedSet.add(currentKey);

            const neighbors = [
                { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
            ];

            for (const dir of neighbors) {
                const nQ = current.q + dir.q;
                const nR = current.r + dir.r;
                const nKey = getKey(nQ, nR);

                if (closedSet.has(nKey)) continue;

                // Check Collision
                const tType = terrain[nKey];
                if (tType === TerrainType.WALL) continue;

                let cost = 1;
                if (tType === TerrainType.FOREST) cost = 2;
                if (tType === TerrainType.WATER) cost = 5;

                // Tentative G
                const gScore = current.g + cost;
                const neighbor: HexNode = {
                    q: nQ, r: nR,
                    g: gScore,
                    f: gScore + heuristic({ q: nQ, r: nR }, endHex),
                    parent: current
                };
                openSet.push(neighbor);
            }
        }
        return null;
    }
}
