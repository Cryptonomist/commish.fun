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
} as const;

/** A club's two colours. Matches the shape of an entry in TEAMS. */
export type Kit = { lead: string; trim: string };

export const SPRITE_W = 8;
export const SPRITE_H = 15;

/* THE FIELD.
 *
 * `camX` is the world coordinate at the left edge of the viewport, so the
 * landing page passes 0 and gets a static field while the game passes a moving
 * camera and gets the same field scrolling under it. Marks are positioned in
 * world space and then offset, which is the only way a mow band stays attached
 * to the same patch of grass as the camera moves — computing them in screen
 * space makes the whole field slide against itself.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camX = 0,
): void {
  ctx.fillStyle = PX.turf;
  ctx.fillRect(0, 0, w, h);

  // Mow bands, 32 world pixels wide, every other one darker.
  const BAND = 32;
  const first = Math.floor(camX / BAND) - 1;
  const last = Math.ceil((camX + w) / BAND) + 1;
  ctx.fillStyle = PX.turf2;
  for (let b = first; b <= last; b++) {
    if (((b % 2) + 2) % 2 !== 0) continue;
    ctx.fillRect(Math.round(b * BAND - camX), 0, BAND, h);
  }

  // Sidelines, 4px in from the top and bottom.
  ctx.fillStyle = "rgba(251,253,248,0.35)";
  ctx.fillRect(0, 4, w, 1);
  ctx.fillRect(0, h - 5, w, 1);

  // Five-yard lines.
  ctx.fillStyle = "rgba(251,253,248,0.22)";
  for (let x = Math.floor(camX / 24) * 24; x < camX + w; x += 24) {
    ctx.fillRect(Math.round(x - camX), 4, 1, h - 9);
  }

  // Hash marks, two rows.
  ctx.fillStyle = "rgba(251,253,248,0.18)";
  for (let x = Math.floor(camX / 12) * 12; x < camX + w; x += 12) {
    const sx = Math.round(x - camX);
    ctx.fillRect(sx, Math.round(h * 0.28), 2, 1);
    ctx.fillRect(sx, Math.round(h * 0.72), 2, 1);
  }
}

/* A PLAYER, 8 wide and 15 tall, drawn as eleven rectangles.
 *
 * This was two rects for a long time and it read as a coloured domino, which
 * is what it was. A sprite of this era is not much more than that, but the
 * "not much" is the whole thing:
 *
 *   a helmet with a crown stripe and a facemask sticking out the front,
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
  ctx.fillRect(x - 1, y, 10, 5); // around the helmet, which is 8 wide
  ctx.fillRect(x - 2, y + 5, 12, 2); // around the pads, which are 10
  ctx.fillRect(x, y + 7, 8, 8); // around the jersey and legs, which are 6

  /* THE HELMET IS THE WHOLE READ, and it was too small. Four rows of fifteen is
   * a head on a person; Tecmo's is closer to a third of the sprite, which is
   * what makes those players look like footballers in gear rather than men in
   * coloured shirts. Five rows here, full 8 wide, so it overhangs the waist. */
  ctx.fillStyle = body;
  ctx.fillRect(x + 1, y, 6, 4);
  ctx.fillRect(x, y + 1, 8, 3); // the ear holes, widening the helmet
  // The crown stripe, front to back. One pixel, and it is the first thing that
  // reads as a football helmet rather than a bean.
  ctx.fillStyle = trim;
  ctx.fillRect(x + 1, y, 6, 1);
  // Facemask, poking out the front, which is what makes it a helmet rather
  // than a hat — and the only thing that says which way he is running.
  ctx.fillStyle = PX.chalk;
  ctx.fillRect(facing === 1 ? x + 6 : x, y + 2, 2, 2);

  // A DARK LINE FOR THE NECK. Without it the helmet and the jersey are the
  // same colour touching, so the whole top half reads as one lump. One pixel
  // of shadow is what separates a head from a torso.
  ctx.fillStyle = PX.panel;
  ctx.fillRect(x + 1, y + 4, 6, 1);

  /* SHOULDER PADS THAT ACTUALLY FLARE. They used to be 8 wide over a 6 wide
   * jersey — one pixel of shoulder, which is a person standing up straight. The
   * pads now break the sprite box by a pixel each side and the jersey tucks two
   * in, so the torso is a wedge. That taper is the Tecmo silhouette; everything
   * else is decoration on top of it. */
  ctx.fillStyle = body;
  ctx.fillRect(x - 1, y + 5, 10, 2); // pads, proud of the hips
  ctx.fillRect(x + 1, y + 7, 6, 2); // jersey, tapering in
  // The belt in the club's second colour.
  ctx.fillStyle = trim;
  ctx.fillRect(x + 1, y + 9, 6, 1);

  // Pants, white the way almost every away kit is.
  ctx.fillStyle = o.out ? PX.dim : PX.pants;
  ctx.fillRect(x + 1, y + 10, 6, 2);
  // Socks in the trim colour, which is both true of the kit and the only way
  // the stride reads at all: white legs under white pants are invisible.
  ctx.fillStyle = trim;
  ctx.fillRect(x + 1, y + 12, 2, o.stride ? 3 : 2);
  ctx.fillRect(x + 5, y + 12, 2, o.stride ? 2 : 3);

  // The ball, tucked under the arm on the side he is facing.
  if (o.ball) {
    ctx.fillStyle = "#7A4A22";
    ctx.fillRect(facing === 1 ? x + 7 : x - 1, y + 7, 2, 3);
    ctx.fillStyle = PX.chalk;
    ctx.fillRect(facing === 1 ? x + 7 : x - 1, y + 8, 2, 1);
  }

  if (o.out) {
    // The elimination X, stamped over the whole sprite.
    ctx.fillStyle = PX.out;
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(x + i, y + 3 + i, 1, 1);
      ctx.fillRect(x + 7 - i, y + 3 + i, 1, 1);
    }
  }
}
