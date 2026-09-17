/* THE KICKER'S-EYE VIEW: a field goal from behind the ball.
 *
 * Every kick you take on /arcade that has to go between the posts is drawn
 * here: the extra points and field goals in Commish Bowl, and every kick in the
 * long kick game. The flight itself is lib/fieldgoal.ts; this only paints it.
 *
 * A PINHOLE CAMERA ON A PIXEL SCREEN. 320 by 180 logical pixels, the same as
 * the top-down game, scaled up by CSS with smoothing off. The ground is drawn a
 * scanline at a time: each row below the horizon is one distance from the
 * camera, so its stripe, its paint and its width fall out of one division. It
 * is how the 16-bit racing games drew a road, and it keeps the hard pixel look
 * that the rest of this site is built on.
 *
 * fillStyle AND fillRect ONLY, for the reason lib/fieldfx.ts gives: the render
 * script that checks this art implements those two members and nothing else.
 *
 * COORDINATES ARE THE KICK'S: yards, the kick spot at the origin, +z toward
 * the posts, +x the kicker's right, +y up.
 */

import type { KickWind, TimeOfDay, Weather } from "@/lib/conditions";
import { drawLight, drawWeather, type Flake } from "@/lib/fieldfx";
import {
  BALL_R,
  CROSSBAR,
  GAP_HALF,
  type Kick,
  UPRIGHT_TOP,
} from "@/lib/fieldgoal";
import { drawLaces, type Kit, PX } from "@/lib/pixel";

export const CAM_W = 320;
export const CAM_H = 180;

/** Focal length in pixels. Chosen so the posts from an extra point fill about a
 *  tenth of the screen and from seventy yards are still two posts, not one. */
export const FOCAL = 180;
const CX = CAM_W / 2;

/** Where the horizon sits when the camera is level. Low enough to leave room
 *  above it for a crowd, a sky and a ball at the top of its flight. */
export const HORIZON = 74;

export type Cam = { x: number; y: number; z: number; horizon: number };

/** Seven yards behind the ball and a little under two up: roughly where a
 *  broadcast puts the camera for a kick. */
export const restingCam = (): Cam => ({ x: 0, y: 1.9, z: -7, horizon: HORIZON });

export type Point = { sx: number; sy: number; d: number };

/** World to screen. Null for anything at or behind the lens. */
export function project(cam: Cam, x: number, y: number, z: number): Point | null {
  const d = z - cam.z;
  if (d < 0.4) return null;
  return {
    sx: CX + (FOCAL * (x - cam.x)) / d,
    sy: cam.horizon + (FOCAL * (cam.y - y)) / d,
    d,
  };
}

/* THE CAMERA FOLLOWS THE BALL, and never goes backwards.
 *
 * It runs down the field behind the kick and stops ten yards short of the
 * posts, so the moment of truth is seen close up rather than from seventy
 * yards away. It tilts to keep the ball in frame at the top of a high kick,
 * and eases back to level as the ball comes down. Pure, so it can be stepped
 * in a test and the frame it produces checked for a ball that left the
 * screen. */
export function followKick(cam: Cam, k: Kick | null): void {
  if (!k) return;
  const targetZ = Math.min(k.z - 11, k.distance - 10);
  if (targetZ > cam.z) cam.z += (targetZ - cam.z) * 0.1;
  const targetY = 1.9 + Math.max(0, Math.min(k.y, 18) - 3) * 0.22;
  cam.y += (targetY - cam.y) * 0.08;

  const d = k.z - cam.z;
  let want = HORIZON;
  if (d > 1) {
    const sy = HORIZON + (FOCAL * (cam.y - k.y)) / d;
    if (sy < 24) want = HORIZON + (24 - sy);
  }
  want = Math.min(HORIZON + 80, want);
  cam.horizon += (want - cam.horizon) * 0.18;
}

/* ----------------------------------------------------------------- palette */

export type Look = { time: TimeOfDay; weather: Weather };

const SKY: Record<TimeOfDay, string[]> = {
  day: ["#3F8FD8", "#509BDD", "#62A7E2", "#76B3E7", "#8BC0EC", "#A1CDF0"],
  dusk: ["#1E1238", "#351A50", "#5A255C", "#8C3459", "#C24E47", "#E7773F", "#F4A24C"],
  night: ["#02040C", "#040816", "#070D20", "#0A132B", "#0E1936"],
};

