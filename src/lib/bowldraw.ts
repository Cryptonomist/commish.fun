/* COMMISH BOWL, PAINTED. The top-down field with a play on it.
 *
 * Pure drawing, like lib/pixel.ts and lib/kickcam.ts: it takes a play and a
 * handful of choices about how to look at it and paints one frame. No state,
 * no clock, no React. The component decides when to call it.
 *
 * THE MIRROR. A play is simulated with the team in possession attacking +x.
 * When that team is the computer's, the picture is flipped left to right, so
 * the person always attacks toward the right-hand side of the screen and the
 * computer always toward the left. Everything that turns a simulation x into a
 * screen x goes through `screenX` or `pointX` here, and nowhere else, because
 * a mirror applied in two places is a mirror applied twice.
 *
 * fillStyle and fillRect only, so scripts can render it without a browser.
 */

import { FIELD, GOAL, VIEW_H, VIEW_W, WORLD } from "@/lib/bowl";
import type { Play, Side } from "@/lib/bowlplay";
import type { TimeOfDay, Weather } from "@/lib/conditions";
import {
  drawGroundCover,
  drawLight,
  drawLightPools,
  drawShadow,
  drawWeather,
  type Flake,
} from "@/lib/fieldfx";
import { drawTextUp } from "@/lib/fieldfont";
import { drawField, drawPlayer, type Kit, PX, SPRITE_W } from "@/lib/pixel";

/** A sprite's left edge on the mirrored or unmirrored field. */
export const screenX = (x: number, mirrored: boolean): number =>
  mirrored ? WORLD - x - SPRITE_W : x;

/** A point, such as the ball, on the mirrored or unmirrored field. */
export const pointX = (x: number, mirrored: boolean): number => (mirrored ? WORLD - x : x);

/** What the camera should be looking at, in the play's own frame. Ahead of a
 *  quarterback in the pocket, so the receivers are on screen; on the ball
 *  otherwise. */
export function focusOf(p: Play): number {
  const f = p.flight;
  if (f) return f.x;
  if (p.carrier >= 0) {
    const c = p.actors[p.carrier];
    const pocket =
      p.type === "scrimmage" && c.role === "qb" && !p.thrown && !p.crossed && (p.off === "short" || p.off === "deep");
    if (pocket) return c.x + 76;
    if (p.type === "punt" && !p.kicked) return c.x + 90;
    return c.x + 4;
  }
  if (p.type === "kickoff" || p.type === "onside") return p.los + 70;
  return p.los + 40;
}

/** Where the camera's left edge sits for a focus point, in screen terms. */
export function cameraFor(focus: number, mirrored: boolean): number {
  const x = pointX(focus, mirrored);
  return Math.max(0, Math.min(WORLD - VIEW_W, Math.round(x - VIEW_W / 2)));
}

export type BowlView = {
  play: Play;
  mirrored: boolean;
  /** The kits for side 0 and side 1 of this play. */
  kits: [Kit, Kit];
  camX: number;
  time: TimeOfDay;
  weather: Weather;
  flakes: Flake[];
  frame: number;
  /** Receiver numbers over their heads, while a person could throw to them. */
  tags: boolean;
  /** A kick being lined up: the aim in degrees and the power so far. */
  aim: { degrees: number; power: number } | null;
};

