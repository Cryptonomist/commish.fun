/* Render the REAL drawPlayer output to a PNG, big enough to look at.
 *
 *   npx tsx scripts/render-sprite.mjs [outDir] [scale]
 *
 * WHY THIS EXISTS. Pixel art on this project has shipped wrong three times, and
 * every time the same way: it was judged by reading the code that draws it. A
 * payout sprite that turned out to be a coloured smear. A favicon that scaled
 * down to a plain orange square, illegible on a tab and correct in a byte
 * count. An outline pass sized to the body instead of around it, so the two
 * widest parts of the player had no outline at all. Reading fillRect
 * coordinates tells you what you meant. It does not tell you what you drew.
 *
 * The helmet was the fourth. Three shapes were tried before the one in the file
 * now, and all three look equally plausible in the source: a television set, an
 * eye, and a facemask. Only rendering them told them apart.
 *
 * The browser is not much help. A 16px sprite inside a screenshot of a whole
 * page is a smudge, the canvases only paint inside an animation loop, and the
 * one in the arcade is clipped by its container. So this calls the same
 * drawPlayer the game calls, through a shim implementing the two context
 * members it uses, and writes the result scaled up with nearest-neighbour so
 * every pixel is a block you can count. Pass a small scale (4 is about life
 * size on a desktop) to check it still reads at the size people see it at.
 *
 * It draws through the real function on purpose. A hand-made mock-up of the
 * sprite would prove nothing about the sprite.
 *
 * NO DEPENDENCIES, deliberately. The first version imported sharp, which is in
 * node_modules only because Next.js drags it in. A tool whose whole job is
 * checking that something really works should not rest on a package nobody
 * declared, and PNG is a short enough format to write out.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawPlayer } from "../src/lib/pixel.ts";

const OUT = process.argv[2] || tmpdir();
const SCALE = Number(process.argv[3]) || 22;

/* Real kits, because a helmet has to hold up in every club's colours and the
 * hard cases are the dark ones. Baltimore's near-black purple against the
 * outline is where a shape stops reading first. */
const KITS = {
  ravens: { lead: "#241773", trim: "#9E7C0C" },
  cardinals: { lead: "#97233F", trim: "#FFB612" },
  bills: { lead: "#00338D", trim: "#C60C30" },
};

/* One row of poses per kit. Both facings, because they are drawn by the same
 * code with one coordinate mirrored, which is exactly the kind of thing that
 * looks right in one direction and wrong in the other. */
const POSES = [
  ["right", { facing: 1, ball: true }],
  ["left", { facing: -1 }],
  ["run", { facing: 1, stride: true }],
  ["out", { facing: 1, out: true }],
];

const CELL_W = 14;
const CELL_H = 21;
const TURF = "#24492E";

/** Enough of CanvasRenderingContext2D for drawPlayer: a fill colour and rects. */
function surface(w, h) {
  const px = Buffer.alloc(w * h * 3, 0);
  let fill = [0, 0, 0];
  const parse = (css) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(css).trim());
    if (!m) throw new Error(`the shim only understands #rrggbb, got ${css}`);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const ctx = {
    set fillStyle(v) {
      fill = parse(v);
    },
    get fillStyle() {
      return "#000000";
    },
    fillRect(x, y, rw, rh) {
      for (let j = Math.round(y); j < Math.round(y) + rh; j++) {
        for (let i = Math.round(x); i < Math.round(x) + rw; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const o = (j * w + i) * 3;
          px[o] = fill[0];
          px[o + 1] = fill[1];
          px[o + 2] = fill[2];
        }
      }
    },
  };
  return { ctx, px };
}

/* PNG, by hand. Eight bit truecolour, one IDAT, filter 0 on every scanline:
 * the simplest encoding the format allows, and for flat pixel art it
 * compresses about as well as anything cleverer would. */
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

/** `px` is w*h RGB triples. Scale up nearest-neighbour and encode. */
function png(px, w, h, scale) {
  const W = w * scale;
  const H = h * scale;
  const stride = 1 + W * 3; // a filter byte, then the row
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function sheet(name, kit) {
  const w = CELL_W * POSES.length;
  const { ctx, px } = surface(w, CELL_H);
  /* Turf, not white. The silhouette is designed to sit on grass, and judging it
   * against white flatters an outline that does not actually work. */
  ctx.fillStyle = TURF;
  ctx.fillRect(0, 0, w, CELL_H);
  POSES.forEach(([, opts], i) => drawPlayer(ctx, i * CELL_W + 3, 2, kit, opts));

  const file = join(OUT, `sprite-${name}.png`);
  writeFileSync(file, png(px, w, CELL_H, SCALE));
  console.log(file);
}

for (const [name, kit] of Object.entries(KITS)) sheet(name, kit);
