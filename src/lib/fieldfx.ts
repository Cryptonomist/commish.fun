/* WEATHER AND LIGHT, PAINTED. Shared by both arcade canvases.
 *
 * lib/conditions.ts decides what the weather does to the football. This file
 * decides what it looks like, and only that: rain streaks, snowflakes, gusts,
 * the tint of a sunset and the dark of a night game. Both the top-down field
 * in Commish Bowl and the kicker's-eye view use it, so a rainy game is the
 * same rain from either camera.
 *
 * EVERYTHING IS fillStyle AND fillRect, and that is a rule rather than a habit.
 * scripts/render-kickcam.mjs renders these frames to PNG through a shim that
 * implements exactly those two members, which is the only way pixel art on
 * this project has ever been checked honestly. A gradient or a composite mode
 * would draw fine in a browser and be invisible to the one tool that looks.
 *
 * Particles live in screen space: weather falls past the camera, it does not
 * sit on the grass. Deterministic from a seed, so a test can step a storm.
 */

import type { TimeOfDay, Weather } from "@/lib/conditions";

export type Flake = {
  x: number;
  y: number;
  /** Fall speed and sway, per frame, in screen pixels. */
  vy: number;
  sway: number;
  phase: number;
  size: 1 | 2;
};

/** How many particles a weather puts on a 320 by 180 screen. */
const COUNT: Record<Weather, number> = { clear: 0, rain: 110, snow: 90, wind: 26 };