/* Rain and snow grey the sky over: the colours are the hour's, pulled toward
 * a cloud that is itself as dark as the hour. A pale cloud at night reads as
 * a floodlit fog, which is not what snow at night looks like. */
const CLOUD: Record<TimeOfDay, Partial<Record<Weather, string>>> = {
  day: { rain: "rgba(96,108,122,0.55)", snow: "rgba(190,198,208,0.5)" },
  dusk: { rain: "rgba(70,62,84,0.5)", snow: "rgba(150,140,160,0.42)" },
  night: { rain: "rgba(20,24,34,0.45)", snow: "rgba(46,52,64,0.4)" },
};

/** How far behind the end line the stands begin, in yards. */
const STANDS_BACK = 16;

/* ------------------------------------------------------------------ sprites */

/* THE PLAYERS, AS PIXEL MAPS. Letters rather than fillRect lists, because a
 * sprite you can read as a picture in the source is a sprite you can fix. The
 * kicker and holder are seen from behind; the rushers face the camera.
 *
 *   O outline     H helmet     S helmet stripe     C facemask
 *   J jersey      N number     B belt              P pants
 *   T socks       K shoes      . nothing */
const KICKER_SET = [
  "....OOOOOO....",
  "...OHHSSHHO...",
  "...OHHSSHHO...",
  "...OHHSSHHO...",
  "...OHHHHHHO...",
  "....OOOOOO....",
  "..OJJJJJJJJO..",
  "..OJJJJJJJJO..",
  "..OJJNNNNJJO..",
  "..OJJJJJNJJO..",
  "..OJJJJNJJJO..",
  "..OJJJNJJJJO..",
  "...OBBBBBBO...",
  "...OPPPPPPO...",
  "...OPPOOPPO...",
  "...OTTOOTTO...",
  "...OTTOOTTO...",
  "...OTTOOTTO...",
  "...OKKOOKKO...",
  "....OO..OO....",
];

const KICKER_STRIDE = [
  ...KICKER_SET.slice(0, 14),
  "...OPPOOPPO...",
  "...OTTOOTTO...",
  "...OTTOOKKO...",
  "...OTTO.OO....",
  "...OKKO.......",
  "....OO........",
];

/* The strike. The kicking leg has swung through in front of him, where the
 * camera cannot see it, and both arms go out for balance: from behind, that
 * silhouette is the whole of what a kick looks like. */
const KICKER_STRIKE = [
  "....OOOOOO....",
  "...OHHSSHHO...",
  "...OHHSSHHO...",
  "...OHHSSHHO...",
  "...OHHHHHHO...",
  "....OOOOOO....",
  "OOOJJJJJJJJOOO",
  "OJJJJJJJJJJJJO",
  "OOOJJNNNNJJOOO",
  "..OJJJJJNJJO..",
  "..OJJJJNJJJO..",
  "..OJJJNJJJJO..",
  "...OBBBBBBO...",
  "...OPPPPPPO...",
  "...OPPPPPPO...",
  "...OTTO.......",
  "...OTTO.......",
  "...OTTO.......",
  "...OKKO.......",
  "....OO........",
];

const HOLDER = [
  "....OOOOOO....",
  "...OHHSSHHO...",
  "...OHHSSHHO...",
  "...OHHHHHHO...",
  "....OOOOOO....",
  "..OJJJJJJJJO..",
  "..OJJJJJJJJOOO",
  "..OJJNNNNJJJJO",
  "..OJJJJJNJOOOO",
  "...OBBBBBBO...",
  "..OPPPPPPPPO..",
  ".OPPPPPPPPPPO.",
  ".OTTKKOOPPPPO.",
  "..OOOO..OOOO..",
];

const LINEMAN_BACK = [
  "...OOOOOO...",
  "..OHHSSHHO..",
  "..OHHHHHHO..",
  "...OOOOOO...",
  ".OJJJJJJJJO.",
  "OJJJJJJJJJJO",
  "OJJJNNNNJJJO",
  "OJJJJJJJJJJO",
  ".OJJJJJJJJO.",
  ".OBBBBBBBBO.",
  ".OPPPPPPPPO.",
  ".OPPPOOPPPO.",
  ".OTTTOOTTTO.",
  ".OTTO..OTTO.",
  ".OKKO..OKKO.",
  "..OO....OO..",
];

