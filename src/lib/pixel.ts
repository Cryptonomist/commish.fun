/* THE PIXEL LAYER: one field, one player, drawn from fillRect calls.
 *
 * There are two canvases on this site now — the attract loop on the landing
 * page and the playable drive at /arcade — and before this file there was one
 * sprite definition living inside the attract component. A second canvas would
 * have meant a second copy, and a fortnight later they would have been two
 * slightly different footballers. So the sprite and the field live here and
 * both canvases call the same functions.
 *
 * EVERYTHING IS INTEGER COORDINATES AT A SMALL LOGICAL SIZE, scaled up by CSS
 * with smoothing off. That is what makes the pixels hard squares rather than
 * blurry rectangles, and it is why nothing in here ever draws on a half pixel.
 *
 * No library, no WebGL, no images, no network.
 */

import {
  drawRun,
  drawTextUp,
  GLYPH_H,
  plain,
  runLength,
  RUN_THICKNESS,
  type Segment,
} from "@/lib/fieldfont";

/** The canvas palette. These are the same values as the CSS custom properties
 *  in globals.css, repeated here because a canvas cannot read a CSS variable
 *  without a getComputedStyle call per fill, which at 30fps is a real cost for
 *  no benefit. If a colour changes there it has to change here. */
export const PX = {
  chalk: "#FBFDF8",
  panel: "#0B1710",
  turf: "#24492E",
  turf2: "#1B3724",
  gold: "#E9C258",
  action: "#FF6A2B",
  out: "#EC565B",
  alive: "#7BD88F",
  dim: "#A9B8AC",
  pants: "#E8EDE6",
  /* THE DOLLAR THE POT IS ACTUALLY DENOMINATED IN. Gold is the money token in
   * this palette and means money in the abstract; this is the specific coin a
   * vault holds, and it is blue because USDC is. It is used for coins and for
   * nothing else. */
  usdc: "#2775CA",
  /* THE GOALPOSTS' OWN YELLOW, and the one exception to the rule above.
   * Goalposts are painted yellow and a cream one reads as another chalk
   * line, so they get a colour of their own. It is deliberately NOT
   * `gold`: gold means money here and nothing else, ever. The hero field
   * on the landing page paints its posts from this same value rather than
   * keeping a second copy of the number. */
  post: "#FFC72C",
  /* The paint on an endzone. Dark enough that chalk lettering on it reads
   * at two pixels a stroke, and the same night green the rest of the site
   * is built on, so the stadium belongs to this brand and not a generic
   * one. */
  endzone: "#0B1710",
} as const;

/* THE USDC MARK, PIXELATED. A blue disc, a white ring inside it, and a dollar
 * sign — which is what the token's logo actually is.
 *
 * FOUR VERSIONS OF THIS SHIPPED BEFORE THIS ONE and every failure was the same
 * root cause: judging pixel art by reading the array instead of putting it on a
 * screen. A gold slab that landed on the winner. The same slab moved beside
 * him. Six small coins in a heap. Then a disc with a bare S on it, which is a
 * different symbol from a dollar sign and was rightly called out. This one was
 * generated, rendered at eleven pixels per cell against the real logo, and
 * only then written down.
 *
 * SEVENTEEN ACROSS, because the mark has three concentric parts and they need
 * room. Fifteen could not hold a ring and a glyph without one eating the other.
 *
 * THE STROKE STAYS INSIDE THE RING. On the real logo it breaks through, with a
 * gap of blue either side. That was tried and abandoned: carving a gap at this
 * size fragments the ring into arcs and leaves the bowl full of stray pixels,
 * and running the stroke through WITHOUT a gap merges the two into a heavy bar
 * across the top and bottom. A clean unbroken ring with the dollar sign held
 * inside it is the closest this resolution gets, and it is the version that
 * still reads at the size it is actually drawn.
 *
 *   B  the disc, USDC blue
 *   W  the ring and the dollar sign, chalk
 *   .  outside the coin
 */
