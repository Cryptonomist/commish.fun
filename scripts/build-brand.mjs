/* The brand kit, generated rather than drawn.
 *
 * Every asset here comes from one set of numbers: the Laces geometry that
 * `components/Laces.tsx` renders, and the Pigskin tokens from `globals.css`.
 * That is the whole point of generating them. The last kit was a folder of
 * PNGs exported by hand from a design file, so when the palette moved from
 * brown-and-orange to Turf every one of them was silently wrong and there was
 * no way to tell except by opening them.
 *
 * Run it with:  node scripts/build-brand.mjs
 *
 * SVG is the deliverable and PNG is a convenience. EVERY ASSET IS NOW PURE
 * RECTANGLES, including the type: the header and the link preview are set in
 * a 5x7 bitmap alphabet drawn in scripts/pixelfont.mjs rather than in a font
 * file. That is not only a style decision. librsvg — which is what sharp uses
 * for SVG — resolves fonts through fontconfig and knows nothing about
 * @font-face, so this script used to have to install Anton into the user's
 * font directory before it would produce a correct wordmark, and a machine
 * where that quietly failed rendered a fallback face and wrote the PNG anyway.
 * Rectangles cannot fail that way, and they rasterise exactly at any size.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { textPath, textWidth } from "./pixelfont.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BRAND = path.join(ROOT, "brand");
const PUBLIC = path.join(ROOT, "public", "brand");

/* ── The palette, copied from globals.css ─────────────────────────────────── */
const C = {
  night: "#0A100C",
  night2: "#121B15",
  night3: "#1F2C24",
  turf: "#24492E",
  chalk: "#FFFFFF",
  cream: "#F0F2EC",
  creamDim: "#98A69B",
  action: "#FF6A2B",
  gold: "#E9C258",
};

/* ── The mark ─────────────────────────────────────────────────────────────── */

/** The Laces, exactly as components/Laces.tsx draws them: one spine, four
 *  ticks, rounded ends, tilted 14 degrees. */
const laces = (fill) => `<g transform="rotate(-14)" fill="${fill}">
    <rect x="-9" y="-84" width="18" height="168" rx="9"/>
    <rect x="-49" y="-63" width="98" height="18" rx="9"/>
    <rect x="-49" y="-27" width="98" height="18" rx="9"/>
    <rect x="-49" y="9" width="98" height="18" rx="9"/>
    <rect x="-49" y="45" width="98" height="18" rx="9"/>
  </g>`;

const markSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="200" height="200" role="img" aria-label="Commish">
  ${laces(fill)}
</svg>
`;

/* The mark on its own ground, square, for an avatar or an app icon. The corner
 * radius is left to whoever is placing it: platforms mask their own.
 *
 * THE TILE IS FOR FRAMES SOMEBODY ELSE OWNS, and that is the whole reason it
 * may be filled orange when the in-product lockup may not. A logo on this
 * site's own night surfaces has contrast for free, and an orange slab sitting
 * there reads as a button — orange is the interaction colour, so spending it on
 * decoration teaches people that orange means nothing. An avatar gets no such
 * luxury: it is 48px in somebody else's timeline and 16px in a tab strip, on a
 * ground it does not choose. Night on night disappears, and night at 16px is a
 * smudge whichever way you scale it. Orange survives both.
 *
 * So the ground is a parameter and the two callers are the two answers. This is
 * the ordinary split between a containerised icon and a freestanding logo, not
 * a compromise between them. */
const tileSvg = (ground, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Commish">
  <rect width="512" height="512" fill="${ground}"/>
  <g transform="translate(256 256) scale(1.55)">${laces(fill)}</g>
</svg>
`;

/* ── The field, reused from the site's hero ───────────────────────────────── */

/* ── The old Anton compositions lived here ────────────────────────────────
 *
 * A floodlit ground with a radial gold wash, yard numerals set in Anton, and
 * three text-anchored layouts for the header and the link preview. All of it
 * is gone, and so is the step that installed Anton into the user's font
 * directory before the build would work.
 *
 * That install step was the most fragile thing in this script. librsvg
 * resolves fonts through fontconfig and knows nothing about @font-face, so a
 * machine where the copy or `fc-cache` quietly failed did not error — it
 * rendered the wordmark in whatever fontconfig fell back to and wrote the PNG
 * anyway. Letters made of rectangles cannot fail that way, and nothing in the
 * kit sets type through a font any more.
 *
 * `brand/fonts/Anton-Regular.ttf` and its licence stay: Anton is still the
 * site's display face, and that file is where the licence is recorded.
 */

