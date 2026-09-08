/* Build src/app/favicon.ico from the brand app icon.
 *
 * WHAT THIS REPLACED: create-next-app's default favicon, a black disc with a
 * white triangle, which reads as the Next.js/Vercel mark on every tab. It
 * survived unnoticed because the page ALSO declares /brand/appicon.png as an
 * icon, so the markup looked complete. Browsers prefer the .ico — it is listed
 * first and carries an explicit type and sizes — so the PNG never got a look
 * in, and the tab showed somebody else's logo on a site about money.
 *
 * WHY IT CROPS RATHER THAN JUST SHRINKING, which is the part worth keeping.
 * appicon.png is a 1024px app tile: the laces sit in the middle with a wide
 * orange margin, which is right for a phone home screen and wrong for a
 * favicon. Scaled straight down to 16x16 the mark thins to about one pixel and
 * disappears — the first version of this produced a plain orange square, which
 * looked fine in a byte count and was illegible on a tab.
 *
 * So the mark's bounding box is measured rather than guessed (the tile is
 * flat-coloured, so anything that differs from the corner pixel is mark), and
 * the crop is a square around it with a deliberate margin. The result fills
 * the tab.
 *
 * Four sizes: 16 and 32 for tabs and bookmarks, 48 for Windows shortcuts, 256
 * for high-DPI tabs. PNG-encoded inside the ICO container — every browser
 * since IE11 reads it, and it is a tenth the size of BMP.
 *
 * Run: node build-favicon.mjs
 */
import sharp from "sharp";
import { writeFileSync } from "fs";

const SRC = "public/brand/appicon.png";
const OUT = "src/app/favicon.ico";
const SIZES = [16, 32, 48, 256];

/** How much orange to leave around the mark, as a share of the mark's size.
 *  Zero would crop to the ink and look cramped; this reads as deliberate. */
const MARGIN = 0.18;

/* MEASURE THE MARK. The tile is a flat colour, so the corner pixel is the
 * background and every pixel unlike it belongs to the artwork. */
const { data, info } = await sharp(SRC)
  .raw()
  .toBuffer({ resolveWithObject: true });

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

if (maxX < 0) throw new Error("found no mark in " + SRC + " — is it a flat image?");

/* A SQUARE crop, centred on the mark, sized by its longest side plus margin.
 * Square matters: a non-square crop would be letterboxed by the browser and
 * the padding would come back. */
const markW = maxX - minX + 1;
const markH = maxY - minY + 1;
const side = Math.round(Math.max(markW, markH) * (1 + MARGIN * 2));
const cx = Math.round((minX + maxX) / 2);
const cy = Math.round((minY + maxY) / 2);

/* Clamp so the crop stays inside the source, then let the background fill any
 * shortfall rather than shifting the mark off centre. */
const left = Math.max(0, Math.min(info.width - side, Math.round(cx - side / 2)));
const top = Math.max(0, Math.min(info.height - side, Math.round(cy - side / 2)));
const w = Math.min(side, info.width - left);
const h = Math.min(side, info.height - top);

console.log(`mark at ${minX},${minY} ${markW}x${markH} in ${info.width}x${info.height}`);
console.log(`crop ${w}x${h} at ${left},${top}  (${((w / info.width) * 100).toFixed(0)}% of the tile)`);

const images = await Promise.all(
  SIZES.map((s) =>
    sharp(SRC)
      .extract({ left, top, width: w, height: h })
      .resize(s, s, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  ),
);

/* ICONDIR: reserved(2)=0, type(2)=1 for icon, count(2) */
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(SIZES.length, 4);

/* One 16-byte ICONDIRENTRY each, then the data. Offsets are absolute from the
 * start of the file, so the whole directory has to be sized before they can be
 * written — hence building the table first and filling offsets as we go. */
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
writeFileSync(OUT, ico);

console.log(`wrote ${OUT}  ${ico.length} bytes`);
SIZES.forEach((s, i) => console.log(`  ${s}x${s}  ${images[i].length} bytes`));