const RUSHER_FRONT = [
  "...OOOOOO...",
  "..OHHSSHHO..",
  "..OHCCCCHO..",
  "..OHCCCCHO..",
  "...OOOOOO...",
  ".OJJJJJJJJO.",
  "OJJJJJJJJJJO",
  "OJJJNNNNJJJO",
  "OJJJJJJJJJJO",
  ".OJJJJJJJJO.",
  ".OBBBBBBBBO.",
  ".OPPPPPPPPO.",
  ".OPPPOOPPPO.",
  ".OTTTOOTTTO.",
  ".OTTO..OTTO.",
  ".OKKO..OKKO.",
  "..OO....OO..",
];

function paletteFor(kit: Kit): Record<string, string> {
  return {
    O: PX.panel,
    H: kit.lead,
    S: kit.trim,
    C: PX.chalk,
    J: kit.lead,
    N: PX.chalk,
    B: kit.trim,
    P: PX.pants,
    T: kit.trim,
    K: PX.panel,
  };
}

/** A pixel map at `m` screen pixels a cell, anchored at its bottom centre. */
function sprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  palette: Record<string, string>,
  footX: number,
  footY: number,
  m: number,
): void {
  const w = rows[0].length;
  const left = Math.round(footX - (w * m) / 2);
  const top = Math.round(footY - rows.length * m);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let c = 0;
    while (c < w) {
      const cell = row[c];
      if (cell === ".") {
        c++;
        continue;
      }
      // Runs of one colour are one rectangle, which keeps a big sprite cheap.
      let end = c + 1;
      while (end < w && row[end] === cell) end++;
      ctx.fillStyle = palette[cell] ?? PX.panel;
      ctx.fillRect(left + c * m, top + r * m, (end - c) * m, m);
      c = end;
    }
  }
}

/* ------------------------------------------------------------------ the set */

export type KickerPose = "set" | "stride" | "strike";

export type KickScene = {
  /** Yards from the kick spot to the posts. */
  distance: number;
  kick: Kick | null;
  cam: Cam;
  look: Look;
  wind: KickWind;
  /** Frames since the scene opened. Drives the crowd and the flags. */
  frame: number;
  kicker: Kit;
  /** The team trying to block it, or null for a kick with nobody on the line. */
  rush: Kit | null;
  pose: KickerPose;
  /** How far through his run-up the kicker is, 0 to 1. */
  runUp: number;
  /** Degrees, and whether to show the aiming line at all. */
  aim: number;
  aiming: boolean;
  flakes: Flake[];
  /** Brighter, busier crowd for the frames after a make. */
  cheering: boolean;
  /** Where the ball has been, oldest first, for the tracer. */
  trail: readonly { x: number; y: number; z: number }[];
};

export function drawKickCam(ctx: CanvasRenderingContext2D, s: KickScene): void {
  const { cam, look } = s;

  /* Back to front: sky, stands, the ground in front of them, then everything
   * that stands on the ground in order of distance. The sky is painted only
   * down to the roofline, and the ground only from the foot of the stands'
   * wall, so no layer paints over one that is nearer the camera. */
  const roof = project(cam, 0, 13, s.distance + STANDS_BACK);
  drawSky(ctx, look, roof ? roof.sy : 0, s.frame);
  drawStands(ctx, s);
  drawStandsFront(ctx, s);
  drawGround(ctx, s);

  const ball = s.kick;
  const ballBeyondPosts = ball !== null && ball.z > s.distance;
  if (ballBeyondPosts) drawBall(ctx, s);
  drawPosts(ctx, s);
  if (s.rush) drawLine(ctx, s);
  if (s.aiming) drawAim(ctx, s);
  if (!ballBeyondPosts) {
    drawTrail(ctx, s);
    drawBall(ctx, s);
  } else {
    drawTrail(ctx, s);
  }
  drawKickers(ctx, s);

  /* The lighter of the two washes. The sky and the stands already say what
   * hour it is, and a night game is a lit field under a dark sky, so the field
   * down here takes only a touch of the dark. */
  drawLight(ctx, look.time, "players", CAM_W, CAM_H);
  drawWeather(ctx, s.flakes, look.weather);
}

