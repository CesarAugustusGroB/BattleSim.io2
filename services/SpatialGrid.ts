import { DEFAULT_GRID_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../constants';

export class SpatialGrid {
    // Config
    gridSize: number;
    cols: number;
    rows: number;

    // Data: Linked List Pattern
    // cellHead[cellIndex] = firstUnitId
    // nextUnit[unitId] = nextUnitId
    // -1 indicates end of list

    cellHead: Int32Array;
    nextUnit: Int32Array;

    // Max limits
    maxEntities: number = 10000;

    constructor(size: number = DEFAULT_GRID_SIZE) {
        this.gridSize = size;
        // Calculate dimensions
        // Width of Hex = sqrt(3) * size
        // Height = 2 * size (but vertical dist is 1.5 * size)
        this.cols = Math.ceil(WORLD_WIDTH / (size * Math.sqrt(3))) + 2; // Buffer
        this.rows = Math.ceil(WORLD_HEIGHT / (size * 1.5)) + 2;

        const numCells = this.cols * this.rows;

        this.cellHead = new Int32Array(numCells);
        this.nextUnit = new Int32Array(this.maxEntities);

        this.clear();
    }

    setSize(size: number) {
        this.gridSize = size;
        this.cols = Math.ceil(WORLD_WIDTH / (size * Math.sqrt(3))) + 2;
        this.rows = Math.ceil(WORLD_HEIGHT / (size * 1.5)) + 2;
        const numCells = this.cols * this.rows;

        if (this.cellHead.length < numCells) {
            this.cellHead = new Int32Array(numCells);
        }
        this.clear();
    }

    clear() {
        this.cellHead.fill(-1);
        this.nextUnit.fill(-1);
    }

    // Math Helpers
    getKey(x: number, y: number): number {
        const { col, row } = this.getHexCoords(x, y);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return row * this.cols + col;
    }

    getKeyFromIndex(col: number, row: number): number {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return row * this.cols + col;
    }

    getHexCoords(x: number, y: number): { col: number, row: number } {
        const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / this.gridSize;
        const r = (2 / 3 * y) / this.gridSize;
        return this.axialToOffset(this.cubeRound(q, -q - r, r));
    }

    cubeRound(fracQ: number, fracS: number, fracR: number) {
        let q = Math.round(fracQ);
        let r = Math.round(fracR);
        let s = Math.round(fracS);

        const q_diff = Math.abs(q - fracQ);
        const r_diff = Math.abs(r - fracR);
        const s_diff = Math.abs(s - fracS);

        if (q_diff > r_diff && q_diff > s_diff) {
            q = -r - s;
        } else if (r_diff > s_diff) {
            r = -q - s;
        } else {
            s = -q - r;
        }
        return { q, r };
    }

    axialToOffset(hex: { q: number, r: number }): { col: number, row: number } {
        const col = hex.q + (hex.r - (hex.r & 1)) / 2;
        const row = hex.r;
        return { col, row };
    }

    offsetToAxial(col: number, row: number): { q: number, r: number } {
        const q = col - (row - (row & 1)) / 2;
        const r = row;
        return { q, r };
    }

    add(id: number, x: number, y: number) {
        // Resize check?
        if (id >= this.nextUnit.length) {
            // Resize nextUnit
            const newSize = Math.max(id + 1, this.nextUnit.length * 2);
            const newArr = new Int32Array(newSize);
            newArr.set(this.nextUnit);
            newArr.fill(-1, this.nextUnit.length);
            this.nextUnit = newArr;
        }

        const key = this.getKey(x, y);
        if (key === -1) return; // OOB

        // Insert at head
        const oldHead = this.cellHead[key];
        this.cellHead[key] = id;
        this.nextUnit[id] = oldHead;
    }

    // Allocates array! Deprecated usage pattern but kept for compatibility instructions?
    // No, we will update callsites.
    // Using an output array to prevent allocation.
    getNearby(x: number, y: number, outArray: number[]) {
        outArray.length = 0; // Clear

        const { col: centerCol, row: centerRow } = this.getHexCoords(x, y);
        const centerAxial = this.offsetToAxial(centerCol, centerRow);

        // Neighbors + Center
        const directions = [
            { q: 0, r: 0 },
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ];

        for (let i = 0; i < 7; i++) {
            const d = directions[i];
            const nQ = centerAxial.q + d.q;
            const nR = centerAxial.r + d.r;
            const { col, row } = this.axialToOffset({ q: nQ, r: nR });

            const key = this.getKeyFromIndex(col, row);
            if (key !== -1) {
                let curr = this.cellHead[key];
                while (curr !== -1) {
                    outArray.push(curr);
                    curr = this.nextUnit[curr];
                }
            }
        }
    }
}