/* ── THE PIXEL BANNER ─────────────────────────────────────────────────────── */

/* The header, set in rectangles instead of in Anton.
 *
 * The rest of the product went blocky — the attract loop, the playable drive at
 * /arcade, the sprites, the field — and a profile header in a smooth condensed
 * grotesque was the last thing still speaking the old language. This one is
 * drawn the way everything else on the site is drawn: a field of mow bands and
 * chalk, yard numbers stencilled onto the grass, and eleven characters made of
 * five-by-seven pixel grids.
 *
 * EVERYTHING IS ON A LOGICAL GRID AND SCALED UP. The banner is 1500x500, which
 * is 300x100 at five times. Nothing is ever positioned on a fraction of a
 * logical pixel, so the rasteriser has no edge to soften and the result is
 * hard squares rather than a slightly blurry approximation of them.
 *
 * NO FONT IS INVOLVED, which also means no install step to fail. See
 * scripts/pixelfont.mjs.
 */

/** Field numbering, the way it is painted on real grass: 10 through 50 and
 *  back down. Retro games kept them upright rather than rotated flat, and so
 *  does this — a rotated numeral at this size is four unreadable rectangles. */
const YARD_NUMBERS = ["10", "20", "30", "40", "50", "40", "30", "20", "10"];

/** How much of the field to number, given the room. Nine numbers fit a 3:1
 *  header and jam together on a 1.9:1 card, so the narrower asset shows the
 *  middle of the field instead of a compressed whole one — which is what a
 *  camera does anyway. Always an odd count, so the 50 stays in the centre. */
function yardNumbers(gw, scale) {
  const each = textWidth("00", scale) + 10; // a number plus a decent gap
  let count = Math.max(3, Math.min(YARD_NUMBERS.length, Math.floor(gw / each)));
  if (count % 2 === 0) count -= 1;
  const from = (YARD_NUMBERS.length - count) / 2;
  return YARD_NUMBERS.slice(from, from + count);
}

function pixelField(gw, gh, s) {
  const px = (n) => n * s;
  const out = [];

  /* ONE SPACING GOVERNS THE WHOLE FIELD. The mow bands, the yard lines and
     the numbers are all laid out on the same pitch, so a band edge always
     lands on a yard line and a number always sits inside a band. The first
     version used three different intervals and produced a plaid: lines every
     15, bands every 20, numbers every 33, overlapping each other.

     It is DERIVED FROM THE GRID, not fixed at 30. Hardcoding the header's
     pitch sent the right-hand 20 and 10 clean off the edge of the narrower
     link preview; deriving it from a fixed count of nine then jammed them
     together instead. The count gives way first, and the pitch follows it. */
  const numScale = 2;
  const numbers = yardNumbers(gw, numScale);
  const PITCH = Math.round(gw / (numbers.length + 1));

  out.push(`<rect width="${px(gw)}" height="${px(gh)}" fill="${C.turf}"/>`);
  /* The bands start half a pitch in, so every colour change lands exactly on a
     yard line and every number sits inside one stripe rather than straddling
     the seam between two. */
  for (let x = PITCH / 2; x < gw; x += PITCH * 2) {
    out.push(
      `<rect x="${px(x)}" y="0" width="${px(PITCH)}" height="${px(gh)}" fill="#1B3724"/>`,
    );
  }

  const line = (x, y, w, h, o) =>
    `<rect x="${px(x)}" y="${px(y)}" width="${px(w)}" height="${px(h)}" fill="#FBFDF8" opacity="${o}"/>`;

  // Sidelines.
  out.push(line(0, 5, gw, 1, 0.32));
  out.push(line(0, gh - 6, gw, 1, 0.32));

  // Yard lines on the band edges, and the numbers centred between them.
  for (let x = PITCH / 2; x < gw; x += PITCH) {
    out.push(line(x, 5, 1, gh - 11, 0.2));
  }

  // Hash marks, two rows, one tick per logical yard.
  for (let x = 5; x < gw; x += 5) {
    out.push(line(x, 32, 2, 1, 0.15));
    out.push(line(x, gh - 33, 2, 1, 0.15));
  }

  /* THE NUMBERS ON THE GRASS. Two rows, top and bottom, sitting inside the
     hash marks the way they do on a field. They are texture rather than
     information, so they are held well back: bright enough to read as
     stencilled paint, faint enough that the wordmark across the middle never
     competes with a 40. */
  const numH = 7 * numScale;
  const rows = [11, gh - 11 - numH];
  const d = [];
  numbers.forEach((n, i) => {
    const cx = (i + 1) * PITCH;
    const x = Math.round(cx - textWidth(n, numScale) / 2);
    for (const y of rows) d.push(textPath(n, px(x), px(y), px(numScale)));
  });
  out.push(`<path d="${d.join("")}" fill="#FBFDF8" opacity="0.2"/>`);

  return out.join("\n  ");
}