/** Paints the sky down to `bottom`, which is wherever the stands' roofline
 *  landed this frame. */
function drawSky(ctx: CanvasRenderingContext2D, look: Look, bottom: number, frame: number) {
  const skyBottom = Math.max(0, Math.min(CAM_H, Math.round(bottom)));
  if (skyBottom < 1) return;
  const bands = SKY[look.time];
  const bandH = Math.max(1, Math.ceil(skyBottom / bands.length));
  for (let i = 0; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, i * bandH, CAM_W, Math.min(bandH + 1, skyBottom - i * bandH));
  }

  if (look.time === "night") {
    // Stars, fixed, a few of them twinkling.
    for (let i = 0; i < 34; i++) {
      const x = (i * 97 + 13) % CAM_W;
      const y = (i * 53 + 7) % Math.max(1, skyBottom - 4);
      const lit = (frame >> 3) % 7 !== i % 7;
      ctx.fillStyle = lit ? "rgba(251,253,248,0.8)" : "rgba(251,253,248,0.3)";
      ctx.fillRect(x, y, 1, 1);
    }
  } else if (look.time === "dusk") {
    // The sun, low and just above the far stands.
    ctx.fillStyle = "rgba(255,214,120,0.9)";
    for (let dy = -9; dy <= 0; dy++) {
      const half = Math.round(Math.sqrt(81 - dy * dy));
      ctx.fillRect(252 - half, skyBottom + dy - 1, half * 2, 1);
    }
  }

  const cloud = CLOUD[look.time][look.weather];
  if (cloud) {
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, CAM_W, skyBottom);
  }
}

/* THE FAR STANDS, IN PERSPECTIVE.
 *
 * They stand a fixed distance behind the end line, so from seventy yards out
 * they are a thin band on the horizon and from ten yards out they tower over
 * the posts. That growth is most of what makes the camera's run down the field
 * feel like movement rather than a zoom.
 *
 * Returns where the roofline landed, so the sky is painted down to it and not
 * over the crowd. */
