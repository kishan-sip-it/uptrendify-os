'use client';

import { useEffect, useRef } from 'react';

type CanvasShardsProps = {
  className?: string;
  backgroundColor?: string;
  shardColor?: string;
  accentColor?: string;
  density?: number;
  speed?: number;
  interactionRadius?: number;
  interactionStrength?: number;
};

type RGB = { r: number; g: number; b: number };

type Shard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  size: number;
  length: number;
  width: number;
  rotation: number;
  rotationSpeed: number;
  phase: number;
  alpha: number;
  spin: number;
  glow: boolean;
};

const DEFAULTS = {
  backgroundColor: '#120F17',
  shardColor: '#896ABD',
  accentColor: '#A855F7',
  density: 1,
  speed: 0.75,
  interactionRadius: 220,
  interactionStrength: 0.55,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string, fallback: RGB): RGB {
  const hex = value.trim().replace('#', '');
  if (!/^[0-9a-f]{3,8}$/i.test(hex)) return fallback;
  const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const number = Number.parseInt(normalized.slice(0, 6), 16);
  if (!Number.isFinite(number)) return fallback;
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgba(color: RGB, alpha: number) {
  return `rgba(${color.r},${color.g},${color.b},${clamp(alpha, 0, 1)})`;
}

function mixColor(a: RGB, b: RGB, amount: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  };
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function createShard(rng: () => number, width: number, height: number): Shard {
  const depth = 0.35 + rng() * 0.9;
  const base = Math.min(width, height) * (0.018 + rng() * 0.028);

  return {
    x: rng() * width,
    y: rng() * height,
    vx: (rng() - 0.5) * 0.18,
    vy: -(0.03 + rng() * 0.12),
    z: depth,
    size: base,
    length: base * (1.8 + rng() * 2.2),
    width: base * (0.45 + rng() * 0.45),
    rotation: rng() * Math.PI * 2,
    rotationSpeed: (rng() - 0.5) * 0.0018,
    phase: rng() * Math.PI * 2,
    alpha: 0.16 + rng() * 0.34,
    spin: rng() > 0.55 ? 1 : -1,
    glow: rng() > 0.72,
  };
}

function drawShard(
  ctx: CanvasRenderingContext2D,
  shard: Shard,
  baseColor: RGB,
  accentColor: RGB,
  time: number,
) {
  const shimmer = 0.5 + 0.5 * Math.sin(time * 0.0014 * shard.spin + shard.phase);
  const highlight = mixColor(baseColor, accentColor, 0.3 + shimmer * 0.35);

  ctx.save();
  ctx.translate(shard.x, shard.y);
  ctx.rotate(shard.rotation);

  if (shard.glow) {
    ctx.shadowBlur = Math.min(14, shard.size * 0.75);
    ctx.shadowColor = rgba(accentColor, 0.24);
  }

  const gradient = ctx.createLinearGradient(-shard.length * 0.5, 0, shard.length * 0.55, 0);
  gradient.addColorStop(0, rgba(baseColor, shard.alpha * 0.46));
  gradient.addColorStop(0.42, rgba(highlight, shard.alpha));
  gradient.addColorStop(1, rgba(accentColor, shard.alpha * 0.22));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-shard.length * 0.56, 0);
  ctx.lineTo(-shard.length * 0.15, -shard.width);
  ctx.lineTo(shard.length * 0.56, -shard.width * 0.18);
  ctx.lineTo(shard.length * 0.12, shard.width * 0.9);
  ctx.lineTo(-shard.length * 0.34, shard.width * 0.32);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(accentColor, shard.alpha * 0.13);
  ctx.beginPath();
  ctx.moveTo(-shard.length * 0.15, -shard.width);
  ctx.lineTo(shard.length * 0.56, -shard.width * 0.18);
  ctx.lineTo(shard.length * 0.12, shard.width * 0.9);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(highlight, shard.alpha * 0.32);
  ctx.lineWidth = Math.max(0.65, shard.size * 0.035);
  ctx.beginPath();
  ctx.moveTo(-shard.length * 0.15, -shard.width);
  ctx.lineTo(shard.length * 0.56, -shard.width * 0.18);
  ctx.stroke();

  ctx.restore();
}