/** COMMISH.FUN, in pixels, centred, with a hard offset shadow.
 *
 *  THE SCALE IS DERIVED, NOT PICKED. Eleven characters at six cells each is
 *  sixty-five cells wide once the trailing tracking comes off, and a scale
 *  chosen by eye ran the word off both ends of the banner. It is computed from
 *  the space available instead, so the margins are what get specified and the
 *  type follows.
 *
 *  THE SHADOW IS NOT DECORATION. Chalk on turf measures 9.9:1 and needs no
 *  help, but the brand orange is 3.6:1 on grass — legible as a big display
 *  word and thin without something behind it. One offset copy in panel green
 *  fixes it, costs one path, and is exactly the title-card trick the machines
 *  this is imitating used for the same reason. */
function pixelWordmark(gw, cy, s, margin = 20) {
  const left = "COMMISH";
  const right = ".FUN";

  // Largest whole scale whose word still clears the margins. Whole, because a
  // fractional one would put glyph edges on half pixels and soften them.
  const cells = (left + right).length * 6 - 1;
  const scale = Math.max(1, Math.floor((gw - margin * 2) / cells));

  const total = textWidth(left + right, scale);
  const x0 = Math.round(gw / 2 - total / 2);
  const y0 = Math.round(cy - (7 * scale) / 2);
  const rightX = x0 + left.length * 6 * scale;

  const px = (n) => n * s;
  const dLeft = textPath(left, px(x0), px(y0), px(scale));
  const dRight = textPath(right, px(rightX), px(y0), px(scale));
  const off = px(scale); // a shadow exactly one font pixel down and right

  return `<g>
    <path d="${dLeft + dRight}" fill="${C.night}" opacity="0.85" transform="translate(${off} ${off})"/>
    <path d="${dLeft}" fill="${C.cream}"/>
    <path d="${dRight}" fill="${C.action}"/>
  </g>`;
}

/** The banner. `gw`/`gh` are the logical grid; `s` scales it to the real size. */
const pixelBannerSvg = (gw, gh, s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gw * s} ${gh * s}" width="${gw * s}" height="${gh * s}" role="img" aria-label="Commish dot fun">
  ${pixelField(gw, gh, s)}
  ${pixelWordmark(gw, gh / 2, s)}
