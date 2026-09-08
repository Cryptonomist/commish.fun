"use client";

/* THE CARTRIDGE BOOT.
 *
 * A visitor lands on attract mode: a 12fps loop that plays the entire product
 * in twelve seconds without a word of explanation. Twenty-four players drop
 * onto a field and the pot fills. A week resolves and thirteen of them get
 * crossed out. One walks to the centre and the money lands on it.
 *
 * That is Survivor, and nobody had to read a paragraph to learn it.
 *
 * ONLY THE FIELD AND THE SPRITES ARE CANVAS. Every word, every button, every
 * tile is real DOM sitting on top. The text stays selectable, the buttons stay
 * focusable, a screen reader gets a real document, and the browser hints the
 * type properly. The visible cost is that DOM text is anti-aliased while the
 * sprites are not, which is a trade worth making: the alternative is drawing
 * type into the canvas and losing accessibility, and this product cannot pay
 * that price for a visual effect.
 *
 * IT IS NEVER A TOLL BOOTH. PRESS START is a real button, focusable and
 * clickable from the first frame. The animation is decoration over an
 * interactive document, it runs once, and any click or key ends it. If it ever
 * blocks somebody from getting on with it, it is worse than no animation.
 *
 * The whole asset pipeline is fillRect calls from small arrays. No library, no
 * WebGL, no images, no network.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { TEAMS } from "@/lib/nfl";
import { drawCoin, drawField, drawPlayer, PX } from "@/lib/pixel";
import { play, setSfxEnabled, sfxEnabled } from "@/lib/sfx";

/* Logical resolution. Everything is drawn on integer coordinates at this size
 * and the canvas is then scaled up by CSS with smoothing off, which is what
 * makes the pixels square and hard rather than blurry. */
const W = 256;
const H = 144;

const FPS = 12;
const SCENE_FRAMES = 48; // four seconds each, twelve second loop

/** Twenty-four clubs, taken in a fixed order so the loop is identical on every
 *  visit rather than reshuffling and looking like a bug. Both colours travel:
 *  the lead paints the jersey and helmet, the trim paints the belt stripe, which
 *  is what separates two clubs that both wear blue. */
const ROSTER = TEAMS.slice(0, 24).map((t) => ({ lead: t.lead, trim: t.trim }));

type Player = {
  x: number;
  /** Where this player stands when nothing is moving them. The hero walks away
   *  from it in the payout scene and has to be able to get back, or the second
   *  time round the loop he is already at the centre spot. */
  homeX: number;
  y: number;
  target: number;
  lead: string;
  trim: string;
  out: boolean;
};

/** An 8x3 grid of players centred on the field. */
function layout(): Player[] {
  const cols = 8;
  const gapX = 26;
  const gapY = 34; // a 15-tall sprite needs more room than an 8-tall helmet did
  const startX = Math.round((W - (cols - 1) * gapX) / 2) - 4;
  const startY = 22;
  return ROSTER.map(({ lead, trim }, i) => ({
    lead,
    trim,
    x: startX + (i % cols) * gapX,
    homeX: startX + (i % cols) * gapX,
    target: startY + Math.floor(i / cols) * gapY,
    y: -14 - (i % cols) * 4,
    out: false,
  }));
}

