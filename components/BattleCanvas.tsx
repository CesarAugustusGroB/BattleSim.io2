import React, { useRef, useEffect, useState } from 'react';
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
  const [cursorStyle, setCursorStyle] = useState('cursor-crosshair');

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

  const getWorldPos = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const cam = cameraRef.current;

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - rect.width / 2) / cam.zoom + cam.x,
      y: (screenY - rect.height / 2) / cam.zoom + cam.y
    };
  };

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

      // Keyboard Panning
      const panSpeed = 15 / cam.zoom;
      if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) cam.y -= panSpeed;
      if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) cam.y += panSpeed;
      if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) cam.x -= panSpeed;
      if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) cam.x += panSpeed;

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

        // Draw Shadow (offset for depth)
        ctx.beginPath();
        ctx.arc(unit.position.x + 3, unit.position.y + 3, config.radius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();

        // Draw Body
        ctx.beginPath();
        ctx.arc(unit.position.x, unit.position.y, config.radius, 0, Math.PI * 2);
        ctx.fillStyle = colors.primary;
        ctx.fill();
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Facing Direction (arrow/wedge)
        const speed = Math.sqrt(unit.velocity.x ** 2 + unit.velocity.y ** 2);
        if (speed > 0.1) {
          const angle = Math.atan2(unit.velocity.y, unit.velocity.x);
          ctx.save();
          ctx.translate(unit.position.x, unit.position.y);
          ctx.rotate(angle);

          // Draw direction indicator
          ctx.beginPath();
          ctx.moveTo(config.radius * 0.8, 0);
          ctx.lineTo(config.radius * 0.3, -config.radius * 0.4);
          ctx.lineTo(config.radius * 0.3, config.radius * 0.4);
          ctx.closePath();
          ctx.fillStyle = colors.secondary;
          ctx.fill();
          ctx.restore();
        }

        // Draw Health Bar (animated smooth)
        if (unit.health < unit.maxHealth) {
          const hpPct = Math.max(0, unit.health / unit.maxHealth);
          const barWidth = config.radius * 2.5;
          const barHeight = 4;
          const barY = unit.position.y - config.radius - 10;

          // Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(unit.position.x - barWidth / 2, barY, barWidth, barHeight);

          // Health gradient
          const gradient = ctx.createLinearGradient(
            unit.position.x - barWidth / 2, barY,
            unit.position.x + barWidth / 2, barY
          );
          if (hpPct > 0.5) {
            gradient.addColorStop(0, '#22c55e');
            gradient.addColorStop(1, '#4ade80');
          } else if (hpPct > 0.25) {
            gradient.addColorStop(0, '#eab308');
            gradient.addColorStop(1, '#facc15');
          } else {
            gradient.addColorStop(0, '#dc2626');
            gradient.addColorStop(1, '#ef4444');
          }
          ctx.fillStyle = gradient;
          ctx.fillRect(unit.position.x - barWidth / 2, barY, barWidth * hpPct, barHeight);
        }

        // Draw Attack Lines / Projectiles
        if (unit.targetId && unit.cooldownTimer > config.attackCooldown - 5) {
          const target = simulation.units.get(unit.targetId);
          if (target) {
            if (unit.type === UnitType.ARCHER) {
              // Draw arrow projectile
              const dx = target.position.x - unit.position.x;
              const dy = target.position.y - unit.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const t = 1 - (unit.cooldownTimer - (config.attackCooldown - 5)) / 5;

              const arrowX = unit.position.x + dx * t;
              const arrowY = unit.position.y + dy * t;
              const angle = Math.atan2(dy, dx);

              ctx.save();
              ctx.translate(arrowX, arrowY);
              ctx.rotate(angle);

              // Arrow shape
              ctx.beginPath();
              ctx.moveTo(8, 0);
              ctx.lineTo(-4, -3);
              ctx.lineTo(-2, 0);
              ctx.lineTo(-4, 3);
              ctx.closePath();
              ctx.fillStyle = colors.bullet;
              ctx.fill();
              ctx.restore();
            } else {
              // Melee attack flash
              ctx.beginPath();
              ctx.moveTo(unit.position.x, unit.position.y);
              ctx.lineTo(target.position.x, target.position.y);
              ctx.strokeStyle = colors.bullet;
              ctx.lineWidth = 3;
              ctx.globalAlpha = 0.7;
              ctx.stroke();
              ctx.globalAlpha = 1.0;
            }
          }
        }
      }

      // Render Particles with glow
      for (const p of simulation.particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;

        // Glow effect
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [simulation]); // removed currentDrag dependency

  // Mouse Handlers for Camera and Spawning

  // use non-passive event listener for wheel to allows preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;

      // Smart Zoom: Zoom towards mouse cursor
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // World pos before zoom
      const worldBefore = {
        x: (mouseX - rect.width / 2) / cam.zoom + cam.x,
        y: (mouseY - rect.height / 2) / cam.zoom + cam.y
      };

      const zoomSensitivity = 0.001;
      const newZoom = Math.min(Math.max(0.1, cam.zoom - e.deltaY * zoomSensitivity), 3);
      cam.zoom = newZoom;

      // Calculate new cam position
      cam.x = worldBefore.x - (mouseX - rect.width / 2) / newZoom;
      cam.y = worldBefore.y - (mouseY - rect.height / 2) / newZoom;
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle Click or Alt+Click to pan
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setCursorStyle('cursor-grabbing');
      return;
    }

    // Left Click - Spawn Unit
    if (e.button === 0) {
      const worldPos = getWorldPos(e.clientX, e.clientY);
      onSelectPos(worldPos.x, worldPos.y);
    }

    // Right Click - Currently does nothing (removed Selection logic)
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      // Pan Camera
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;

      cameraRef.current.x -= dx / cameraRef.current.zoom;
      cameraRef.current.y -= dy / cameraRef.current.zoom;

      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      setCursorStyle('cursor-crosshair');
    }
  };

  return (
    <div ref={containerRef} className={`w-full h-full relative overflow-hidden bg-black ${cursorStyle}`}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        className="block"
      />
      <div className="absolute top-4 left-4 text-white/50 text-xs select-none pointer-events-none">
        Left-click to Spawn • Middle-click/WASD to Pan • Scroll to Zoom
      </div>
    </div>
  );
};