const COIN = [
  "........B........",
  ".....BBBBBBB.....",
  "...BBBBWWWBBBB...",
  "..BBBWWWBWWWBBB..",
  "..BBWBBBWBBBWBB..",
  ".BBWBBBWWWBBBWBB.",
  ".BBWBBWBWBWBBWBB.",
  ".BWWBBWBWBBBBWWB.",
  "BBWBBBBWWWBBBBWBB",
  ".BWWBBBBWBWBBWWB.",
  ".BBWBBWBWBWBBWBB.",
  ".BBWBBBWWWBBBWBB.",
  "..BBWBBBWBBBWBB..",
  "..BBBWWWBWWWBBB..",
  "...BBBBWWWBBBB...",
  ".....BBBBBBB.....",
  "........B........",
];

export const COIN_W = 17;
export const COIN_H = 17;

/** One coin, top-left at (px, py). `flash` swaps the two inks, which is the
 *  frame a collected coin pops on. */
export function drawCoin(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  flash = false,
): void {
  const x = Math.round(px);
  const y = Math.round(py);

  /* Outline first and one pixel proud, the same trick the players use: blue on
   * green has almost no luminance separation, and without a dark edge the coin
   * dissolves into the grass. */
  ctx.fillStyle = PX.panel;
  for (let r = 0; r < COIN_H; r++) {
    for (let c = 0; c < COIN_W; c++) {
      if (COIN[r][c] !== ".") ctx.fillRect(x + c - 1, y + r - 1, 3, 3);
    }
  }

  const disc = flash ? PX.chalk : PX.usdc;
  const ink = flash ? PX.usdc : PX.chalk;
  for (let r = 0; r < COIN_H; r++) {
    for (let c = 0; c < COIN_W; c++) {
      const cell = COIN[r][c];
      if (cell === ".") continue;
      ctx.fillStyle = cell === "W" ? ink : disc;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}

/** A club's two colours. Matches the shape of an entry in TEAMS. */
export type Kit = { lead: string; trim: string };

export const SPRITE_W = 8;
/* Sixteen, not fifteen, and the extra row went to the helmet. A shell four
 * rows tall cannot hold a brow, a facemask and a jaw at the same time. There
 * is nowhere to put the mask that is not either on the player's forehead or
 * where his chin should be. Everything below the neck moved down a pixel.
 * Anything that positions a player against this number tracks it; anything
 * TUNED against it must not, and `touching` in bowl.ts says so at the site. */
export const SPRITE_H = 16;

/** Where the marks go. The simulation owns these numbers, because a yard line
 *  that disagrees with the yard the game is counting is worse than no yard
 *  line at all, so they are passed in rather than written down twice. */
export type FieldGeometry = {
  /** Logical pixels per yard. */
  yard: number;
  /** World x of your goal line. The back of your endzone is x = 0. */
  ownGoal: number;
  /** World x of their goal line. */
  goal: number;
  /** World x of the back of their endzone: the far end line. */
  world: number;
};

/* THE FIELD.
 *
 * `camX` is the world coordinate at the left edge of the viewport, so the
 * landing page passes a fixed one and gets a static view while the game passes
 * a moving camera and gets the same field scrolling under it. Marks are
 * positioned in world space and then offset, which is the only way a mow band
 * stays attached to the same patch of grass as the camera moves. Computing
 * them in screen space makes the whole field slide against itself.
 *
 * THE YARD LINES USED TO BE A LIE. They were drawn every 24 logical pixels,
 * and a yard is 6, so they fell every FOUR yards and were anchored to the
 * origin of the world rather than to a goal line. Nothing depended on them, so
 * nothing complained: they were decoration that happened to look like
 * measurement. The moment this field carries numbers they stop being
 * decoration, because a 30 painted on the 32 is not a stylistic choice. They
 * now come off `f.ownGoal` and step five real yards at a time.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camX: number,
  f: FieldGeometry,
): void {
  /** World x to screen x. Everything below goes through this. */
  const sx = (worldX: number) => Math.round(worldX - camX);
  /** Is any of [a, b) on screen? Saves the work of drawing a whole endzone
   *  that is four hundred pixels off the left edge. */
  const near = (a: number, b: number) => sx(b) > -2 && sx(a) < w + 2;

  const TOP = 4;
  const BOT = h - 5;

  ctx.fillStyle = PX.turf;
  ctx.fillRect(0, 0, w, h);

  // Mow bands, 32 world pixels wide, every other one darker.
  const BAND = 32;
  const firstBand = Math.floor(camX / BAND) - 1;
  const lastBand = Math.ceil((camX + w) / BAND) + 1;
  ctx.fillStyle = PX.turf2;
  for (let b = firstBand; b <= lastBand; b++) {
    if (((b % 2) + 2) % 2 !== 0) continue;
    ctx.fillRect(sx(b * BAND), 0, BAND, h);
  }

  /* THE ENDZONES, painted rather than shaded.
   *
   * These used to be a wash of translucent black with a rake through it, laid
   * over the field by the game component after the fact. That reads as a
   * shadow on the grass. A real endzone is a different colour of paint with a
   * name in it, and it is the single thing that makes a strip of green look
   * like a stadium rather than a lawn.
   *
   * The name runs down the screen because endzone lettering runs parallel to
   * the goal line, and from this camera that is the short way across.
   */
  for (const [from, to, facing] of [
    [0, f.ownGoal, 1],
    [f.goal, f.world, -1],
  ] as const) {
    if (!near(from, to)) continue;
    ctx.fillStyle = PX.endzone;
    ctx.fillRect(sx(from), TOP, sx(to) - sx(from), BOT - TOP + 1);

    const runH = runLength(WORDMARK, ENDZONE_TRACKING) * ENDZONE_SCALE;
    const runW = RUN_THICKNESS * ENDZONE_SCALE;
    drawRun(
      ctx,
      WORDMARK,
      sx(from) + Math.round((to - from - runW) / 2),
      TOP + Math.round((BOT - TOP - runH) / 2),
      ENDZONE_SCALE,
      facing,
      PX.panel,
      ENDZONE_TRACKING,
    );
  }

  // Sidelines, and the end lines that close the box.
  ctx.fillStyle = "rgba(251,253,248,0.35)";
  ctx.fillRect(0, TOP, w, 1);
  ctx.fillRect(0, BOT, w, 1);
  for (const end of [0, f.world]) {
    if (near(end, end)) ctx.fillRect(sx(end), TOP, 1, BOT - TOP);
  }

  /* Yard lines every five yards, walked out from your goal line so they land
   * on real yards. The tens are brighter than the fives, the way they are on
   * grass. */
  const firstLine = Math.max(0, Math.floor((camX - f.ownGoal) / f.yard / 5) * 5);
  for (let yd = firstLine; yd <= 100; yd += 5) {
    const x = sx(f.ownGoal + yd * f.yard);
    if (x > w + 2) break;
    if (x < -2) continue;
    ctx.fillStyle =
      yd % 10 === 0 ? "rgba(251,253,248,0.30)" : "rgba(251,253,248,0.18)";
    ctx.fillRect(x, TOP, 1, BOT - TOP);
  }

  // The goal lines, the brightest marks on any field.
  ctx.fillStyle = "rgba(251,253,248,0.75)";
  for (const g of [f.ownGoal, f.goal]) {
    if (near(g, g)) ctx.fillRect(sx(g), TOP, 1, BOT - TOP);
  }

  /* HASH MARKS, EVERY YARD. The NFL sets its hashes 70 feet 9 inches in from
   * each sideline, which is a far narrower pair than college football's and is
   * the most recognisable thing about these markings. They stop at the goal
   * lines, because an endzone carries none. */
  ctx.fillStyle = "rgba(251,253,248,0.20)";
  const hashTop = Math.round(TOP + (BOT - TOP) * 0.42);
  const hashBot = Math.round(TOP + (BOT - TOP) * 0.58);
  const firstHash = Math.max(0, Math.floor((camX - f.ownGoal) / f.yard));
  for (let yd = firstHash; yd <= 100; yd++) {
    if (yd % 5 === 0) continue; // the yard line is already there
    const x = sx(f.ownGoal + yd * f.yard);
    if (x > w + 2) break;
    if (x < -2) continue;
    ctx.fillRect(x, hashTop, 1, 1);
    ctx.fillRect(x, hashBot, 1, 1);
  }

  /* THE MIDFIELD LOGO, under everything that moves. */
  const midX = f.ownGoal + 50 * f.yard;
  if (near(midX - LOGO_R, midX + LOGO_R)) {
    drawMidfieldLogo(ctx, sx(midX), Math.round((TOP + BOT) / 2));
  }

  /* THE NUMBERS, and they are UPRIGHT rather than lying on their side.
   *
   * A real field paints them rotated, and the far row upside down from the
   * near one, which is what the arcade games of this era copied. The hero
   * field on the landing page already decided against reproducing that, for a
   * reason that applies just as well here: an upside-down number on a screen
   * reads as a rendering fault rather than as a field. The two fields agree,
   * which matters more than either of them matching a photograph.
   *
   * The arrow is the whole difference between a football field and a ruler.
   * The fifty does not get one, because it is not counting toward anything.
   */
  for (let yd = 10; yd <= 90; yd += 10) {
    const x = sx(f.ownGoal + yd * f.yard);
    if (x < -20 || x > w + 20) continue;
    const label = String(yd <= 50 ? yd : 100 - yd);
    const labelW = runLength(plain(label));
    const lx = x - Math.round(labelW / 2);
    for (const y of [NUM_INSET, h - NUM_INSET - GLYPH_H]) {
      drawTextUp(ctx, label, lx, y, 1, NUM_INK);
      if (yd !== 50) {
        arrow(ctx, yd < 50 ? lx - 5 : lx + labelW + 2, y, yd < 50 ? -1 : 1);
      }
    }
  }

  /* THE UPRIGHTS, at the back of BOTH endzones. They used to exist only at the
   * far end, drawn by the game component, which meant a kickoff return started
   * in an endzone with no goalpost in it.
   *
   * YELLOW, and it is the one exception to this palette. Goalposts are painted
   * yellow and a cream one reads as another chalk line. It is deliberately NOT
   * PX.gold: gold means money in this system and nothing else, ever, so the
   * posts carry their own colour and no other meaning. Same value as the hero
   * field's, imported from here so there is one of it.
   */
  for (const end of [POST_INSET, f.world - POST_INSET]) {
    if (!near(end - 10, end + 10)) continue;
    uprights(ctx, sx(end), Math.round((TOP + BOT) / 2));
  }
}

/* THE WORDMARK, in the wordmark's own two colours: COMMISH in cream and .FUN
 * in the action orange, exactly as the lockup in the header sets it. It used
 * to be one flat run of chalk, which said the right word in the wrong voice.
 *
 * The dark keyline is what lets the orange survive down here. Plain action on
 * this endzone green is a weak contrast and the .FUN went muddy without it;
 * the same panel-coloured ring the header uses fixes it the same way. */
const WORDMARK: Segment[] = [
  { text: "COMMISH", fill: PX.chalk },
  { text: ".FUN", fill: PX.action },
];
/* Three, and the tracking closes to one unit to pay for it. At Silkscreen's
 * own two-unit tracking the run is 60 units long, which at this scale is 180
 * logical pixels against the 171 the field has between its sidelines: it does
 * not fit, and dropping to scale 2 leaves the lettering ten pixels thick in a
 * sixty pixel endzone, which reads as a caption rather than as paint. Tighter
 * tracking at three is the trade, and at three pixels a stroke it is the
 * letterforms that carry the wordmark, not the air between them. */
const ENDZONE_SCALE = 3;
const ENDZONE_TRACKING = 1;
const NUM_INSET = 7;
const NUM_INK = "rgba(251,253,248,0.34)";

/** A stepped triangle, pointing at the goal line the number counts toward.
 *  `dir` is -1 for left, 1 for right. Five rows, drawn rather than typed,
 *  because a font's arrow next to a bitmap number is the most obvious thing on
 *  the field. */
function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: -1 | 1,
): void {
  ctx.fillStyle = NUM_INK;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + (dir === 1 ? i : 2 - i), y + i, 1, 5 - i * 2);
  }
}

