/* Render the REAL kicker's-eye view to PNGs, big enough to look at.
 *
 *   npx tsx scripts/render-kickcam.mjs [outDir] [scale]
 *
 * Same reason as render-sprite.mjs and render-field.mjs: a scene drawn from a
 * few thousand fillRect calls reads as correct in the source whatever it
 * paints. This steps real kicks through lib/fieldgoal.ts, moves the real camera
 * with followKick, and draws each frame through drawKickCam, so what comes out
 * is what a player sees at those moments and not a mock-up of it.
 *
 * Several conditions, because each weather and time of day paints the same
 * scene differently and a palette that works at noon can vanish at night.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchKick, stepKick } from "../src/lib/fieldgoal.ts";
import { CAM_H, CAM_W, drawKickCam, followKick, restingCam } from "../src/lib/kickcam.ts";
import { makeWeather, stepWeather } from "../src/lib/fieldfx.ts";

const OUT = process.argv[2] || tmpdir();
const SCALE = Number(process.argv[3]) || 3;

/** Enough of CanvasRenderingContext2D for the scene: a colour, blended rects. */
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

const CARDINALS = { lead: "#97233F", trim: "#FFB612" };
const BILLS = { lead: "#00338D", trim: "#C60C30" };

/** Kick from `distance`, and write the frame at each tick listed in `at`. */
function scene(name, { distance, look, wind, input, rush, at }) {
  const cam = restingCam();
  const flakes = makeWeather(7, look.weather, CAM_W, CAM_H);
  let kick = null;
  const trail = [];
  const last = Math.max(...at);
  for (let tick = 0; tick <= last; tick++) {
    // Twenty frames of run-up, then the strike.
    const runUp = Math.min(1, tick / 20);
    if (tick === 20) kick = launchKick(distance, input, wind, 1);
    if (kick && tick > 20) {
      stepKick(kick);
      followKick(cam, kick);
      if (!kick.landed) {
        trail.push({ x: kick.x, y: kick.y, z: kick.z });
        if (trail.length > 10) trail.shift();
      }
    }
    stepWeather(flakes, look.weather, wind.cross * 0.05, CAM_W, CAM_H);
    if (!at.includes(tick)) continue;
    const { ctx, px } = surface(CAM_W, CAM_H);
    drawKickCam(ctx, {
      distance,
      kick,
      cam,
      look,
      wind,
      frame: tick,
      kicker: CARDINALS,
      rush,
      pose: tick < 20 ? (tick % 6 < 3 ? "set" : "stride") : tick < 28 ? "strike" : "set",
      runUp,
      aim: input.aim,
      aiming: tick === 0,
      flakes,
      cheering: false,
      trail,
    });
    const file = join(OUT, `kickcam-${name}-${tick}.png`);
    writeFileSync(file, png(px, CAM_W, CAM_H, SCALE));
    console.log(file);
  }
}

scene("pat-day", {
  distance: 33,
  look: { time: "day", weather: "clear" },
  wind: { cross: 6, along: 0 },
  input: { power: 0.7, accuracy: 0, aim: -2 },
  rush: BILLS,
  at: [0, 22, 40, 60],
});
scene("55-dusk-rain", {
  distance: 55,
  look: { time: "dusk", weather: "rain" },
  wind: { cross: -12, along: 4 },
  input: { power: 0.93, accuracy: 0.1, aim: 3 },
  rush: BILLS,
  at: [0, 45, 90],
});
scene("65-night-snow", {
  distance: 65,
  look: { time: "night", weather: "snow" },
  wind: { cross: 3, along: 10 },
  input: { power: 1, accuracy: 0, aim: 0 },
  rush: null,
  at: [0, 50, 100],
});
scene("45-wind", {
  distance: 45,
  look: { time: "day", weather: "wind" },
  wind: { cross: 20, along: -5 },
  input: { power: 0.85, accuracy: 0, aim: -5 },
  rush: null,
  at: [0, 70],
});