</svg>
`;

/** A line of small pixel type, centred, at the largest whole scale that clears
 *  the margins — the same rule as the wordmark, and for the same reason: a
 *  scale picked by eye ran a thirty-three character tagline about sixty per
 *  cent off both sides of the card. */
function pixelLine(text, gw, y, s, fill, { margin = 16, max = 3, opacity = 1 } = {}) {
  const cells = text.length * 6 - 1;
  const scale = Math.max(1, Math.min(max, Math.floor((gw - margin * 2) / cells)));
  const x = Math.round(gw / 2 - textWidth(text, scale) / 2);
  const d = textPath(text, x * s, y * s, scale * s);
  return `<path d="${d}" fill="${fill}"${opacity === 1 ? "" : ` opacity="${opacity}"`}/>`;
}

/* The link preview, in the same language.
 *
 * Converting the header and leaving this one set in Anton would have been the
 * exact failure the brand README exists to prevent: two assets, six inches
 * apart in somebody's feed, disagreeing about what the product looks like. It
 * keeps the Laces, because unlike the header this card meets people with
 * nothing else around it and the mark has to be somewhere. */
const pixelOgSvg = (gw, gh, s) => {
  const markH = 24; // logical pixels
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gw * s} ${gh * s}" width="${gw * s}" height="${gh * s}" role="img" aria-label="Commish dot fun — football pools, escrowed on-chain">
  ${pixelField(gw, gh, s)}
  <g transform="translate(${(gw / 2) * s} ${30 * s}) scale(${(markH * s) / 200})">${laces(C.action)}</g>
  ${pixelWordmark(gw, 68, s, 20)}
  ${pixelLine("FOOTBALL POOLS, ESCROWED ON-CHAIN", gw, 86, s, C.cream, { opacity: 0.8 })}
</svg>
`;
};

/* ── Emit ─────────────────────────────────────────────────────────────────── */
const written = [];

function writeSvg(name, svg) {
  const p = path.join(BRAND, name);
  fs.writeFileSync(p, svg);
  written.push([`brand/${name}`, Buffer.byteLength(svg)]);
  return svg;
}

async function writePng(svg, name, width, height, alsoPublic = false) {
  let img = sharp(Buffer.from(svg), { density: 384 });
  img = height ? img.resize(width, height) : img.resize(width);
  const buf = await img.png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(BRAND, name), buf);
  written.push([`brand/${name}`, buf.length]);
  if (alsoPublic) {
    fs.writeFileSync(path.join(PUBLIC, name), buf);
    written.push([`public/brand/${name}`, buf.length]);
  }
}

async function main() {
  fs.mkdirSync(BRAND, { recursive: true });
  fs.mkdirSync(PUBLIC, { recursive: true });

  // Marks: pure geometry, no font, exact at any size.
  const action = writeSvg("mark-action.svg", markSvg(C.action));
  const cream = writeSvg("mark-cream.svg", markSvg(C.cream));
  writeSvg("mark-night.svg", markSvg(C.night));
  /* Cream laces, not white: pure white on this orange is harsher than the
   * wordmark it sits six inches from on a profile, and every other light thing
   * in the kit is cream. */
  const avatar = writeSvg("avatar.svg", tileSvg(C.action, C.cream));
  /* The inverse, kept because a dark tile is the right answer wherever the
   * frame is already light and orange would shout — a press kit on white, a
   * partner's logo wall. Emitted to brand/ only: nothing ships pointing at it,
   * and an unused file in public/ is weight in the bundle for no one. */
  const avatarNight = writeSvg("avatar-night.svg", tileSvg(C.night, C.action));

  await writePng(action, "mark-action.png", 512, null, true);
  await writePng(cream, "mark-cream.png", 512, null, true);
  await writePng(avatar, "avatar.png", 512, 512, true);
  await writePng(avatar, "appicon.png", 1024, 1024, true);
  await writePng(avatar, "favicon-180.png", 180, 180, true);
  await writePng(avatarNight, "avatar-night.png", 512, 512);

  /* THE HEADER IS PIXELS NOW, and it needs no font at all. Centred, because
     the avatar hangs into the bottom-left corner on X and because the mark is
     already showing there — repeating it in the strip above says the same
     thing twice. */
  const banner = writeSvg("banner-x.svg", pixelBannerSvg(300, 100, 5));
  // Stacked and centred. This one meets people in a feed with nothing else
  // around it, so it keeps the mark and the line saying what the thing is.
  const og = writeSvg("og.svg", pixelOgSvg(240, 126, 5));
  await writePng(banner, "banner-x.png", 1500, 500, true);
  await writePng(og, "og.png", 1200, 630, true);

  const pad = Math.max(...written.map(([n]) => n.length));
  for (const [name, size] of written) {
    console.log(`  ${name.padEnd(pad)}  ${(size / 1024).toFixed(1)} KB`);
  }
  console.log(`\n${written.length} files written.`);
}

await main();
