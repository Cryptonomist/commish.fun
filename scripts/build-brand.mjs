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
 * SVG is the deliverable and PNG is a convenience. The marks are pure
 * rectangles, so they rasterize exactly at any size. Anything carrying the
 * wordmark needs Anton installed where fontconfig can find it, because
 * librsvg — which is what sharp uses for SVG — resolves fonts through the
 * system and knows nothing about @font-face. `brand/fonts/Anton-Regular.ttf`
 * is committed for that reason, under the SIL Open Font License it ships with;
 * the script installs it into the user font directory if it is missing.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const BRAND = path.join(ROOT, "brand");
const PUBLIC = path.join(ROOT, "public", "brand");

/* ── The palette, copied from globals.css ─────────────────────────────────── */
const C = {
  night: "#0A100C",
  night2: "#121B15",
  night3: "#1F2C24",
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

/** The mark on its own ground, square, for an avatar or an app icon. The
 *  corner radius is left to whoever is placing it: platforms mask their own. */
const avatarSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Commish">
  <rect width="512" height="512" fill="${C.night}"/>
  <g transform="translate(256 256) scale(1.55)">${laces(C.action)}</g>
</svg>
`;

/* ── The field, reused from the site's hero ───────────────────────────────── */

/** Yard lines, hash marks and numerals across a box, at the same weights the
 *  landing page uses. The numerals need Anton; everything else is geometry. */
function field(w, h) {
  const parts = [];
  for (let i = 1; i <= 19; i++) {
    const x = (w * i * 5) / 100;
    const strong = (i * 5) % 10 === 0;
    parts.push(
      `<rect x="${x.toFixed(1)}" y="0" width="1" height="${h}" fill="${C.cream}" opacity="${strong ? 0.1 : 0.05}"/>`,
    );
    for (const ty of [0.3, 0.7]) {
      parts.push(
        `<rect x="${(x - 6).toFixed(1)}" y="${(h * ty).toFixed(1)}" width="13" height="1" fill="${C.cream}" opacity="0.08"/>`,
      );
    }
  }
  /* No directional arrows here, unlike the site. At this size the ◄ and ►
   * glyphs come out as heavy triangles that read as part of the number rather
   * than as a marker, and they push the middle 40-50-40 into each other. The
   * numerals alone are enough to say "field". */
  const nums = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  const size = h * 0.125;
  nums.forEach((n, i) => {
    const x = (w * (i + 1) * 10) / 100;
    for (const y of [size * 1.15, h - size * 0.4]) {
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Anton" font-size="${size.toFixed(1)}" fill="${C.cream}" opacity="0.09" text-anchor="middle" letter-spacing="${(size * 0.08).toFixed(1)}">${n}</text>`,
      );
    }
  });
  return parts.join("\n  ");
}

/** The floodlight wash: gold-led, because orange over green mixes to brown. */
const glow = (w, h) => `<defs>
    <radialGradient id="flood" cx="50%" cy="-10%" r="75%">
      <stop offset="0%" stop-color="${C.gold}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${C.night}"/>
  <rect width="${w}" height="${h}" fill="url(#flood)"/>`;

/** Mark plus wordmark, laid out left to right from a given origin. No filled
 *  tile behind the mark: that is what made the old lockup read as a button.
 *
 *  `markH` is the height of the mark's BOX, and the laces only fill about half
 *  its width — they are thin strokes where Anton is a slab, so matching the two
 *  by box height leaves the mark looking spindly. It is sized up against the
 *  cap height by eye instead, which is the only way this kind of pairing ever
 *  gets settled. */
/** The wordmark on its own. `anchor` is an SVG text-anchor, so "middle" with
 *  x at half the width centres it without anyone having to know how wide Anton
 *  sets eleven characters. */
function wordmark(x, y, fontSize, anchor = "start") {
  return `<text x="${x}" y="${(y + fontSize * 0.35).toFixed(1)}" text-anchor="${anchor}" font-family="Anton" font-size="${fontSize}" letter-spacing="${(fontSize * 0.015).toFixed(2)}" fill="${C.cream}">COMMISH<tspan fill="${C.action}">.FUN</tspan></text>`;
}