function drawStands(ctx: CanvasRenderingContext2D, s: KickScene): void {
  const { cam } = s;
  const z = s.distance + STANDS_BACK;
  const base = project(cam, 0, 0, z);
  const roof = project(cam, 0, 13, z);
  if (!base || !roof) return;
  const night = s.look.time === "night";
  const top = Math.round(roof.sy);
  const bottom = Math.round(base.sy);

  ctx.fillStyle = night ? "#060A10" : "#18231C";
  ctx.fillRect(0, top, CAM_W, bottom - top);
  ctx.fillStyle = night ? "#1B2530" : "#2E3B33";
  ctx.fillRect(0, top, CAM_W, Math.max(1, Math.round((FOCAL * 0.5) / base.d)));

  const crowd = [PX.chalk, s.kicker.lead, s.kicker.trim, PX.dim, PX.action, "#6B7A70"];
  if (s.rush) crowd.push(s.rush.lead, s.rush.trim);
  const beat = s.cheering ? s.frame >> 1 : s.frame >> 4;
  const dot = Math.max(1, Math.round((FOCAL * 0.42) / base.d));
  const step = Math.max(dot + 1, Math.round((FOCAL * 0.85) / base.d));
  const rows = Math.floor(10.5 / 0.85);
  for (let row = 0; row < rows; row++) {
    const y = Math.round(project(cam, 0, 1.6 + row * 0.85, z)?.sy ?? 0);
    const offset = row % 2 === 0 ? 0 : Math.round(step / 2);
    // World-anchored columns, so the crowd slides past as the camera moves.
    const origin = Math.round(CX - (FOCAL * cam.x) / base.d);
    const firstCol = Math.floor((0 - origin - offset) / step) - 1;
    const lastCol = Math.ceil((CAM_W - origin - offset) / step) + 1;
    for (let col = firstCol; col <= lastCol; col++) {
      const x = origin + offset + col * step;
      if (x < -dot || x > CAM_W) continue;
      const seat = ((col * 7919 + row * 104729) >>> 0) % 97;
      if (seat % 3 === 0) continue; // empty seats, and the texture that makes it a crowd
      const moving = s.cheering ? (seat + beat) % 4 === 0 : (seat + beat) % 23 === 0;
      ctx.fillStyle = crowd[seat % crowd.length];
      ctx.fillRect(x, y - dot - (moving ? dot : 0), dot, dot);
    }
  }

  // The scoreboard, on the roof and off to one side of the posts, with the
  // laces on it.
  const board = project(cam, 26, 19, z);
  const boardBase = project(cam, 26, 13, z);
  if (board && boardBase) {
    const unit = Math.max(1, (FOCAL * 1) / board.d);
    const bw = Math.round(unit * 14);
    const bh = Math.round(unit * 6);
    const bx = Math.round(board.sx - bw / 2);
    const by = Math.round(board.sy);
    ctx.fillStyle = PX.panel;
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = PX.chalk;
    ctx.fillRect(bx - 1, by - 1, bw + 2, 1);
    ctx.fillRect(bx - 1, by + bh, bw + 2, 1);
    const tile = Math.max(3, Math.round(bh * 0.7));
    ctx.fillStyle = PX.action;
    ctx.fillRect(bx + 2, by + Math.round((bh - tile) / 2), tile, tile);
    if (tile >= 12) {
      drawLaces(ctx, bx + 2 + Math.round(tile / 2), by + Math.round(bh / 2), Math.round(tile * 0.8), PX.chalk);
    }
    ctx.fillStyle = "#2A3A30";
    const lines = Math.max(1, Math.round(bh / 6));
    ctx.fillRect(bx + tile + 5, by + Math.round(bh * 0.25), Math.round(bw * 0.5), lines);
    ctx.fillRect(bx + tile + 5, by + Math.round(bh * 0.6), Math.round(bw * 0.35), lines);
    ctx.fillStyle = PX.panel;
    ctx.fillRect(Math.round(board.sx) - 1, by + bh, 2, Math.max(0, Math.round(boardBase.sy) - by - bh));
  }

  if (night) {
    for (const lx of [-44, 44]) {
      const lamp = project(cam, lx, 24, z);
      const foot = project(cam, lx, 13, z);
      if (!lamp || !foot) continue;
      const u = Math.max(1, (FOCAL * 1) / lamp.d);
      const x = Math.round(lamp.sx);
      const y = Math.round(lamp.sy);
      ctx.fillStyle = "#1B2530";
      ctx.fillRect(x - 1, y, 2, Math.max(0, Math.round(foot.sy) - y));
      ctx.fillStyle = "rgba(255,246,216,0.16)";
      ctx.fillRect(Math.round(x - u * 6), Math.round(y - u * 2.5), Math.round(u * 12), Math.round(u * 5));
      ctx.fillStyle = "#FFF6D8";
      ctx.fillRect(Math.round(x - u * 3.5), Math.round(y - u), Math.round(u * 7), Math.max(2, Math.round(u * 2)));
    }
  }
}

/** The wall at the front of the stands, and the strip of ground between it and
 *  the end line: a padded wall reads as the edge of the field. */
function drawStandsFront(ctx: CanvasRenderingContext2D, s: KickScene) {
  const z = s.distance + STANDS_BACK;
  const wallTop = project(s.cam, 0, 1.4, z);
  const wallBase = project(s.cam, 0, 0, z);
  if (!wallTop || !wallBase) return;
  ctx.fillStyle = s.look.time === "night" ? "#0E1A24" : "#123B5A";
  ctx.fillRect(0, Math.round(wallTop.sy), CAM_W, Math.max(1, Math.round(wallBase.sy - wallTop.sy)));
}

/* THE GROUND, one scanline at a time.
 *
 * For a row `r` below the horizon the ground there is `FOCAL * camH / (r -
 * horizon)` yards ahead of the lens. From that one number: the mow stripe, the
 * width of the field, whether the row is in the end zone or past the end line,
 * and whether a painted yard line crosses it. The lines are a few inches thick
 * in the world, so up close they are several rows deep and far away a single
 * row, which is what makes the field read as flat ground. */
