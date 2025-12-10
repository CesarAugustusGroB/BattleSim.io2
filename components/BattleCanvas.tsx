import React, { useRef, useEffect } from 'react';
import { SimulationEngine } from '../services/simulation';
import { WORLD_WIDTH, WORLD_HEIGHT, TEAM_COLORS, UNIT_CONFIGS } from '../constants';
import { Team, Vector2, UnitType } from '../types';

interface BattleCanvasProps {
  simulation: SimulationEngine;
  onSelectPos: (x: number, y: number) => void;
}

export const BattleCanvas: React.FC<BattleCanvasProps> = ({ simulation, onSelectPos }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera State
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.5 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency on bg
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (!ctx || !canvas) return;

      // Handle Resize
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      }

      const cam = cameraRef.current;

      // Clear Screen
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      // Apply Camera Transform
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Draw World Bounds
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      
      // Draw Grid Lines (Optimization: only draw visible lines?)
      ctx.strokeStyle = '#262626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_WIDTH; x += 100) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
      }
      for (let y = 0; y <= WORLD_HEIGHT; y += 100) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_WIDTH, y);
      }
      ctx.stroke();

      // Render Units
      for (const unit of simulation.units.values()) {
        const config = UNIT_CONFIGS[unit.type];
        const colors = unit.team === Team.BLUE ? TEAM_COLORS.BLUE : TEAM_COLORS.RED;
        
        // Draw Body
        ctx.beginPath();
        ctx.arc(unit.position.x, unit.position.y, config.radius, 0, Math.PI * 2);
        ctx.fillStyle = colors.primary;
        ctx.fill();
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Health Bar (Optimization: only if damaged?)
        if (unit.health < unit.maxHealth) {
          const hpPct = unit.health / unit.maxHealth;
          const barWidth = config.radius * 2;
          ctx.fillStyle = 'red';
          ctx.fillRect(unit.position.x - config.radius, unit.position.y - config.radius - 6, barWidth, 3);
          ctx.fillStyle = '#00ff00';
          ctx.fillRect(unit.position.x - config.radius, unit.position.y - config.radius - 6, barWidth * hpPct, 3);
        }

        // Draw Projectiles/Attack Lines
        if (unit.targetId && unit.cooldownTimer > config.attackCooldown - 5) {
            const target = simulation.units.get(unit.targetId);
            if (target) {
                ctx.beginPath();
                ctx.moveTo(unit.position.x, unit.position.y);
                ctx.lineTo(target.position.x, target.position.y);
                ctx.strokeStyle = colors.bullet;
                ctx.lineWidth = unit.type === UnitType.ARCHER ? 1 : 3;
                ctx.stroke();
            }
        }
      }

      // Render Particles
      for (const p of simulation.particles) {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [simulation]);

  // Mouse Handlers for Camera and Spawning
  const handleWheel = (e: React.WheelEvent) => {
    const cam = cameraRef.current;
    const zoomSensitivity = 0.001;
    const newZoom = Math.min(Math.max(0.1, cam.zoom - e.deltaY * zoomSensitivity), 3);
    cam.zoom = newZoom;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || e.altKey) { // Right click or Alt+Click to pan
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else {
      // Convert screen to world
      const rect = canvasRef.current!.getBoundingClientRect();
      const cam = cameraRef.current;
      
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Inverse Transform
      const worldX = (screenX - rect.width / 2) / cam.zoom + cam.x;
      const worldY = (screenY - rect.height / 2) / cam.zoom + cam.y;

      onSelectPos(worldX, worldY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      
      cameraRef.current.x -= dx / cameraRef.current.zoom;
      cameraRef.current.y -= dy / cameraRef.current.zoom;
      
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-black cursor-crosshair">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        className="block"
      />
      <div className="absolute top-4 left-4 text-white/50 text-xs select-none pointer-events-none">
        Right-click to Pan • Scroll to Zoom • Left-click to Spawn
      </div>
    </div>
  );
};