function lockup(x, y, markH, fontSize) {
  const gap = markH * 0.16;
  return `<g transform="translate(${x} ${y})">
    <g transform="translate(${markH / 2} 0) scale(${markH / 200})">${laces(C.action)}</g>
    ${wordmark(markH + gap, 0, fontSize)}
  </g>`;
}

/* Two compositions, because the two sizes are read differently.
 *
 * A link preview is a card someone glances at in a feed, so it carries the
 * full lockup and a line saying what the thing is. A social header is a strip
 * sitting directly above the profile it belongs to, where the avatar is
 * already showing the mark six inches away — repeating it there is just
 * saying the same thing twice, and centring the wordmark also keeps it clear
 * of the avatar, which on X hangs into the bottom-left corner. */
const bannerSvg = (w, h, opts) => {
  const { markH, fontSize, tagline = null, centered = false } = opts;
  const pad = w * 0.065;
  const body = centered
    ? wordmark(w / 2, h / 2, fontSize, "middle")
    : lockup(pad, h / 2 - (tagline ? h * 0.05 : 0), markH, fontSize);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  ${glow(w, h)}
  ${field(w, h)}
  ${body}
  ${
    tagline
      ? `<text x="${pad}" y="${h / 2 + h * 0.16}" font-family="Anton" font-size="${h * 0.052}" letter-spacing="${h * 0.011}" fill="${C.creamDim}">${tagline}</text>`
      : ""
  }
</svg>
`;
};

/* ── Make sure Anton is where fontconfig will find it ─────────────────────── */
function ensureFont() {
  const src = path.join(BRAND, "fonts", "Anton-Regular.ttf");
  if (!fs.existsSync(src)) {
    throw new Error(`Missing ${src}. The wordmark cannot be set without it.`);
  }
  const dir = path.join(os.homedir(), ".local", "share", "fonts");
  const dest = path.join(dir, "Anton-Regular.ttf");
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
    try {
      execFileSync("fc-cache", ["-f"], { stdio: "ignore" });
    } catch {
      /* fc-cache is optional; librsvg will usually pick the file up anyway. */
    }
    console.log("installed Anton into", dir);
  }
}

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
  ensureFont();
  fs.mkdirSync(BRAND, { recursive: true });
  fs.mkdirSync(PUBLIC, { recursive: true });

  // Marks: pure geometry, no font, exact at any size.
  const action = writeSvg("mark-action.svg", markSvg(C.action));
  const cream = writeSvg("mark-cream.svg", markSvg(C.cream));
  writeSvg("mark-night.svg", markSvg(C.night));
  const avatar = writeSvg("avatar.svg", avatarSvg());

  await writePng(action, "mark-action.png", 512, null, true);
  await writePng(cream, "mark-cream.png", 512, null, true);
  await writePng(avatar, "avatar.png", 512, 512, true);
  await writePng(avatar, "appicon.png", 1024, 1024, true);
  await writePng(avatar, "favicon-180.png", 180, 180, true);

  // Anything with the wordmark needs the installed font.
  // Wordmark only and centred: the avatar beside it is already the mark.
  const banner = writeSvg(
    "banner-x.svg",
    bannerSvg(1500, 500, { fontSize: 152, centered: true }),
  );
  const og = writeSvg(
    "og.svg",
    bannerSvg(1200, 630, {
      markH: 190,
      fontSize: 108,
      tagline: "FOOTBALL POOLS, ESCROWED ON-CHAIN",
    }),
  );
  await writePng(banner, "banner-x.png", 1500, 500, true);
  await writePng(og, "og.png", 1200, 630, true);

  const pad = Math.max(...written.map(([n]) => n.length));
  for (const [name, size] of written) {
    console.log(`  ${name.padEnd(pad)}  ${(size / 1024).toFixed(1)} KB`);
  }
  console.log(`\n${written.length} files written.`);
}

await main();
