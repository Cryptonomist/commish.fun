/* Render REAL Commish Bowl frames to PNGs, big enough to look at.
 *
 *   npx tsx scripts/render-bowl.mjs [outDir] [scale]
 *
 * Same reason as render-kickcam.mjs next door: the game's canvas only animates
 * inside a browser that runs animation frames, and a play drawn from a few
 * thousand fillRects reads as correct in the source whatever it paints. This
 * steps real plays through lib/bowlplay.ts with the computer on both sides and
 * draws chosen ticks through lib/bowldraw.ts: formations, a pass in the air, a
 * kickoff coming down, in each weather and at each hour, mirrored and not.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VIEW_H, VIEW_W, YARD } from "../src/lib/bowl.ts";
import { cameraFor, drawBowl, focusOf } from "../src/lib/bowldraw.ts";
import { computerKickoff, kickoff, scrimmage, stepPlay, xOfYard } from "../src/lib/bowlplay.ts";
import { EFFECTS } from "../src/lib/conditions.ts";
import { makeWeather, stepWeather } from "../src/lib/fieldfx.ts";
import { seeded } from "../src/lib/rng.ts";

const OUT = process.argv[2] || tmpdir();
const SCALE = Number(process.argv[3]) || 3;

function surface(w, h) {
  const px = new Float32Array(w * h * 3);
  let fill = [0, 0, 0, 1];
  const parse = (css) => {
    const s = String(css).trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(s);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const rgba = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (rgba) {
      const p = rgba[1].split(",").map((v) => Number(v.trim()));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    throw new Error(`the shim cannot parse ${css}`);
  };
  const ctx = {
    set fillStyle(v) {
      fill = parse(v);
    },
    get fillStyle() {
      return "#000000";
    },
    fillRect(x, y, rw, rh) {
      const [r, g, b, a] = fill;
      const x0 = Math.round(x);
      const y0 = Math.round(y);
      for (let j = y0; j < y0 + Math.round(rh); j++) {
        if (j < 0 || j >= h) continue;
        for (let i = x0; i < x0 + Math.round(rw); i++) {
          if (i < 0 || i >= w) continue;
          const o = (j * w + i) * 3;
          px[o] += (r - px[o]) * a;
          px[o + 1] += (g - px[o + 1]) * a;
          px[o + 2] += (b - px[o + 2]) * a;
        }
      }
    },
  };
  return { ctx, px };
}

const crc32 = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(px, w, h, scale) {
  const W = w * scale;
  const H = h * scale;
  const stride = 1 + W * 3;
  const raw = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    const row = y * stride + 1;
    const src = Math.floor(y / scale) * w;
    for (let x = 0; x < W; x++) {
      const s = (src + Math.floor(x / scale)) * 3;
      const d = row + x * 3;
      raw[d] = Math.max(0, Math.min(255, Math.round(px[s])));
      raw[d + 1] = Math.max(0, Math.min(255, Math.round(px[s + 1])));
      raw[d + 2] = Math.max(0, Math.min(255, Math.round(px[s + 2])));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BILLS = { lead: "#00338D", trim: "#C60C30" };
const CHIEFS = { lead: "#E31837", trim: "#FFB81C" };

function frames(name, { play, weather, time, mirrored, at, human = null }) {
  const flakes = makeWeather(3, weather, VIEW_W, VIEW_H);
  let cam = null;
  const last = Math.max(...at);
  for (let tick = 0; tick <= last; tick++) {
    if (tick > 0 && !play.result) stepPlay(play);
    stepWeather(flakes, weather, 0.3, VIEW_W, VIEW_H);
    const target = cameraFor(focusOf(play), mirrored);
    cam = cam === null ? target : cam + (target - cam) * 0.2;
    if (!at.includes(tick)) continue;
    const { ctx, px } = surface(VIEW_W, VIEW_H);
    drawBowl(ctx, {
      play,
      mirrored,
      kits: mirrored ? [CHIEFS, BILLS] : [BILLS, CHIEFS],
      camX: Math.round(cam),
      time,
      weather,
      flakes,
      frame: tick,
      tags: human === 0 && tick < 20,
      aim: null,
    });
    const file = join(OUT, `bowl-${name}-${tick}.png`);
    writeFileSync(file, png(px, VIEW_W, VIEW_H, SCALE));
    console.log(file, play.result ? `(${play.result.end})` : "");
  }
}

const calm = { x: 0, y: 0 };
const los = xOfYard(35);
frames("short-day", {
  play: scrimmage({ los, marker: los + 10 * YARD, off: "short", def: "cover", human: 0, fx: EFFECTS.clear, wind: calm, seed: 4 }),
  weather: "clear",
  time: "day",
  mirrored: false,
  human: 0,
  at: [0, 14, 30, 50],
});
frames("run-dusk-rain", {
  play: scrimmage({ los: xOfYard(60), marker: xOfYard(70), off: "run", def: "run", human: 1, fx: EFFECTS.rain, wind: calm, seed: 9 }),
  weather: "rain",
  time: "dusk",
  mirrored: true,
  at: [0, 18],
});
const ko = kickoff({ tee: xOfYard(35), onside: false, human: 1, fx: EFFECTS.snow, wind: calm, seed: 2 });
ko.kick = computerKickoff(seeded(5));
frames("kickoff-night-snow", { play: ko, weather: "snow", time: "night", mirrored: true, at: [0, 60, 150] });