export default function AttractCabinet({
  children,
}: {
  /* The demo itself. Rendered only once somebody presses start, so the
     landing page does not pay for it until it is wanted. */
  children: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [pot, setPot] = useState(0);
  const [alive, setAlive] = useState(24);

  /* The rail counters are set from inside the draw loop, which runs twelve
   * times a second. Setting state unconditionally there would re-render the
   * whole subtree twelve times a second to write the same two numbers. These
   * only call setState when the value actually changed, which in practice
   * means a handful of renders across the entire twelve second loop. */
  const potRef = useRef(0);
  const aliveRef = useRef(24);
  const showPot = useCallback((v: number) => {
    if (potRef.current === v) return;
    potRef.current = v;
    setPot(v);
  }, []);
  const showAlive = useCallback((v: number) => {
    if (aliveRef.current === v) return;
    aliveRef.current = v;
    setAlive(v);
  }, []);

  /* Read once, after mount. Reading it during render would give the server and
     the client different markup. */
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(
      typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  /* Read after mount, never during render: localStorage does not exist on the
   * server and branching on it while rendering would hydrate to different
   * markup than the server sent. */
  const [sfx, setSfx] = useState(false);
  useEffect(() => setSfx(sfxEnabled()), []);

  const toggleSfx = useCallback(() => {
    const next = !sfxEnabled();
    setSfxEnabled(next);
    setSfx(next);
    // Play the confirmation through the thing that was just switched on, so
    // pressing it tells you what you turned on rather than only that you did.
    if (next) play("move");
  }, []);

  const start = useCallback(() => {
    play("confirm");
    setStarted(true);
  }, []);

  /* A key anywhere starts it, but ONLY while the cabinet is actually on
     screen. Without the observer this would swallow keystrokes meant for the
     rest of the page, which is a real cost for a decorative feature. */
  const shellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (started) return;
    const el = shellRef.current;
    if (!el) return;

    let visible = false;
    const onKey = (e: KeyboardEvent) => {
      if (!visible) return;
      // Leave modifier combinations alone: they belong to the browser.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setStarted(true);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) window.addEventListener("keydown", onKey);
        else window.removeEventListener("keydown", onKey);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [started]);

  useEffect(() => {
    if (started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const players = layout();
    let frame = 0;
    let raf = 0;
    let last = 0;

    /* The field, repainted every frame beneath the sprites. This is
       FieldMarkings' logic moved to where it belongs: it is the field the
       players stand on, not a texture behind some text. */
    const field = () => drawField(ctx, W, H);

    /* One sprite, shared with the playable drive at /arcade. It used to live
       here, and the moment a second canvas existed that would have meant a
       second copy of a footballer that slowly stopped matching this one. */
    const player = (p: Player, stride: boolean, squash: boolean) =>
      drawPlayer(ctx, p.x, p.y, p, { stride, squash, out: p.out });

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 1000 / FPS) return;
      last = t;

      const scene = Math.floor(frame / SCENE_FRAMES) % 3;
      const f = frame % SCENE_FRAMES;

      field();

      if (scene === 0) {
        // THE POOL FILLS. One player lands every other frame, legs pumping on
        // the way down and a one-pixel squash on the frame he touches turf.
        players.forEach((h, i) => {
          h.out = false;
          h.x = h.homeX;
          const due = i * 2;
          const falling = h.y < h.target;
          if (f >= due) h.y = Math.min(h.target, h.y + 6);
          player(h, falling && f % 2 === 0, h.y === h.target && falling);
        });
        showPot(Math.min(2400, Math.round((f / 40) * 2400)));
        showAlive(24);
      } else if (scene === 1) {
        // THE WEEK RESOLVES. Thirteen go out, one every other frame. The ones
        // still alive shift their weight; the ones out are frozen mid-stride,
        // which is the difference between a bench and a graveyard.
        const gone = Math.max(0, Math.min(13, Math.floor((f - 8) / 2)));
        players.forEach((h, i) => {
          h.y = h.target;
          h.x = h.homeX;
          h.out = i % 2 === 0 && i / 2 < gone;
          player(h, !h.out && f % 8 < 4, false);
        });
        showAlive(24 - gone);
        showPot(2400);
      } else {
        // THE PAYOUT. One player walks to the middle and the money lands.
        const hero = players[1];
        players.forEach((h, i) => {
          if (i === 1) return;
          h.y = h.target;
          h.x = h.homeX;
          h.out = true;
          if (f <= 4) player(h, false, false); // the rest clear off
        });
        hero.out = false;
        hero.x = Math.round(
          hero.x + ((W / 2 - 4 - hero.x) * Math.min(1, f / 16)),
        );
        hero.y = Math.round(
          hero.target + ((H / 2 - 7 - hero.target) * Math.min(1, f / 16)),
        );
        /* Centred on the winner, who stands 8 wide at W/2 - 4, so a 17-wide
         * coin sits at W/2 - 8. It hovers three pixels clear of his helmet: he
         * walks UNDER it and takes it, rather than standing inside it. */
        const COIN_X = W / 2 - 8;
        const REST_Y = 46;
        const GRAB = 16; // the frame he arrives, which is when the walk ends

        // The winner's mark, painted under his feet before he is, so he stands
        // on it rather than in front of it.
        ctx.fillStyle = PX.action;
        ctx.fillRect(Math.round(hero.x) - 1, Math.round(hero.y) + 15, 10, 1);
        /* THE COIN IS PAINTED BEFORE HIM WHILE IT WAITS, because it rests at
         * y 52-67 and his helmet starts at 65 — drawn after, it would sit on
         * top of his head, which is the exact fault the last two versions of
         * this payout shipped with. He walks in FRONT of it. */
        if (f < GRAB) {
          // Waiting to be picked up: a slow bob, one pixel either way.
          const bob = Math.round(Math.sin(f * 0.45) * 1.5);
          drawCoin(ctx, COIN_X, REST_Y + bob);
        }

        // Still walking? Then keep the legs going. Arrived? Stand still.
        player(hero, f < GRAB && f % 2 === 0, false);

        /* THE MONEY ARRIVES ABOVE HIM, NOT ON HIM.
         *
         * This used to be a 36x12 gold slab that rose to y=62 and stopped. The
         * winner stands at y=65 and is 15 tall, and the slab was painted after
         * him, so the last thing the loop showed — the payoff the whole twelve
         * seconds builds to — was a yellow rectangle with the winner's legs
         * sticking out from under it. The comment above said "the money lands
         * on it" and that is exactly what it did.
         *
         * It also did not read as money at any size. 36 of 256 pixels is a
         * seventh of the field, and a gold bar with a dark stripe through it is
         * a loading indicator.
         *
         * So: a stack of notes, half the width, settling in the air above his
         * helmet the way an arcade pickup does, with a short overshoot so it
         * lands rather than glides. Three offset bills read as a stack where
         * one rectangle reads as a block. */
        /* HE COLLECTS IT, the way a game character collects a coin.
         *
         * Four goes at this now, and the first three were all the same mistake:
         * the money ARRIVED. A slab rose and landed on him; then a slab rose and
         * landed beside him; then six coins arced in and stacked into a heap.
         * All three are a graphic appearing near a man, and none of them is
         * something happening TO him.
         *
         * A coin sits on the spot, bobbing, from the first frame — so it is
         * clear what he is walking toward before he gets there. He reaches it at
         * the same frame he stops walking. It flashes, pops upward, and is gone.
         * That is the oldest verb in this medium and it needs no explaining.
         *
         * Drawn BEFORE the player while it waits, so he arrives in front of it,
         * and AFTER him once collected, so the pop rises over his head rather
         * than behind it. */
        if (f >= GRAB && f < GRAB + 9) {
          const k = f - GRAB;
          /* Up and away, decelerating, and fading over the last few frames. The
           * first two frames are white: a collected coin flashes before it
           * leaves, which is what separates "taken" from "drifted off". */
          const rise = Math.round(k * 3.2 - k * k * 0.12);
          ctx.globalAlpha = k > 5 ? Math.max(0, 1 - (k - 5) / 4) : 1;
          drawCoin(ctx, COIN_X, REST_Y - rise, k < 2);
          ctx.globalAlpha = 1;
        }
        showAlive(1);
        showPot(2400);
      }

      frame++;
    };

    /* PAINT ONE COMPLETE FRAME SYNCHRONOUSLY, BEFORE ANY ANIMATION.
     *
     * The loop below runs on requestAnimationFrame, and rAF does not fire at
     * all in a background tab. Without this the canvas would sit transparent
     * until the first frame arrived, so anybody who opened the page in a
     * background tab, or on a device throttling animation, would find a black
     * hole where the field should be, and it would stay there until they
     * looked at it.
     *
     * Verified rather than assumed: in a hidden pane rAF fired zero times in
     * two seconds and the canvas read back as 36,864 fully transparent pixels.
     *
     * So the resting state is painted first and the animation is decoration
     * over an already-correct frame. Same principle as the DOM being complete
     * before any class is added to it. */
    field();
    players.forEach((h) => {
      h.y = h.target;
      player(h, false, false);
    });

    if (still) {
      // Reduced motion: the painted frame above is the whole thing. A full
      // field carries the same information without anything moving.
      showPot(2400);
      showAlive(24);
      return;
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    /* Both setters are useCallback with empty deps, so they are stable and
     * listing them cannot restart the loop. Listed anyway rather than silenced,
     * because a disabled lint rule here would also hide a genuine missing
     * dependency the day somebody adds one. */
  }, [started, still, showPot, showAlive]);

  return (
    <div
      ref={shellRef}
      className="game-surface panel-primary scanlines relative overflow-hidden"
    >
      {/* TOP RAIL. Fixed height, never moves between states. */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-chalk px-3 py-2 font-matrix text-[10px] leading-4">
        <span className="text-chalk">COMMISH BOWL</span>
        <span className="text-cream-dim">
          ALIVE <span className="text-alive">{alive}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-gold tabular-nums">
            POT ${pot.toLocaleString("en-US")}
          </span>
          {/* Sound is off until this is pressed, and the press is what builds
              the AudioContext. Nothing is constructed for a visitor who never
              touches it. */}
          <button
            type="button"
            onClick={toggleSfx}
            aria-pressed={sfx}
            aria-label={sfx ? "Turn sound off" : "Turn sound on"}
            className={`flex h-5 w-5 items-center justify-center border border-rule text-[10px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
              sfx ? "bg-action text-panel" : "text-cream-dim hover:text-chalk"
            }`}
          >
            &#9834;
          </button>
        </span>
      </div>

      {/* THE SCREEN */}
      <div className="relative">
        {started ? (
          <div className="p-3 sm:p-5">{children}</div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              aria-hidden="true"
              className="block w-full"
              style={{ imageRendering: "pixelated", aspectRatio: "16 / 9" }}
            />

            {/* The prompt IS the button, filling the lower third, so the mouse
                path and the keyboard path are the same control rather than two
                things that can disagree. */}
            <button
              type="button"
              onClick={start}
              aria-label="Start the demo. Play one week of Survivor."
              className="absolute inset-x-0 bottom-0 top-1/2 flex flex-col items-center justify-center gap-2 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-chalk"
            >
              <span className="font-matrix text-[16px] leading-6 text-chalk motion-safe:animate-pulse">
                &#9654; PRESS START
              </span>
              <span className="font-matrix text-[10px] leading-4 text-cream-dim">
                PLAY ONE WEEK. NO WALLET.
              </span>
            </button>
          </>
        )}
      </div>

      {/* BOTTOM RAIL. The register break: this is where the site stops being a
          cartridge and starts being a product, and the type change is what
          says so. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-2 border-chalk px-3 py-2">
        <span className="font-matrix text-[10px] leading-4 text-cream-dim">
          DEMO &middot; INVENTED RESULTS
        </span>
        <span className="text-xs text-cream-dim">
          {started
            ? "Nothing here touches a wallet or the chain."
            : "Twenty-four play. Thirteen go out. One claims it."}
        </span>
      </div>
    </div>
  );
}
