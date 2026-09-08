/* Build the browser icons from the brand app tile.
 *
 *   node scripts/build-favicon.mjs
 *
 * Writes src/app/favicon.ico (16/32/48/256) and public/brand/icon-round.png,
 * which is what layout.tsx points `icons.icon` at.
 *
 * WHAT THIS REPLACED: create-next-app's default favicon, a black disc with a
 * white triangle, which reads as the Next.js/Vercel mark on every tab. It
 * survived unnoticed because the page ALSO declares an icon in layout.tsx, so
 * the markup looked complete. Browsers never reached that one — the .ico is
 * emitted first, with an explicit type and sizes, and it wins. The file also
 * fetched 200 with correct ICO magic bytes, so every check short of decoding
 * it and looking at it passed.
 *
 * WHY IT CROPS RATHER THAN SHRINKING. appicon.png is a 1024px app tile: the
 * laces sit in the middle with a wide orange margin, which is right for a
 * phone home screen and wrong for a favicon. Scaled straight down to 16x16 the
 * mark thins to about one pixel and disappears — the first build produced a
 * plain orange square that looked correct in a byte count and was illegible on
 * a tab. So the mark is measured, not guessed, and the crop is a square around
 * it with a deliberate margin.
 *
 * WHY IT ROUNDS. A favicon is drawn exactly as given; nothing rounds it for
 * you, so a full-bleed tile shows as a hard-cornered square against the
 * browser chrome. The corners are cut with an alpha mask here.
 *
 * NOT the apple-touch-icon, deliberately. iOS applies its own mask, and an
 * icon that arrives pre-rounded gets rounded twice — the corners go
 * transparent and iOS fills them with black. favicon-180.png stays square on
 * purpose.
 */
import sharp from "sharp";
import { writeFileSync } from "fs";

const SRC = "public/brand/appicon.png";
const ICO = "src/app/favicon.ico";
const PNG = "public/brand/icon-round.png";
const SIZES = [16, 32, 48, 256];

/** Orange left around the mark, as a share of the mark's longest side. Zero
 *  crops to the ink and looks cramped; this reads as deliberate. */
const MARGIN = 0.18;

/** Corner radius as a share of the tile. 22% is roughly the app-icon
 *  convention and still reads as rounded at 16px, where a subtler value just
 *  looks like a rendering artefact. */
const RADIUS = 0.22;

/* MEASURE THE MARK. The tile is a flat colour, so the corner pixel is the
 * background and every pixel unlike it belongs to the artwork. */
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const bg = [data[0], data[1], data[2]];
const differs = (i) =>
  Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 40;

let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (differs((y * info.width + x) * ch)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error(`found no mark in ${SRC} — is it a flat image?`);

/* A SQUARE crop centred on the mark. Square matters: anything else gets
 * letterboxed by the browser and the padding comes straight back. */
const side = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * (1 + MARGIN * 2));
const left = Math.max(0, Math.min(info.width - side, Math.round((minX + maxX) / 2 - side / 2)));
const top = Math.max(0, Math.min(info.height - side, Math.round((minY + maxY) / 2 - side / 2)));
const w = Math.min(side, info.width - left);
const h = Math.min(side, info.height - top);

console.log(`mark ${maxX - minX + 1}x${maxY - minY + 1} at ${minX},${minY} in ${info.width}x${info.height}`);
console.log(`crop ${w}x${h} at ${left},${top} — ${((w / info.width) * 100).toFixed(0)}% of the tile`);

/** Crop, scale, then punch the corners out with an alpha mask. `dest-in` keeps
 *  the destination only where the mask is opaque, which is what turns the
 *  rounded rectangle into transparency rather than paint. */
async function tile(size) {
  const r = Math.round(size * RADIUS);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(SRC)
    .extract({ left, top, width: w, height: h })
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const images = await Promise.all(SIZES.map(tile));

/* ICONDIR: reserved(2)=0, type(2)=1 for icon, count(2) */
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(SIZES.length, 4);

/* One 16-byte ICONDIRENTRY each, then the data. Offsets are absolute from the
 * start of the file, so the directory has to be sized before they can be
 * filled in. */
const dir = Buffer.alloc(16 * SIZES.length);
let offset = header.length + dir.length;
SIZES.forEach((s, i) => {
  const o = i * 16;
  dir[o] = s === 256 ? 0 : s; // 0 means 256 in this format
  dir[o + 1] = s === 256 ? 0 : s;
  dir[o + 2] = 0; // palette size, 0 for truecolour
  dir[o + 3] = 0; // reserved
  dir.writeUInt16LE(1, o + 4); // colour planes
  dir.writeUInt16LE(32, o + 6); // bits per pixel
  dir.writeUInt32LE(images[i].length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += images[i].length;
});

const ico = Buffer.concat([header, dir, ...images]);
writeFileSync(ICO, ico);
writeFileSync(PNG, await tile(512));

console.log(`wrote ${ICO}  ${ico.length} bytes`);
SIZES.forEach((s, i) => console.log(`  ${s}x${s}  ${images[i].length} bytes`));
console.log(`wrote ${PNG}  512x512`);
