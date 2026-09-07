"use client";

/* THE CARTRIDGE BOOT.
 *
 * A visitor lands on attract mode: a 12fps loop that plays the entire product
 * in twelve seconds without a word of explanation. Twenty-four helmets drop
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
import { play, setSfxEnabled, sfxEnabled } from "@/lib/sfx";

/* Logical resolution. Everything is drawn on integer coordinates at this size
 * and the canvas is then scaled up by CSS with smoothing off, which is what
 * makes the pixels square and hard rather than blurry. */
const W = 256;
const H = 144;

const FPS = 12;
const SCENE_FRAMES = 48; // four seconds each, twelve second loop

const CHALK = "#FBFDF8";
const PANEL = "#0B1710";
const TURF = "#24492E";
const TURF_2 = "#1B3724";
const GOLD = "#E9C258";
const ACTION = "#FF6A2B";
const OUT = "#EC565B";
const DIM = "#A9B8AC";

/** Twenty-four clubs, taken in a fixed order so the loop is identical on every
 *  visit rather than reshuffling and looking like a bug. */
const HELMET_COLOURS = TEAMS.slice(0, 24).map((t) => t.lead);

type Helmet = { x: number; y: number; target: number; colour: string; out: boolean };

/** An 8x3 grid of helmets centred on the field. */
function layout(): Helmet[] {
  const cols = 8;
  const gapX = 26;
  const gapY = 30;
  const startX = Math.round((W - (cols - 1) * gapX) / 2) - 3;
  const startY = 34;
  return HELMET_COLOURS.map((colour, i) => ({
    colour,
    x: startX + (i % cols) * gapX,
    target: startY + Math.floor(i / cols) * gapY,
    y: -10 - (i % cols) * 4,
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

    const helmets = layout();
    let frame = 0;
    let raf = 0;
    let last = 0;

    /* The field, repainted every frame beneath the sprites. This is
       FieldMarkings' logic moved to where it belongs: it is the field the
       helmets stand on, not a texture behind some text. */
    const field = () => {
      ctx.fillStyle = TURF;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i += 2) {
        ctx.fillStyle = TURF_2;
        ctx.fillRect(Math.round((i * W) / 8), 0, Math.round(W / 8), H);
      }
      // Sidelines, 4px in.
      ctx.fillStyle = "rgba(251,253,248,0.35)";
      ctx.fillRect(0, 4, W, 1);
      ctx.fillRect(0, H - 5, W, 1);
      // Five-yard lines.
      ctx.fillStyle = "rgba(251,253,248,0.22)";
      for (let x = 24; x < W; x += 24) ctx.fillRect(x, 4, 1, H - 9);
      // Hash marks.
      ctx.fillStyle = "rgba(251,253,248,0.18)";
      for (let x = 12; x < W; x += 12) {
        ctx.fillRect(x, 40, 2, 1);
        ctx.fillRect(x, 104, 2, 1);
      }
    };

    /** Two rects. A dome and a facemask, and that is a helmet. */
    const helmet = (h: Helmet, squash: boolean) => {
      const y = Math.round(h.y) + (squash ? 1 : 0);
      const hh = squash ? 5 : 6;
      ctx.fillStyle = h.out ? DIM : h.colour;
      ctx.fillRect(Math.round(h.x), y, 6, hh);
      ctx.fillStyle = h.out ? DIM : CHALK;
      ctx.fillRect(Math.round(h.x), y + hh, 6, 2);
      if (h.out) {
        ctx.fillStyle = OUT;
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(Math.round(h.x) + i, y + i, 1, 1);
          ctx.fillRect(Math.round(h.x) + 5 - i, y + i, 1, 1);
        }
      }
    };

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 1000 / FPS) return;
      last = t;

      const scene = Math.floor(frame / SCENE_FRAMES) % 3;
      const f = frame % SCENE_FRAMES;

      field();

      if (scene === 0) {
        // THE POOL FILLS. One helmet lands every other frame.
        helmets.forEach((h, i) => {
          h.out = false;
          const due = i * 2;
          if (f >= due) h.y = Math.min(h.target, h.y + 6);
          helmet(h, f === due + Math.ceil((h.target + 10) / 6));
        });
        showPot(Math.min(2400, Math.round((f / 40) * 2400)));
        showAlive(24);
      } else if (scene === 1) {
        // THE WEEK RESOLVES. Thirteen go out, one every other frame.
        const gone = Math.max(0, Math.min(13, Math.floor((f - 8) / 2)));
        helmets.forEach((h, i) => {
          h.y = h.target;
          h.out = i % 2 === 0 && i / 2 < gone;
        });
        showAlive(24 - gone);
        showPot(2400);
      } else {
        // THE PAYOUT. One helmet walks to the middle and the money lands.
        const hero = helmets[1];
        helmets.forEach((h, i) => {
          h.y = h.target;
          h.out = i !== 1;
          if (i !== 1 && f > 4) return; // the rest clear off
          if (i === 1) return;
          helmet(h, false);
        });
        hero.out = false;
        hero.x = Math.round(
          hero.x + ((W / 2 - 3 - hero.x) * Math.min(1, f / 16)),
        );
        hero.y = Math.round(
          hero.target + ((H / 2 - 4 - hero.target) * Math.min(1, f / 16)),
        );
        ctx.fillStyle = ACTION;
        ctx.fillRect(Math.round(hero.x), Math.round(hero.y), 6, 6);
        ctx.fillStyle = CHALK;
        ctx.fillRect(Math.round(hero.x), Math.round(hero.y) + 6, 6, 2);

        if (f > 18) {
          const rise = Math.min(1, (f - 18) / 8);
          const by = Math.round(H - rise * (H / 2 + 10));
          ctx.fillStyle = GOLD;
          ctx.fillRect(W / 2 - 18, by, 36, 12);
          ctx.fillStyle = PANEL;
          ctx.fillRect(W / 2 - 15, by + 4, 30, 4);
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
    helmets.forEach((h) => {
      h.y = h.target;
      helmet(h, false);
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
    <div ref={shellRef} className="panel-primary scanlines relative overflow-hidden">
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