/* How far in from the end line the posts stand.
 *
 * Twelve rather than eight, which is not a matter of taste. The camera cannot
 * travel past the end line, so at eight the far post's outer upright sat in
 * the last two columns of the viewport and was sliced in half by the edge of
 * the screen — a goalpost with one leg. Twelve puts the whole crossbar inside
 * the frame at both ends. Found by rendering it, not by reading it. */
const POST_INSET = 12;

/* Head on: a base post down to the ground, a crossbar, and two uprights well
 * above it. Real goalposts are narrow things, and drawing them wide is the
 * usual tell that somebody guessed. */
function uprights(
  ctx: CanvasRenderingContext2D,
  x: number,
  mid: number,
): void {
  ctx.fillStyle = PX.post;
  ctx.fillRect(x, mid - 2, 2, 26); // base post, down to the ground
  ctx.fillRect(x - 7, mid - 4, 16, 2); // crossbar
  ctx.fillRect(x - 7, mid - 26, 2, 22); // upright, near side
  ctx.fillRect(x + 7, mid - 26, 2, 22); // upright, far side
}

/** Radius of the painted circle at midfield. */
const LOGO_R = 25;

/* THE MARK AT THE FIFTY, which is where a field carries the badge of whoever
 * owns it. This is ours: the laces on an orange disc, painted on the grass.
 *
 * NOT THE LEAGUE'S SHIELD, and that is a decision rather than an oversight. A
 * shield at midfield is the strongest visual claim there is that a field is an
 * official one, and this product holds people's money and says plainly on
 * three pages that it is affiliated with nobody.
 */
