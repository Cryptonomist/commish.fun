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

import { ADVANCE, CELL_H, textPath, textWidth } from "./pixelfont.mjs";

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
 * Anton is gone from the repository entirely. It was kept for a while after
 * this script stopped needing it, on the grounds that it was still the site's
 * display face — and then the headings moved to Silkscreen too, which left a
 * 170KB TTF and a licence file that nothing anywhere rendered.
 */

/* -- THE PIXEL BANNER ------------------------------------------------------ */

/* The header and the link preview: the old composition, set in the new type.
 *
 * TWO GOES AT THIS. The first pixel version threw the old layout away as well
 * as the old font -- chunky mow bands, heavy yard lines, hash marks, and big
 * boxed numerals with the wordmark stretched nearly to both edges. Every one
 * of those is a thing competing with the name, and the name is the only reason
 * the image exists. The ground stopped being a surface and became a subject.
 *
 * The composition here is the original one, measured off it: a flat turf field
 * under a gold floodlight wash, nineteen hairline yard lines, hash marks at
 * thirty and seventy per cent, and numerals held at sixteen per cent opacity
 * near the top and bottom edges, where they bleed out of frame. All of that is
 * texture you half-see. The wordmark sits in the middle of it with room on
 * both sides.
 *
 * WHAT ACTUALLY CHANGED is the type: every glyph is rectangles from
 * scripts/pixelfont.mjs rather than Anton, which is what makes this read as
 * the same product as the attract loop and the game.
 *
 * The type is drawn on a whole-pixel grid -- one font pixel is always an
 * integer number of real ones -- so the rasteriser has no edge to soften.
 * Everything else is in real coordinates, exactly as the original was.
 */

const FIELD_INK = C.chalk;
/* Fainter than the 0.16 the Anton numerals used, and for a reason that is
   only visible once both are rendered: a bitmap glyph is mostly filled area
   where a condensed grotesque is mostly thin strokes, so the same opacity
   value comes out noticeably heavier. Matched by eye against the old banner
   rather than by number. */
const NUMERAL_OPACITY = 0.13;
const LINE_OPACITY = { strong: 0.18, weak: 0.09 };
const HASH_OPACITY = 0.14;

/** The floodlight wash: gold-led, because orange over green mixes to brown.
 *
 *  TURF, NOT NIGHT. These two images are the only surfaces in the whole system
 *  with no content on them -- just ground and type -- so the ground alone has
 *  to say football. Night cannot: its green channel is six above its red,
 *  which reads as black, and the numerals had nothing to sit against. */
const flood = (w, h) => `<defs>
    <radialGradient id="flood" cx="50%" cy="-10%" r="75%">
      <stop offset="0%" stop-color="${C.gold}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${C.turf}"/>
  <rect width="${w}" height="${h}" fill="url(#flood)"/>`;

/** Field numbering, the way it is painted on real grass: 10 through 50 and
 *  back down. Retro games kept them upright rather than rotated flat, and so
 *  does this -- a rotated numeral at this size is four unreadable rectangles. */
const YARD_NUMBERS = ["10", "20", "30", "40", "50", "40", "30", "20", "10"];

/** How much of the field to number, given the room. Nine fit a 3:1 header and
 *  crowd a 1.9:1 card, so the narrower asset shows the middle of the field
 *  rather than a squeezed whole one -- which is what a camera does anyway.
 *  Always an odd count, so the 50 stays in the centre. */
function yardNumbers(w, fontPx) {
  const each = textWidth("00", fontPx) + fontPx * 6; // a number plus clear air
  let count = Math.max(3, Math.min(YARD_NUMBERS.length, Math.floor(w / each)));
  if (count % 2 === 0) count -= 1;
  const from = (YARD_NUMBERS.length - count) / 2;
  return YARD_NUMBERS.slice(from, from + count);
}

/** Yard lines, hash marks and numerals, at the weights the landing page uses.
 *  Geometry and placement are the original's; only the numerals changed, from
 *  Anton to rectangles. */
function pixelField(w, h) {
  const parts = [];

  // Nineteen hairlines every five per cent, heavier on each tenth. Fine enough
  // to read as a field and never as a grid.
  for (let i = 1; i <= 19; i++) {
    const x = (w * i * 5) / 100;
    const strong = (i * 5) % 10 === 0;
    parts.push(
      `<rect x="${x.toFixed(1)}" y="0" width="1" height="${h}" fill="${FIELD_INK}" opacity="${strong ? LINE_OPACITY.strong : LINE_OPACITY.weak}"/>`,
    );
    for (const ty of [0.3, 0.7]) {
      parts.push(
        `<rect x="${(x - 6).toFixed(1)}" y="${(h * ty).toFixed(1)}" width="13" height="1" fill="${FIELD_INK}" opacity="${HASH_OPACITY}"/>`,
      );
    }
  }

  /* The numerals, sized off the height so they hold the proportion the Anton
     ones did, and pushed to the top and bottom edges so they bleed out of
     frame rather than sitting in a tidy row. Faint: the moment somebody reads
     a yard number before they read COMMISH, this has gone wrong. */
  const fontPx = Math.max(2, Math.round((h * 0.095) / CELL_H));
  const numbers = yardNumbers(w, fontPx);
  const numH = CELL_H * fontPx;
  const rows = [Math.round(h * 0.05), Math.round(h - h * 0.05 - numH)];
  const d = [];
  numbers.forEach((n, i) => {
    const cx = ((i + 1) * w) / (numbers.length + 1);
    const x = Math.round(cx - textWidth(n, fontPx) / 2);
    for (const y of rows) d.push(textPath(n, x, y, fontPx));
  });
  parts.push(
    `<path d="${d.join("")}" fill="${FIELD_INK}" opacity="${NUMERAL_OPACITY}"/>`,
  );

  return parts.join("\n  ");
}