function drawGround(ctx: CanvasRenderingContext2D, s: KickScene) {
  const { cam, distance } = s;
  const horizon = cam.horizon;
  const goalLine = distance - 10;
  const snow = s.look.weather === "snow";
  const turfA = snow ? "#557A60" : PX.turf;
  const turfB = snow ? "#4A6E55" : PX.turf2;
  const sideline = snow ? "#6D8577" : "#1C3A26";
  /* NOT the top-down field's end zone paint. That one is the site's panel
   * green, which from above carries the wordmark and from down here, with
   * nothing written on it, is a black hole under the posts. */
  const zone = snow ? "#3F6049" : "#1B4127";

  const wall = project(cam, 0, 0, distance + STANDS_BACK);
  const startRow = Math.max(0, Math.floor(horizon) + 1, wall ? Math.round(wall.sy) : 0);
  for (let r = startRow; r < CAM_H; r++) {
    const near = (FOCAL * cam.y) / (r + 1 - horizon);
    const far = (FOCAL * cam.y) / Math.max(0.5, r - horizon);
    const mid = (near + far) / 2;
    const z = cam.z + mid;
    const zNear = cam.z + near;
    const zFar = cam.z + far;
    const half = (FOCAL * 26.67) / mid;
    const shift = (-FOCAL * cam.x) / mid;
    const left = Math.round(CX + shift - half);
    const right = Math.round(CX + shift + half);

    ctx.fillStyle = sideline;
    ctx.fillRect(0, r, CAM_W, 1);
    if (z > distance + 0.1) continue; // between the end line and the stands

    let fill: string;
    if (z >= goalLine && z <= distance) fill = zone;
    else fill = Math.floor((goalLine - z) / 5) % 2 === 0 ? turfA : turfB;
    ctx.fillStyle = fill;
    ctx.fillRect(left, r, right - left, 1);

    // Painted lines across the field: every five yards, the goal line, and
    // the end line. Four inches thick.
    const thick = 0.12;
    const lineAt = (lz: number) => lz + thick >= zNear && lz - thick <= zFar;
    let painted = lineAt(goalLine) || lineAt(distance);
    if (!painted) {
      const k = Math.round((goalLine - z) / 5);
      if (k >= 1) painted = lineAt(goalLine - k * 5);
    }
    if (painted) {
      ctx.fillStyle = "rgba(251,253,248,0.7)";
      ctx.fillRect(left, r, right - left, 1);
    }

    // Sidelines and the hash marks, a yard apart.
    ctx.fillStyle = "rgba(251,253,248,0.6)";
    ctx.fillRect(left, r, Math.max(1, Math.round(half * 0.02)), 1);
    ctx.fillRect(right - Math.max(1, Math.round(half * 0.02)), r, Math.max(1, Math.round(half * 0.02)), 1);
    if (z < goalLine && Math.abs(z - Math.round(z)) < Math.max(0.12, (zFar - zNear) / 2)) {
      const hx = (FOCAL * GAP_HALF) / mid;
      const hw = Math.max(1, Math.round((FOCAL * 0.6) / mid));
      ctx.fillStyle = "rgba(251,253,248,0.45)";
      ctx.fillRect(Math.round(CX + shift - hx - hw / 2), r, hw, 1);
      ctx.fillRect(Math.round(CX + shift + hx - hw / 2), r, hw, 1);
    }
  }
}

/* THE UPRIGHTS. Yellow, a base post, a crossbar ten feet up, two uprights
 * thirty-five feet above that, and a ribbon on top of each that streams with
 * the crosswind: the flag a kicker reads. */