function drawMidfieldLogo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
): void {
  /* A filled disc, scanline by scanline. Two of them: a chalk rim a pixel
   * proud of the orange, so the mark sits on the grass rather than floating
   * over it.
   *
   * THE ORANGE IS NOT OPAQUE, and that is the difference between a logo
   * painted on a field and a sticker stuck to one. At full strength this is by
   * some distance the brightest thing on the screen, brighter than the ball
   * carrier, and the eye goes to it instead of to the play. Letting a quarter
   * of the grass through mutes it to about what paint on turf actually looks
   * like, and the mow bands still read faintly underneath it, which is the
   * detail that sells it. */
  for (const [r, colour] of [
    [LOGO_R, "rgba(251,253,248,0.38)"],
    [LOGO_R - 1, "rgba(255,106,43,0.74)"], // PX.action, thinned
  ] as const) {
    ctx.fillStyle = colour;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  }
  drawLaces(ctx, cx, cy, 26, PX.pants);
}

/* THE LACES, drawn rather than imported, because the component that owns the
 * mark is an SVG and this is a canvas.
 *
 * The proportions are lifted from that SVG exactly: against a spine of height
 * H, the spine is 0.107H wide, each of the four ticks is 0.583H wide and
 * 0.107H tall, and their centres sit at 0.321H and 0.107H either side of the
 * middle. The 14 degree tilt is applied as a shear, one row at a time, which
 * is the only way to rotate anything in a picture made of squares.
 */
