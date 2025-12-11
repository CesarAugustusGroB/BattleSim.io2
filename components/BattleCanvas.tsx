import React, { useRef, useEffect, useState } from 'react';
import { SpriteCache } from '../services/SpriteCache';
import { WORLD_WIDTH, WORLD_HEIGHT, TEAM_COLORS, UNIT_CONFIGS } from '../constants';
import { Team, UnitType, Unit, SimState } from '../types';
import { Application, Container, Sprite, Graphics, Text, Texture } from 'pixi.js';

interface BattleCanvasProps {
  gameStateRef: React.MutableRefObject<SimState | null>;
  onSelectPos: (x: number, y: number) => void;
  editMode: 'UNITS' | 'TERRAIN';
}

export const BattleCanvas: React.FC<BattleCanvasProps> = ({ gameStateRef, onSelectPos, editMode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [cursorStyle, setCursorStyle] = useState('cursor-crosshair');

  // We use refs for callbacks to avoid re-binding event listeners
  const onSelectPosRef = useRef(onSelectPos);
  onSelectPosRef.current = onSelectPos;

  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;

  // We track visual objects mapped to simulation IDs
  const spriteMap = useRef<Map<string, Container>>((new Map())); // Unit Container (Sprite + Shadow + HP)
  const particleGraphics = useRef<Graphics | null>(null); // Single graphics for all particles (batching)

  // Keyboard State
  const keysPressed = useRef<Set<string>>(new Set());

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // NOTE: We don't need a local ref for 'gameState' anymore because we receive the Ref from parent.



  const terrainGraphics = useRef<Graphics | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Track mounted state to handle async init
    let isMounted = true;
    let app: Application | null = null;

    const initPixi = async () => {
      // 1. Initialize Pixi App (Async in v8)
      const _app = new Application();
      await _app.init({
        resizeTo: containerRef.current!, // strict null check handled by early return
        backgroundColor: 0x1a1a1a,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (!isMounted) {
        _app.destroy();
        return;
      }

      app = _app;
      appRef.current = app;

      // We need to append view. In v8, use app.canvas
      containerRef.current!.appendChild(app.canvas);

      // 2. Setup Scene Graph
      const worldStage = new Container();
      app.stage.addChild(worldStage);

      // Layers
      const terrainLayer = new Graphics();
      const gridLayer = new Graphics();
      const shadowLayer = new Container();
      const unitLayer = new Container();
      const effectLayer = new Container(); // Particles & Projectiles
      const uiLayer = new Container(); // Selection boxes etc

      worldStage.addChild(terrainLayer);
      worldStage.addChild(gridLayer);
      worldStage.addChild(shadowLayer); // Shadows below units
      worldStage.addChild(unitLayer);
      worldStage.addChild(effectLayer);
      worldStage.addChild(uiLayer);

      terrainGraphics.current = terrainLayer;

      // State tracking for grid redraw optimization
      let lastGridSize = -1;

      // 4. Setup Particle Graphics
      const pGraphics = new Graphics();
      effectLayer.addChild(pGraphics);
      particleGraphics.current = pGraphics;


      // 5. Render Loop
      app.ticker.add(() => {
        const state = gameStateRef.current;
        if (!state) return;

        // X. Draw Grid & Terrain (Only if changed or first frame)
        // Actually terrain might change often during edit, so we redraw terrain every frame or check dirty flag?
        // For now, redraw terrain every frame is simplest. Optimization: Chunking.
        // But for grid lines, only check size.

        if (state.gridSize !== lastGridSize) {
          lastGridSize = state.gridSize;
          gridLayer.clear();
          gridLayer.stroke({ width: 1, color: 0x262626 });

          const size = state.gridSize;
          // Calculate grid bounds
          // Need to cover world width/height with hexes
          // W = size * sqrt(3)
          // H = size * 3/2
          const hexW = size * Math.sqrt(3);
          const hexH = size * 1.5;
          const cols = Math.ceil(WORLD_WIDTH / hexW) + 2;
          const rows = Math.ceil(WORLD_HEIGHT / hexH) + 2;

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              // Pointy Top Hex Center
              const x = hexW * (c + 0.5 * (r & 1));
              const y = hexH * r;

              // Draw Hex Polygon
              // Corners: angle = 30 + 60*i
              const path: number[] = [];
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 180) * (30 + 60 * i);
                path.push(x + size * Math.cos(angle));
                path.push(y + size * Math.sin(angle));
              }
              gridLayer.poly(path);
              gridLayer.stroke(); // Draw outlining
            }
          }

          // World Border
          gridLayer.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
          gridLayer.stroke({ width: 5, color: 0x333333 });
        }

        // Draw Terrain
        terrainLayer.clear();
        if (state.terrain) {
          const size = state.gridSize;
          const hexW = size * Math.sqrt(3);
          const hexH = size * 1.5;

          // Iterate terrain map (Key -> Type)
          for (const keyStr in state.terrain) {
            const key = parseInt(keyStr);
            const type = state.terrain[key];

            // DECODE KEY (row * 5000 + col)
            // Assuming max 5000 cols
            const col = key % 5000;
            const row = Math.floor(key / 5000);

            let color = 0x000000;
            let alpha = 1.0;
            if (type === 'WALL') color = 0x888888;
            else if (type === 'WATER') { color = 0x1e3a8a; alpha = 0.8; }
            else if (type === 'FOREST') { color = 0x064e3b; alpha = 0.6; } // Translucent forest

            if (color !== 0) {
              const x = hexW * (col + 0.5 * (row & 1));
              const y = hexH * row;

              const path: number[] = [];
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 180) * (30 + 60 * i);
                path.push(x + size * Math.cos(angle));
                path.push(y + size * Math.sin(angle));
              }
              terrainLayer.poly(path);
              terrainLayer.fill({ color, alpha });
            }
          }
        }

        // A. Sync Units
        const units = state.units; // Array!
        const processedIds = new Set<string>();

        // ... (Unit syncing logic remains same)
        // Optimizing Unit Lookup for Projectiles (unitId -> Unit)
        // Since we receive an array, we might want a Map for O(1) lookup if we do target lookups.
        // But building a Map every frame is overhead.
        // For projectiles we need target position.
        // Let's build a quick map just for positions? Or just iterate?
        // Actually, we can just build the Map once per frame since checking targetId requires it.
        const unitMap = new Map<string, Unit>();
        for (const u of units) unitMap.set(u.id, u);


        // Update/Create
        for (const unit of units) {
          processedIds.add(unit.id);
          let visual = spriteMap.current.get(unit.id);

          // Create if missing
          if (!visual) {
            visual = createUnitVisual(unit);
            unitLayer.addChild(visual);
            spriteMap.current.set(unit.id, visual);
          }

          // Update Transform
          visual.position.set(unit.position.x, unit.position.y);

          // Rotation (Child 1 is the body: Shadow=0, Body=1, HP=2)
          const body = visual.children[1] as Sprite;

          const speedSq = unit.velocity.x ** 2 + unit.velocity.y ** 2;
          if (speedSq > 0.01) {
            visual.rotation = 0;
            body.rotation = Math.atan2(unit.velocity.y, unit.velocity.x);
          }

          // Update Health Bar (Child 2)
          const hpBar = visual.children[2] as Graphics;
          updateHealthBar(hpBar, unit);
        }

        // Cleanup Dead Units
        for (const [id, visual] of spriteMap.current) {
          if (!processedIds.has(id)) {
            visual.destroy({ children: true }); // cleanup
            spriteMap.current.delete(id);
          }
        }

        // B. Render Particles & Projectiles
        pGraphics.clear();

        // Particles
        for (const p of state.particles) {
          pGraphics.circle(p.position.x, p.position.y, p.size);
          pGraphics.fill({ color: stringToHex(p.color), alpha: p.life / p.maxLife });
        }

        // Projectiles (Arrows/Beams)
        for (const unit of units) {
          const config = UNIT_CONFIGS[unit.type];
          if (unit.targetId && unit.cooldownTimer > config.attackCooldown - 5) {
            const target = unitMap.get(unit.targetId);
            if (target) {
              const color = unit.team === Team.BLUE ? TEAM_COLORS.BLUE.bullet : TEAM_COLORS.RED.bullet;

              if (unit.type === UnitType.ARCHER) {
                // Arrow logic
                const t = 1 - (unit.cooldownTimer - (config.attackCooldown - 5)) / 5;
                const dx = target.position.x - unit.position.x;
                const dy = target.position.y - unit.position.y;
                const arrowX = unit.position.x + dx * t;
                const arrowY = unit.position.y + dy * t;

                pGraphics.circle(arrowX, arrowY, 3);
                pGraphics.fill(stringToHex(color));
              } else {
                // Melee Sweep
                pGraphics.moveTo(unit.position.x, unit.position.y);
                pGraphics.lineTo(target.position.x, target.position.y);
                pGraphics.stroke({ width: 2, color: stringToHex(color) });
              }
            }
          }
        }

        // Keyboard Panning
        const stage = worldStage; // Alias for clarity
        const panSpeed = 15 / stage.scale.x;
        if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) stage.y += panSpeed;
        if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) stage.y -= panSpeed;
        if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) stage.x += panSpeed;
        if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) stage.x -= panSpeed;

        // Mouse edge panning? Maybe later.

      });

      // Camera State in Pixi
      worldStage.position.set(app.screen.width / 2, app.screen.height / 2);
      worldStage.scale.set(0.5); // Initial Zoom
    };

    initPixi();

    return () => {
      isMounted = false;
      if (app) {
        app.destroy({ removeView: true }, { children: true });
      }
    };
  }, []);

  // Helpers
  // ... (createUnitVisual, updateHealthBar, stringToHex remain)

  const createUnitVisual = (unit: Unit): Container => {
    const container = new Container();
    const config = UNIT_CONFIGS[unit.type];

    // 1. Shadow (Child 0)
    const shadowTex = SpriteCache.getShadowTexture();
    const shadow = new Sprite(shadowTex);
    shadow.anchor.set(0.5);
    const shadowSize = config.radius * 2.5 / 64;
    shadow.scale.set(shadowSize);
    shadow.alpha = 0.5;
    shadow.position.set(3, 3);
    container.addChild(shadow);

    // 2. Body (Child 1)
    const tex = SpriteCache.getTexture(unit.type, unit.team);
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    container.addChild(sprite);

    // 3. Health Bar (Child 2)
    const hpBar = new Graphics();
    hpBar.position.set(0, -config.radius - 8);
    container.addChild(hpBar);

    return container;
  };

  const updateHealthBar = (g: Graphics, unit: Unit) => {
    g.clear();
    if (unit.health < unit.maxHealth) {
      const pct = unit.health / unit.maxHealth;
      const w = 24;
      const h = 4;

      g.rect(-w / 2, 0, w, h);
      g.fill({ color: 0x000000, alpha: 0.5 });

      const color = pct > 0.5 ? 0x22c55e : (pct > 0.25 ? 0xeab308 : 0xef4444);
      g.rect(-w / 2, 0, w * pct, h);
      g.fill({ color: color });
    }
  };

  const stringToHex = (str: string): number => {
    if (str.startsWith('#')) return parseInt(str.slice(1), 16);
    return 0xffffff;
  }

  // Input Handling (Refs because Event Listeners capture closure)
  const isDragging = useRef(false);
  const isPainting = useRef(false); // New flag for painting interaction
  const lastMouse = useRef({ x: 0, y: 0 });

  // Native DOM Listeners for Input
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!appRef.current) return;
      const stage = appRef.current.stage.children[0] as Container;

      const zoomSensitivity = 0.001;
      const oldZoom = stage.scale.x;
      const newZoom = Math.min(Math.max(0.1, oldZoom - e.deltaY * zoomSensitivity), 4);

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - stage.x) / oldZoom;
      const worldY = (mouseY - stage.y) / oldZoom;

      stage.scale.set(newZoom);
      stage.x = mouseX - worldX * newZoom;
      stage.y = mouseY - worldY * newZoom;
    };

    const getEventPos = (e: MouseEvent) => {
      if (!appRef.current) return { x: 0, y: 0 };
      const stage = appRef.current.stage.children[0] as Container;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - stage.x) / stage.scale.x;
      const worldY = (mouseY - stage.y) / stage.scale.y;
      return { x: worldX, y: worldY };
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.altKey) {
        e.preventDefault();
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setCursorStyle('cursor-grabbing');
      } else if (e.button === 0) {
        // Painting or Spawning
        isPainting.current = true;
        const { x, y } = getEventPos(e);
        onSelectPosRef.current(x, y);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current && appRef.current) {
        const stage = appRef.current.stage.children[0] as Container;
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        stage.x += dx;
        stage.y += dy;
        lastMouse.current = { x: e.clientX, y: e.clientY };
      } else if (isPainting.current) {
        // Only allow continuous painting/spawning if in TERRAIN mode
        if (editModeRef.current === 'TERRAIN') {
          const { x, y } = getEventPos(e);
          onSelectPosRef.current(x, y);
        }
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
      isPainting.current = false;
      setCursorStyle('cursor-crosshair');
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} className={`w-full h-full relative overflow-hidden bg-black ${cursorStyle}`}>
      <div className="absolute top-4 left-4 text-white/50 text-xs select-none pointer-events-none z-10">
        PixiJS + Web Worker Mode • Left-click to Spawn • WASD/Drag to Pan
      </div>
    </div>
  );
};