function drawPosts(ctx: CanvasRenderingContext2D, s: KickScene) {
  const { cam, distance } = s;
  const base = project(cam, 0, 0, distance + 0.6);
  const barL = project(cam, -GAP_HALF, CROSSBAR, distance);
  const barR = project(cam, GAP_HALF, CROSSBAR, distance);
  const topL = project(cam, -GAP_HALF, UPRIGHT_TOP, distance);
  const topR = project(cam, GAP_HALF, UPRIGHT_TOP, distance);
  if (!base || !barL || !barR || !topL || !topR) return;
  const t = Math.max(1, Math.round((FOCAL * 0.14) / barL.d));

  ctx.fillStyle = PX.post;
  const cx = Math.round((barL.sx + barR.sx) / 2);
  // The base post, and its gooseneck forward to the bar.
  ctx.fillRect(Math.round(base.sx - t / 2), Math.round(barL.sy), t, Math.max(1, Math.round(base.sy - barL.sy)));
  ctx.fillRect(Math.round(cx - t / 2), Math.round(barL.sy), t, t);
  // The crossbar.
  ctx.fillRect(Math.round(barL.sx), Math.round(barL.sy - t / 2), Math.max(1, Math.round(barR.sx - barL.sx)), t);
  // The uprights.
  for (const [bar, top] of [
    [barL, topL],
    [barR, topR],
  ] as const) {
    ctx.fillRect(Math.round(bar.sx - t / 2), Math.round(top.sy), t, Math.max(1, Math.round(bar.sy - top.sy)));
  }

  // The ribbons: length from the crosswind's strength, flutter from the frame.
  const push = Math.max(-1, Math.min(1, s.wind.cross / 20));
  const len = Math.round(1 + Math.abs(push) * 6);
  const flutter = (s.frame >> 2) % 2;
  ctx.fillStyle = PX.action;
  for (const top of [topL, topR]) {
    const x0 = Math.round(top.sx);
    const y0 = Math.round(top.sy);
    if (Math.abs(push) < 0.08) {
      ctx.fillRect(x0 - 1, y0, 2, 4); // calm: the ribbon hangs
    } else {
      const dir = push > 0 ? 1 : -1;
      for (let i = 0; i < len; i++) {
        const x = dir > 0 ? x0 + t + i : x0 - 1 - i;
        ctx.fillRect(x, y0 + ((i + flutter) % 3 === 0 ? 1 : 0), 1, 2);
      }
    }
  }
}

/* THE LINE, when there is one: the kicker's blockers with their backs to us,
 * and the rush behind them, who jump with their arms up the moment the ball is
 * struck. */