export function drawLaces(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  height: number,
  colour: string,
): void {
  const TILT = 0.242; // sin 14 degrees: the top leans left, the foot right
  const spineW = Math.max(1, Math.round(height * 0.107));
  const tickW = Math.round(height * 0.583);
  const tickH = Math.max(1, Math.round(height * 0.107));
  const half = Math.round(height / 2);

  ctx.fillStyle = colour;
  const bar = (top: number, rows: number, wide: number) => {
    for (let i = 0; i < rows; i++) {
      const y = top + i;
      const lean = Math.round((y - cy) * TILT);
      ctx.fillRect(cx + lean - Math.floor(wide / 2), y, wide, 1);
    }
  };

  bar(cy - half, half * 2 + 1, spineW);
  for (const at of [-0.321, -0.107, 0.107, 0.321]) {
    bar(cy + Math.round(at * height) - Math.floor(tickH / 2), tickH, tickW);
  }
}

/* A PLAYER, 8 wide and 16 tall, drawn from a couple of dozen rectangles.
 *
 * This was two rects for a long time and it read as a coloured domino, which
 * is what it was. A sprite of this era is not much more than that, but the
 * "not much" is the whole thing:
 *
 *   a domed helmet with a crown stripe and a facemask wedging out the front,
 *   one dark pixel for the neck so the head separates from the torso,
 *   shoulders wider than the waist,
 *   a jersey in the club's lead colour,
 *   a belt and socks in the club's trim,
 *   white pants, and two legs that alternate.
 *
 * Both club colours travel, which is what makes it thirty-two teams rather
 * than thirty-two rectangles: Baltimore and Minnesota are both purple and only
 * the second colour tells them apart.
 *
 * `stride` alternates the legs. On an NES that was the entire running
 * animation and it is enough here too.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  kit: Kit,
  o: {
    /** Alternate the legs. Flip it every other frame while moving. */
    stride?: boolean;
    /** 1 faces right, -1 faces left. Only the facemask moves, which is enough. */
    facing?: 1 | -1;
    /** Eliminated: greyed out and stamped with an X. */
    out?: boolean;
    /** One pixel shorter, for the frame a falling player lands. */
    squash?: boolean;
    /** Tuck the ball under the near arm. */
    ball?: boolean;
  } = {},
): void {
  const x = Math.round(px);
  const y = Math.round(py) + (o.squash ? 1 : 0);
  const facing = o.facing ?? 1;
  const body = o.out ? PX.dim : kit.lead;
  const trim = o.out ? PX.dim : kit.trim;

  /* THE OUTLINE, FIRST, UNDER EVERYTHING. Tecmo's players are drawn against a
   * green field the same way ours are, and the reason theirs sit ON the pitch
   * instead of dissolving into it is a hard dark edge on every side. Without
   * it a navy jersey on turf is two dark shapes touching. This is one silhouette
   * pass a pixel out in each direction, painted before the body so every
   * coloured rect lands on top of it and only the fringe survives. */
  /* Each band is one pixel PROUD of whatever is painted over it, which is the
   * whole job and is easy to get subtly wrong: a first pass sized these to the
   * body instead of around it, so the helmet and the shoulder pads — the two
   * widest parts, and the ones that most need to read — covered their own
   * outline exactly and had no edge at all. Read back off the canvas rather
   * than looked at, because at this size the difference is one pixel and it
   * disappears on a screenshot. */
  ctx.fillStyle = PX.panel;
  /* The head takes three bands rather than one rectangle, because the head is
   * no longer a rectangle. A single rect here leaves dark blocks squatting on
   * the top corners of a domed crown, which is most of what made the old one
   * read as a television set. The last band runs a row past the helmet and is
   * the dark line at the neck: without it the helmet and the jersey are the
   * same colour touching, and the whole top half reads as one lump. */
  ctx.fillRect(x + 1, y, 6, 1); // around the crown, which is 4 wide
  ctx.fillRect(x, y + 1, 8, 1); // around the dome, which is 6
  ctx.fillRect(x - 1, y + 2, 10, 4); // around the shell, the mask, and the neck
  ctx.fillRect(x - 2, y + 6, 12, 2); // around the pads, which are 10
  ctx.fillRect(x, y + 8, 8, 8); // around the jersey and legs, which are 6

  /* THE HELMET IS THE WHOLE READ.
   *
   * It used to be a full-width rectangle with a white square punched into the
   * front, and rendered at size it was a television set: flat on top, square
   * at the corners, and the facemask sitting inside the shell like a window
   * rather than in front of it like a cage. Three things fix that.
   *
   * THE CROWN IS DOMED. Four pixels across the top, six below it, seven at the
   * brow. Square corners on a head are the loudest wrong note at this size,
   * and a shell that widens as it comes down is most of the way to a helmet
   * before any detail goes on it.
   *
   * THE SHELL TAPERS AND THE MASK TAKES THE CORNER. Below the brow the shell
   * gives up a column a row, and the facemask takes what it gives up: two
   * pixels at the cheek, three at the jaw. The diagonal where they meet is the
   * jaw line, and the mask ends up a column PROUD of the brow, which is what
   * makes it read as hardware bolted to the front rather than paint on the
   * side.
   *
   * A CAGE WITH AIR IN IT WAS TRIED FIRST and it was worse. Leaving the mouth
   * dark behind a thin bar is what a facemask actually looks like, and at five
   * rows it renders as a hole in the head with something white in it: an eye,
   * not a mask. Tecmo drew a solid wedge for the same reason. The gap is the
   * truer drawing and the wedge is the one that reads, and what reads wins.
   *
   * It needed a fifth row for any of this. In four there is a crown, a dome, a
   * brow and a jaw, and the mask has to go on top of one of them.
   *
   * Columns are counted from the BACK of the head so one set of numbers draws
   * both facings. The head mirrors inside the same 8 wide box, and the
   * facemask is still the only thing that says which way he is running.
   *
   * All of this was drawn by rendering it. `scripts/render-sprite.mjs` puts
   * the real sprite on a real turf background at 22x, which is the only way
   * any of the above was knowable: the television, the eye, and the wedge all
   * look identical in the fillRect calls.
   */
  const hx = (c: number, w: number) => (facing === 1 ? x + c : x + 8 - c - w);

  ctx.fillStyle = body;
  ctx.fillRect(hx(1, 6), y + 1, 6, 1); // the dome
  ctx.fillRect(hx(0, 7), y + 2, 7, 1); // the brow, the widest row
  ctx.fillRect(hx(0, 6), y + 3, 6, 1); // the cheek
  ctx.fillRect(hx(0, 5), y + 4, 5, 1); // the jaw, with the ear flap behind it
  // The crown stripe, front to back, inset a pixel each side so it reads as a
  // stripe running over a curve rather than a lid sitting on a box.
  ctx.fillStyle = trim;
  ctx.fillRect(hx(2, 4), y, 4, 1);
  // The facemask, filling the corner the shell gives up: two across the cheek,
  // three across the jaw, a column proud of the brow above it.
  ctx.fillStyle = PX.chalk;
  ctx.fillRect(hx(6, 2), y + 3, 2, 1);
  ctx.fillRect(hx(5, 3), y + 4, 3, 1);

  /* SHOULDER PADS THAT ACTUALLY FLARE. They used to be 8 wide over a 6 wide
   * jersey — one pixel of shoulder, which is a person standing up straight. The
   * pads now break the sprite box by a pixel each side and the jersey tucks two
   * in, so the torso is a wedge. That taper is the Tecmo silhouette; everything
   * else is decoration on top of it. */
  ctx.fillStyle = body;
  ctx.fillRect(x - 1, y + 6, 10, 2); // pads, proud of the hips
  ctx.fillRect(x + 1, y + 8, 6, 2); // jersey, tapering in
  // The belt in the club's second colour.
  ctx.fillStyle = trim;
  ctx.fillRect(x + 1, y + 10, 6, 1);

  // Pants, white the way almost every away kit is.
  ctx.fillStyle = o.out ? PX.dim : PX.pants;
  ctx.fillRect(x + 1, y + 11, 6, 2);
  // Socks in the trim colour, which is both true of the kit and the only way
  // the stride reads at all: white legs under white pants are invisible.
  ctx.fillStyle = trim;
  ctx.fillRect(x + 1, y + 13, 2, o.stride ? 3 : 2);
  ctx.fillRect(x + 5, y + 13, 2, o.stride ? 2 : 3);

  // The ball, tucked under the arm on the side he is facing.
  if (o.ball) {
    ctx.fillStyle = "#7A4A22";
    ctx.fillRect(facing === 1 ? x + 7 : x - 1, y + 8, 2, 3);
    ctx.fillStyle = PX.chalk;
    ctx.fillRect(facing === 1 ? x + 7 : x - 1, y + 9, 2, 1);
  }

  if (o.out) {
    // The elimination X, stamped over the whole sprite.
    ctx.fillStyle = PX.out;
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(x + i, y + 4 + i, 1, 1);
      ctx.fillRect(x + 7 - i, y + 4 + i, 1, 1);
    }
  }
}
