import { UnitType, Team } from '../types';
import { TEAM_COLORS, UNIT_CONFIGS } from '../constants';
import { Texture } from 'pixi.js';

type SpriteKey = string;

export class SpriteCache {
    private static sprites: Map<SpriteKey, HTMLCanvasElement> = new Map();
    private static textures: Map<SpriteKey, Texture> = new Map();
    private static shadowSprite: HTMLCanvasElement | null = null;
    private static shadowTexture: Texture | null = null;

    // --- Canvas API (Legacy / Fallback) ---
    static getSprite(type: UnitType, team: Team): HTMLCanvasElement {
        const key = `${type}_${team}`;
        if (!this.sprites.has(key)) {
            this.sprites.set(key, this.generateSprite(type, team));
        }
        return this.sprites.get(key)!;
    }

    static getShadow(radius: number): HTMLCanvasElement {
        if (!this.shadowSprite) {
            this.shadowSprite = this.generateShadow();
        }
        return this.shadowSprite;
    }

    // --- PixiJS API ---
    static getTexture(type: UnitType, team: Team): Texture {
        const key = `${type}_${team}`;
        if (!this.textures.has(key)) {
            const canvas = this.getSprite(type, team);
            this.textures.set(key, Texture.from(canvas));
        }
        return this.textures.get(key)!;
    }

    static getShadowTexture(): Texture {
        if (!this.shadowTexture) {
            const canvas = this.getShadow(0);
            this.shadowTexture = Texture.from(canvas);
        }
        return this.shadowTexture;
    }


    private static generateSprite(type: UnitType, team: Team): HTMLCanvasElement {
        const config = UNIT_CONFIGS[type];
        const colors = team === Team.BLUE ? TEAM_COLORS.BLUE : TEAM_COLORS.RED;

        // Canvas size needs to accommodate the unit + direction indicator
        const canvas = document.createElement('canvas');
        const size = config.radius * 2 + 4; // Padding
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        const cx = size / 2;
        const cy = size / 2;

        // Draw Body
        ctx.beginPath();
        ctx.arc(cx, cy, config.radius, 0, Math.PI * 2);
        ctx.fillStyle = colors.primary;
        ctx.fill();
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Direction Indicator (Default pointing RIGHT at small offset)
        // We will rotate the entire sprite in the main draw loop
        ctx.save();
        ctx.translate(cx, cy);

        // Triangle wedge pointing right
        ctx.beginPath();
        ctx.moveTo(config.radius * 0.8, 0);
        ctx.lineTo(config.radius * 0.3, -config.radius * 0.4);
        ctx.lineTo(config.radius * 0.3, config.radius * 0.4);
        ctx.closePath();
        ctx.fillStyle = colors.secondary;
        ctx.fill();

        ctx.restore();

        return canvas;
    }

    private static generateShadow(): HTMLCanvasElement {
        const size = 64; // High res base shadow
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // Radial gradient for soft shadow
        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        return canvas;
    }
}
