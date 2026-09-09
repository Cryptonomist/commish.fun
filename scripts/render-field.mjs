/* Render the REAL drawField output to PNGs, big enough to look at.
 *
 *   npx tsx scripts/render-field.mjs [outDir] [scale]
 *
 * Same reason as render-sprite.mjs next door: a field drawn from a few hundred
 * fillRect calls looks correct in the source whatever it actually paints, and
 * the yard lines on this one were four yards apart for months without anybody
 * noticing, because nothing on screen was measuring them.
 *
 * Three views, because the field has three things worth checking and they are
 * never on screen together: your own endzone with the lettering and the near
 * uprights, the fifty with the logo on it, and their endzone.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawField, drawPlayer } from "../src/lib/pixel.ts";
import { FIELD, VIEW_H, VIEW_W } from "../src/lib/bowl.ts";

const OUT = process.argv[2] || tmpdir();
const SCALE = Number(process.argv[3]) || 4;

/** Enough of CanvasRenderingContext2D for the field: a colour and rects. */
function surface(w, h) {
  const px = Buffer.alloc(w * h * 3, 0);
  let fill = [0, 0, 0];
  /* The field uses rgba() for the paint that has to let grass through, so
   * unlike the sprite shim this one has to blend rather than just write. */
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
      for (let j = Math.round(y); j < Math.round(y) + rh; j++) {
        for (let i = Math.round(x); i < Math.round(x) + rw; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
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

/* PNG by hand: eight bit truecolour, one IDAT, filter 0 on every scanline. */
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
      raw[d] = px[s];
      raw[d + 1] = px[s + 1];
      raw[d + 2] = px[s + 2];
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

const KIT = { lead: "#97233F", trim: "#FFB612" };
const THEM = { lead: "#00338D", trim: "#C60C30" };

function view(name, camX, players = []) {
  const { ctx, px } = surface(VIEW_W, VIEW_H);
  drawField(ctx, VIEW_W, VIEW_H, camX, FIELD);
  /* A couple of players, because every mark on this field is sized against a
   * sprite and judging the endzone type without one beside it is how you end
   * up with lettering that turns out to be as tall as a footballer. */
  for (const [wx, wy, kit, opts] of players) {
    drawPlayer(ctx, wx - camX, wy, kit, opts);
  }
  const file = join(OUT, `field-${name}.png`);
  writeFileSync(file, png(px, VIEW_W, VIEW_H, SCALE));
  console.log(file);
}

const mid = FIELD.ownGoal + 50 * FIELD.yard;

view("own-endzone", 0, [
  [FIELD.ownGoal + 30, 80, KIT, { facing: 1, ball: true }],
  [FIELD.ownGoal + 60, 110, THEM, { facing: -1 }],
]);
view("midfield", mid - VIEW_W / 2, [
  [mid - 40, 70, KIT, { facing: 1, ball: true, stride: true }],
  [mid + 20, 100, THEM, { facing: -1, stride: true }],
]);
view("their-endzone", FIELD.world - VIEW_W, [
  [FIELD.goal - 40, 90, KIT, { facing: 1, ball: true }],
]);