export function drawBowl(ctx: CanvasRenderingContext2D, v: BowlView): void {
  const { play: p, mirrored, camX } = v;

  drawField(ctx, VIEW_W, VIEW_H, camX, FIELD);
  drawGroundCover(ctx, v.weather, camX, VIEW_W, VIEW_H);
  drawLight(ctx, v.time, "field", VIEW_W, VIEW_H);
  if (v.time === "night") drawLightPools(ctx, camX, WORLD, VIEW_W, VIEW_H);

  // The line of scrimmage in orange and the line to gain in the goalposts'
  // yellow, the colour a broadcast paints it.
  if (p.type === "scrimmage") {
    dashes(ctx, Math.round(pointX(p.los, mirrored) - camX), PX.action);
    if (p.marker < GOAL) dashes(ctx, Math.round(pointX(p.marker, mirrored) - camX), PX.post);
  }

  const order = p.actors.map((_, i) => i).sort((a, b) => p.actors[a].y - p.actors[b].y);

  for (const i of order) {
    const a = p.actors[i];
    drawShadow(ctx, screenX(a.x, mirrored) - camX, a.y, v.time);
  }

  const stride = Math.floor(v.frame / 4) % 2 === 0;
  for (const i of order) {
    const a = p.actors[i];
    const sx = screenX(a.x, mirrored) - camX;
    if (sx < -12 || sx > VIEW_W + 4) continue;
    const vx = mirrored ? -a.vx : a.vx;
    const moving = Math.hypot(a.vx, a.vy) > 0.05;
    const home: 1 | -1 = (a.team === 0) !== mirrored ? 1 : -1;
    drawPlayer(ctx, sx, a.y, v.kits[a.team as Side], {
      stride: moving && stride,
      facing: vx > 0.05 ? 1 : vx < -0.05 ? -1 : home,
      ball: i === p.carrier,
    });
  }

  drawLight(ctx, v.time, "players", VIEW_W, VIEW_H);

  // The person's player: a chevron over his head.
  if (p.human >= 0 && p.humanSide !== null && !p.result) {
    const a = p.actors[p.human];
    const x = Math.round(screenX(a.x, mirrored) - camX);
    const y = Math.round(a.y);
    ctx.fillStyle = PX.panel;
    ctx.fillRect(x, y - 7, 9, 4);
    ctx.fillStyle = PX.action;
    ctx.fillRect(x + 1, y - 6, 7, 1);
    ctx.fillRect(x + 2, y - 5, 5, 1);
    ctx.fillRect(x + 3, y - 4, 3, 1);
  }

  // Beside the helmet rather than over it, so a number never sits on the
  // player lined up above its receiver.
  if (v.tags) {
    for (const a of p.actors) {
      if (a.tag <= 0 || a.team !== 0) continue;
      const x = Math.round(screenX(a.x, mirrored) - camX) - 7;
      const y = Math.round(a.y) + 1;
      const lit = p.lit >= 0 && p.actors[p.lit] === a;
      ctx.fillStyle = PX.panel;
      ctx.fillRect(x - 2, y - 1, 7, 7);
      drawTextUp(ctx, String(a.tag), x, y, 1, lit ? PX.post : PX.chalk);
    }
  }

  // The ball in the air, with its shadow on the grass under it.
  const f = p.flight;
  if (f) {
    const bx = Math.round(pointX(f.x, mirrored) - camX);
    const lift = Math.round(f.z * (f.kind === "kick" ? 0.3 : 0.6));
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(bx - 1, Math.round(f.y), 3, 2);
    const by = Math.round(f.y) - lift;
    ctx.fillStyle = PX.panel;
    ctx.fillRect(bx - 2, by - 1, 5, 4);
    ctx.fillStyle = "#7A4A22";
    ctx.fillRect(bx - 1, by, 3, 2);
    ctx.fillStyle = PX.chalk;
    ctx.fillRect(bx, by, 1, 1);
  }

  // A kick being lined up: a dotted line along the aim, longer with power.
  if (v.aim && !p.kicked) {
    const k = p.actors[0];
    // From the tee on a kickoff, from the punter's hands on a punt.
    const fromX = pointX(p.type === "punt" ? k.x + 8 : p.los, mirrored) - camX;
    const fromY = k.y + 8;
    const rad = (v.aim.degrees * Math.PI) / 180;
    const length = 26 + v.aim.power * 90;
    const dir = mirrored ? -1 : 1;
    ctx.fillStyle = PX.chalk;
    for (let d = 8; d < length; d += 6) {
      ctx.fillRect(Math.round(fromX + Math.cos(rad) * d * dir), Math.round(fromY + Math.sin(rad) * d * 0.46), 2, 1);
    }
    ctx.fillStyle = PX.action;
    ctx.fillRect(
      Math.round(fromX + Math.cos(rad) * length * dir) - 1,
      Math.round(fromY + Math.sin(rad) * length * 0.46) - 1,
      3,
      3,
    );
  }

  drawWeather(ctx, v.flakes, v.weather);
}

function dashes(ctx: CanvasRenderingContext2D, x: number, colour: string): void {
  if (x < -2 || x > VIEW_W) return;
  ctx.fillStyle = colour;
  for (let y = 6; y < VIEW_H - 6; y += 4) ctx.fillRect(x, y, 1, 2);
}