export default function CanvasShards({
  className = '',
  backgroundColor = DEFAULTS.backgroundColor,
  shardColor = DEFAULTS.shardColor,
  accentColor = DEFAULTS.accentColor,
  density = DEFAULTS.density,
  speed = DEFAULTS.speed,
  interactionRadius = DEFAULTS.interactionRadius,
  interactionStrength = DEFAULTS.interactionStrength,
}: CanvasShardsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const root = canvas.parentElement;
    if (!root) return;

    const baseColor = parseHexColor(shardColor, { r: 137, g: 106, b: 189 });
    const accent = parseHexColor(accentColor, { r: 168, g: 85, b: 247 });
    const background = backgroundColor.trim() || DEFAULTS.backgroundColor;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0, y: 0, active: false };

    let width = 1;
    let height = 1;
    let dpr = 1;
    let shards: Shard[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let animationFrame = 0;
    let visible = true;
    let lastTime = performance.now();

    const rebuild = () => {
      width = Math.max(1, root.clientWidth);
      height = Math.max(1, root.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const areaCount = Math.round((width * height) / 28000);
      const mobile = width < 700;
      const count = clamp(Math.round((areaCount + 16) * density), mobile ? 16 : 24, 52);
      const rng = createRng(0x5eed1234 + Math.round(width) + Math.round(height));
      shards = Array.from({ length: count }, () => createShard(rng, width, height));
      drawFrame(performance.now(), true);
    };

    const drawFrame = (timestamp: number, force = false) => {
      if (!visible && !force) return;

      const elapsed = Math.min(0.035, Math.max(0.001, (timestamp - lastTime) / 1000));
      lastTime = timestamp;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      if (!reduceMotion.matches) {
        const movement = speed * 26;
        for (const shard of shards) {
          const floatX = Math.sin(timestamp * 0.00032 + shard.phase) * 0.22;
          const floatY = Math.cos(timestamp * 0.00044 + shard.phase * 1.7) * 0.18;

          shard.vx += floatX * elapsed * shard.z;
          shard.vy += floatY * elapsed * shard.z;

          if (pointer.active) {
            const dx = shard.x - pointer.x;
            const dy = shard.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0.001 && distance < interactionRadius) {
              const falloff = (1 - distance / interactionRadius) ** 2;
              const force = falloff * interactionStrength * elapsed * 120;
              shard.vx += (dx / distance) * force;
              shard.vy += (dy / distance) * force;
              shard.rotation += shard.spin * falloff * elapsed * 0.75;
            }
          }

          const velocityDamping = Math.pow(0.93, elapsed * 60);
          shard.vx *= velocityDamping;
          shard.vy *= velocityDamping;

          shard.x += (shard.vx + shard.z * 0.14) * movement * elapsed;
          shard.y += (shard.vy - shard.z * 0.42) * movement * elapsed;
          shard.rotation += shard.rotationSpeed * movement * elapsed * 60;

          const padding = shard.length + 40;
          if (shard.x > width + padding) shard.x = -padding;
          if (shard.x < -padding) shard.x = width + padding;
          if (shard.y < -padding) {
            shard.y = height + padding;
            shard.x = (shard.x + width * 0.33) % width;
          }
          if (shard.y > height + padding) shard.y = -padding;
        }
      }

      shards.sort((a, b) => a.z - b.z);
      for (const shard of shards) drawShard(ctx, shard, baseColor, accent, timestamp);

      if (!reduceMotion.matches) {
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active =
        pointer.x >= 0 &&
        pointer.y >= 0 &&
        pointer.x <= rect.width &&
        pointer.y <= rect.height;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onVisibilityChange = () => {
      visible = document.visibilityState === 'visible';
      if (visible && !reduceMotion.matches && !animationFrame) {
        lastTime = performance.now();
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };

    const onMotionChange = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      lastTime = performance.now();
      drawFrame(lastTime, true);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reduceMotion.addEventListener('change', onMotionChange);

    resizeObserver = new ResizeObserver(rebuild);
    resizeObserver.observe(root);

    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !reduceMotion.matches && !animationFrame) {
          lastTime = performance.now();
          animationFrame = window.requestAnimationFrame(drawFrame);
        }
      },
      { threshold: 0.01 },
    );
    visibilityObserver.observe(root);

    rebuild();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reduceMotion.removeEventListener('change', onMotionChange);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
    };
  }, [accentColor, backgroundColor, density, interactionRadius, interactionStrength, shardColor, speed]);

  return (
    <div
      className={`canvas-shards ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="canvas-shards__canvas" />
    </div>
  );
}