function generator(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeWeather(seed: number, weather: Weather, w = 320, h = 180): Flake[] {
  const rand = generator(seed);
  const flakes: Flake[] = [];
  for (let i = 0; i < COUNT[weather]; i++) {
    flakes.push({
      x: rand() * w,
      y: rand() * h,
      vy:
        weather === "rain"
          ? 5 + rand() * 3
          : weather === "snow"
            ? 0.45 + rand() * 0.7
            : 0,
      sway: weather === "wind" ? 2.5 + rand() * 3 : 0.3 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      size: rand() < (weather === "snow" ? 0.35 : 0) ? 2 : 1,
    });
  }
  return flakes;
}

/** One frame. `drift` is the wind across the screen, in pixels a frame, so
 *  snow blows the way the flag says. Particles wrap rather than respawn, which
 *  keeps a storm at a constant density. */
export function stepWeather(
  flakes: Flake[],
  weather: Weather,
  drift: number,
  w = 320,
  h = 180,
): void {
  for (const f of flakes) {
    f.phase += 0.08;
    if (weather === "wind") {
      // A gust streak runs across the screen with the wind, never against it.
      f.x += (drift >= 0 ? 1 : -1) * f.sway;
      f.y += Math.sin(f.phase) * 0.2;
    } else if (weather === "rain") {
      f.x += drift * 1.4 - 0.8;
      f.y += f.vy;
    } else {
      f.x += drift + Math.sin(f.phase) * f.sway;
      f.y += f.vy;
    }
    if (f.y > h + 4) f.y -= h + 8;
    if (f.y < -4) f.y += h + 8;
    if (f.x > w + 8) f.x -= w + 16;
    if (f.x < -8) f.x += w + 16;
  }
}

export function drawWeather(
  ctx: CanvasRenderingContext2D,
  flakes: Flake[],
  weather: Weather,
): void {
  if (weather === "rain") {
    ctx.fillStyle = "rgba(196,214,255,0.55)";
    for (const f of flakes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      // A streak is three pixels on a slant: rain at this size is a direction.
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      ctx.fillRect(x - 1, y + 2, 1, 1);
    }
  } else if (weather === "snow") {
    ctx.fillStyle = "rgba(251,253,248,0.9)";
    for (const f of flakes) {
      ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
    }
  } else if (weather === "wind") {
    ctx.fillStyle = "rgba(251,253,248,0.28)";
    for (const f of flakes) {
      const len = 4 + Math.round(f.sway);
      ctx.fillRect(Math.round(f.x), Math.round(f.y), len, 1);
    }
  }
}

/* THE LIGHT.
 *
 * A wash over the whole picture, in one or two fills. Dusk is warm and a
 * little dim; night is a cool dark that leaves the field lit, because a night
 * game on television is a bright field under a black sky, not a dim one.
 *
 * `layer` exists because a sprite that is darkened as much as the grass under
 * it stops reading as a player. The field takes the full wash and the players
 * take a lighter one on top, which is roughly what stadium lights do anyway. */
export function drawLight(
  ctx: CanvasRenderingContext2D,
  time: TimeOfDay,
  layer: "field" | "players",
  w = 320,
  h = 180,
): void {
  if (time === "day") return;
  if (time === "dusk") {
    ctx.fillStyle = layer === "field" ? "rgba(255,112,48,0.12)" : "rgba(255,112,48,0.07)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = layer === "field" ? "rgba(46,16,64,0.14)" : "rgba(46,16,64,0.06)";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = layer === "field" ? "rgba(3,8,30,0.34)" : "rgba(3,8,30,0.12)";
  ctx.fillRect(0, 0, w, h);
}

/* SNOW ON THE GROUND and a wet sheen in the rain, for the top-down field.
 * Anchored to the world rather than the screen, so the snow cover scrolls with
 * the grass it is lying on instead of sliding over it. */
export function drawGroundCover(
  ctx: CanvasRenderingContext2D,
  weather: Weather,
  camX: number,
  w = 320,
  h = 180,
): void {
  if (weather === "rain") {
    ctx.fillStyle = "rgba(12,34,70,0.16)";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (weather !== "snow") return;
  ctx.fillStyle = "rgba(232,240,250,0.16)";
  ctx.fillRect(0, 0, w, h);
  // A fixed scatter per 64-pixel tile of field, keyed by the tile's world x.
  ctx.fillStyle = "rgba(251,253,248,0.42)";
  const first = Math.floor(camX / 64) - 1;
  const last = Math.ceil((camX + w) / 64) + 1;
  for (let t = first; t <= last; t++) {
    const rand = generator(t * 2654435761 + 7);
    for (let i = 0; i < 26; i++) {
      const x = Math.round(t * 64 + rand() * 64 - camX);
      const y = Math.round(rand() * h);
      if (x < -2 || x > w + 2) continue;
      ctx.fillRect(x, y, rand() < 0.3 ? 2 : 1, 1);
    }
  }
}

/* SHADOWS, and the time of day is in their length. Noon puts a small one under
 * the feet; a sunset stretches it a long way to one side; stadium lights throw
 * two short ones either way. Drawn before the sprites, on the grass. */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: TimeOfDay,
): void {
  const fx = Math.round(x);
  const fy = Math.round(y) + 14;
  if (time === "day") {
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(fx, fy, 9, 2);
  } else if (time === "dusk") {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(fx + 3, fy, 14, 2);
    ctx.fillRect(fx + 9, fy - 1, 8, 1);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(fx - 4, fy, 8, 2);
    ctx.fillRect(fx + 5, fy, 8, 2);
  }
}

/* LIGHT POOLS for a night game seen from above: the field under the towers is
 * a touch brighter than the field between them. Stepped rings rather than a
 * gradient, for the same reason as everything else in this file, and anchored
 * to world x so they stay put as the camera moves. */
export function drawLightPools(
  ctx: CanvasRenderingContext2D,
  camX: number,
  worldW: number,
  w = 320,
  h = 180,
): void {
  const towers = [0.2, 0.5, 0.8].map((f) => f * worldW);
  for (const tx of towers) {
    for (const cy of [8, h - 8]) {
      const cx = Math.round(tx - camX);
      if (cx < -80 || cx > w + 80) continue;
      for (const [r, a] of [
        [70, 0.035],
        [48, 0.04],
        [28, 0.045],
      ] as const) {
        ctx.fillStyle = `rgba(255,240,205,${a})`;
        for (let dy = -r; dy <= r; dy += 2) {
          const yy = cy + dy;
          if (yy < 0 || yy >= h) continue;
          const half = Math.round(Math.sqrt(r * r - dy * dy) * 1.6);
          ctx.fillRect(cx - half, yy, half * 2, 2);
        }
      }
    }
  }
}