/** COMMISH.FUN, centred on `cy`, one font pixel equal to `fontPx` real ones.
 *
 *  THE SHADOW IS ONE OFFSET COPY at low opacity, not the hard black slab the
 *  first pixel version used. Chalk on turf measures 9.9:1 and needs no help at
 *  all; the brand orange is 3.6:1 on grass and wants a little. Enough to seat
 *  the letters on the field, not enough to read as a second colour. */
function pixelWordmark(w, cy, fontPx) {
  const left = "COMMISH";
  const right = ".FUN";
  const total = textWidth(left + right, fontPx);
  const x0 = Math.round(w / 2 - total / 2);
  const y0 = Math.round(cy - (CELL_H * fontPx) / 2);
  const rightX = x0 + left.length * ADVANCE * fontPx;

  const dLeft = textPath(left, x0, y0, fontPx);
  const dRight = textPath(right, rightX, y0, fontPx);

  return `<g>
    <path d="${dLeft + dRight}" fill="${C.night}" opacity="0.4" transform="translate(${fontPx} ${fontPx})"/>
    <path d="${dLeft}" fill="${C.cream}"/>
    <path d="${dRight}" fill="${C.action}"/>
  </g>`;
}

/** A centred line of small pixel type, at the largest whole font pixel that
 *  clears the margins -- because a size picked by eye ran a thirty-three
 *  character tagline sixty per cent off both sides of the card. */
function pixelLine(text, w, y, fill, opts = {}) {
  const { margin = 90, max = 12, opacity = 1 } = opts;
  const cells = text.length * ADVANCE - 1;
  const fontPx = Math.max(1, Math.min(max, Math.floor((w - margin * 2) / cells)));
  const x = Math.round(w / 2 - textWidth(text, fontPx) / 2);
  return `<path d="${textPath(text, x, y, fontPx)}" fill="${fill}"${opacity === 1 ? "" : ` opacity="${opacity}"`}/>`;
}

/** The font pixel size for the wordmark: derived from the height, so the type
 *  holds the proportion of the image the Anton wordmark did, then clamped so
 *  it can never crowd the sides. Both bounds matter -- sizing on width alone
 *  is what stretched the first pixel version nearly edge to edge. */
function wordmarkPx(w, h) {
  const byHeight = Math.round((h * 0.19) / CELL_H);
  const byWidth = Math.floor((w * 0.6) / (11 * ADVANCE - 1));
  return Math.max(2, Math.min(byHeight, byWidth));
}

const pixelBannerSvg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Commish dot fun">
  ${flood(w, h)}
  ${pixelField(w, h)}
  ${pixelWordmark(w, h / 2, wordmarkPx(w, h))}
</svg>
`;

/* The link preview, in the same language.
 *
 * Converting the header and leaving this one set in Anton would have been the
 * exact failure brand/README.md exists to prevent: two assets, six inches
 * apart in somebody's feed, disagreeing about what the product looks like. It
 * keeps the Laces, because unlike the header this card meets people with
 * nothing else around it and the mark has to be somewhere. */
const pixelOgSvg = (w, h) => {
  const markH = h * 0.17;
  const fontPx = wordmarkPx(w, h * 0.72);
  const wordCy = h * 0.55;
  const tagY = Math.round(wordCy + (CELL_H * fontPx) / 2 + h * 0.075);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Commish dot fun - football pools, escrowed on-chain">
  ${flood(w, h)}
  ${pixelField(w, h)}
  <g transform="translate(${w / 2} ${h * 0.25}) scale(${markH / 200})">${laces(C.action)}</g>
  ${pixelWordmark(w, wordCy, fontPx)}
  ${pixelLine("FOOTBALL POOLS, ESCROWED ON-CHAIN", w, tagY, C.cream, { opacity: 0.7 })}
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
  const banner = writeSvg("banner-x.svg", pixelBannerSvg(1500, 500));
  // Stacked and centred. This one meets people in a feed with nothing else
  // around it, so it keeps the mark and the line saying what the thing is.
  const og = writeSvg("og.svg", pixelOgSvg(1200, 630));
  await writePng(banner, "banner-x.png", 1500, 500, true);
  await writePng(og, "og.png", 1200, 630, true);

  const pad = Math.max(...written.map(([n]) => n.length));
  for (const [name, size] of written) {
    console.log(`  ${name.padEnd(pad)}  ${(size / 1024).toFixed(1)} KB`);
  }
  console.log(`\n${written.length} files written.`);
}

await main();