function drawLine(ctx: CanvasRenderingContext2D, s: KickScene) {
  if (!s.rush) return;
  const { cam } = s;
  const struck = s.kick !== null && s.kick.t < 0.9;
  const rushPal = paletteFor(s.rush);
  const ourPal = paletteFor(s.kicker);

  for (let i = 0; i < 6; i++) {
    const x = -3.9 + i * 1.56;
    const p = project(cam, x, 0, 8.4);
    // Once the camera is following the ball it runs straight through the line,
    // and a lineman the size of the screen is not something anyone watching
    // needs to see.
    if (!p || p.d < 6.5) continue;
    const m = Math.max(1, Math.round((FOCAL * 2) / p.d / 17));
    const hop = struck ? Math.round((FOCAL * 0.5) / p.d) : 0;
    sprite(ctx, RUSHER_FRONT, rushPal, p.sx, p.sy - hop, m);
    if (struck) {
      ctx.fillStyle = s.rush.lead;
      const w = 12 * m;
      const armTop = p.sy - hop - 17 * m - 5 * m;
      ctx.fillRect(Math.round(p.sx - w / 2), Math.round(armTop), m, 6 * m);
      ctx.fillRect(Math.round(p.sx + w / 2 - m), Math.round(armTop), m, 6 * m);
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = -4.5 + i * 1.5;
    const p = project(cam, x, 0, 7);
    if (!p || p.d < 6.5) continue;
    const m = Math.max(1, Math.round((FOCAL * 2) / p.d / 16));
    sprite(ctx, LINEMAN_BACK, ourPal, p.sx, p.sy, m);
  }
}

/* THE AIMING LINE: dots on the grass from the ball toward where the kick is
 * pointed, and a marker at the posts. It shows the aim, not the result, which
 * is the kicker's problem: the wind is not drawn into it. */
function drawAim(ctx: CanvasRenderingContext2D, s: KickScene) {
  const { cam, distance } = s;
  const rad = (s.aim * Math.PI) / 180;
  ctx.fillStyle = "rgba(251,253,248,0.9)";
  for (let z = 2; z < distance - 1; z += 2) {
    const p = project(cam, Math.tan(rad) * z, 0, z);
    if (!p) continue;
    const size = Math.max(1, Math.round((FOCAL * 0.3) / p.d));
    ctx.fillRect(Math.round(p.sx - size / 2), Math.round(p.sy), size, size);
  }
  const mark = project(cam, Math.tan(rad) * distance, CROSSBAR + 1.2, distance);
  if (!mark) return;
  ctx.fillStyle = PX.action;
  const mx = Math.round(mark.sx);
  const my = Math.round(mark.sy);
  ctx.fillRect(mx - 3, my - 5, 7, 1);
  ctx.fillRect(mx - 2, my - 4, 5, 1);
  ctx.fillRect(mx - 1, my - 3, 3, 1);
  ctx.fillRect(mx, my - 2, 1, 1);
}

/* THE TRACER, the broadcast's line behind the ball: the last few places it has
 * been, fading from the brand orange. Readable against a crowd, a sky or a
 * night, which the ball alone at four pixels is not. */
function drawTrail(ctx: CanvasRenderingContext2D, s: KickScene) {
  const n = s.trail.length;
  for (let i = 0; i < n; i++) {
    const t = s.trail[i];
    const q = project(s.cam, t.x, t.y, t.z);
    if (!q) continue;
    const alpha = (((i + 1) / n) * 0.6).toFixed(2);
    const size = Math.max(1, Math.round((FOCAL * 0.14) / q.d));
    ctx.fillStyle = `rgba(255,106,43,${alpha})`;
    ctx.fillRect(Math.round(q.sx - size / 2), Math.round(q.sy - size / 2), size, size);
  }
}

/* THE BALL AND ITS SHADOW. It tumbles end over end, which at this size is an
 * oval that is tall on one frame and wide on the next. */
function drawBall(ctx: CanvasRenderingContext2D, s: KickScene) {
  const { cam } = s;
  const k = s.kick;
  const bx = k ? k.x : 0;
  const by = k ? k.y : 0.16;
  const bz = k ? k.z : 0;

  const shadow = project(cam, bx, 0, bz);
  if (shadow && k) {
    const w = Math.max(2, Math.round((FOCAL * 0.4) / shadow.d));
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(Math.round(shadow.sx - w / 2), Math.round(shadow.sy), w, Math.max(1, Math.round(w / 3)));
  }

  const p = project(cam, bx, by, bz);
  if (!p) return;
  const size = Math.max(2, Math.min(18, Math.round((FOCAL * BALL_R * 3.2) / p.d)));
  const spinning = k !== null && !k.resting;
  const tall = spinning ? (s.frame >> 1) % 2 === 0 : false;
  const w = tall ? Math.max(2, Math.round(size * 0.65)) : size;
  const h = tall ? size : Math.max(2, Math.round(size * 0.65));
  const x = Math.round(p.sx - w / 2);
  const y = Math.round(p.sy - h / 2);

  ctx.fillStyle = PX.panel;
  ctx.fillRect(x - 1, y, w + 2, h);
  ctx.fillRect(x, y - 1, w, h + 2);
  ctx.fillStyle = "#7A4A22";
  ctx.fillRect(x, y, w, h);
  if (size >= 4) {
    ctx.fillStyle = PX.chalk;
    if (tall) ctx.fillRect(x + Math.floor(w / 2), y + 1, 1, h - 2);
    else ctx.fillRect(x + 1, y + Math.floor(h / 2), w - 2, 1);
  }
}

/* THE HOLDER AND THE KICKER, nearest the lens and so drawn last. The kicker
 * runs up from the left, a soccer-style approach for a right foot, and the
 * pair leave the frame as the camera follows the ball past them. */
function drawKickers(ctx: CanvasRenderingContext2D, s: KickScene) {
  const { cam } = s;
  const pal = paletteFor(s.kicker);

  const holder = project(cam, -0.55, 0, -0.15);
  if (holder && holder.d > 2.4) {
    const m = Math.max(1, Math.round((FOCAL * 1.05) / holder.d / 14));
    sprite(ctx, HOLDER, pal, holder.sx, holder.sy, m);
  }

  const t = Math.max(0, Math.min(1, s.runUp));
  const kx = -1.7 + (-0.45 + 1.7) * t;
  const kz = -2.6 + (-0.75 + 2.6) * t;
  const kicker = project(cam, kx, 0, kz);
  if (!kicker || kicker.d < 2.4) return;
  const m = Math.max(1, Math.round((FOCAL * 2) / kicker.d / 20));
  const rows =
    s.pose === "strike" ? KICKER_STRIKE : s.pose === "stride" ? KICKER_STRIDE : KICKER_SET;
  sprite(ctx, rows, pal, kicker.sx, kicker.sy, m);
}
