"use client";

/* A FIELD GOAL, ON THE HERO'S OWN GOALPOSTS.
 *
 * The hero already draws a regulation field with real uprights on both end
 * lines. This kicks at the right-hand pair — not at a picture of them, at the
 * same geometry FieldMarkings uses, so if that ever moves this follows.
 *
 * TOP-DOWN, BECAUSE THE FIELD IS. The instinct is a side-on kick with the ball
 * arcing over a crossbar, and it would be wrong here: every other mark on this
 * page is a plan view, so a suddenly-vertical trajectory reads as a different
 * drawing pasted on top. From above, a field goal is a ball travelling away
 * from you that has to still be between two posts when it gets there. That is
 * the game, and it is a better one than it sounds, because the whole difficulty
 * is holding a line against a crosswind.
 *
 * THREE RULES IT DOES NOT GET TO BREAK, all of them inherited from the page
 * rather than invented here:
 *
 *   It must not make the hero taller. The field was fitted to clear the fold on
 *   a 1366x768 laptop with 43px to spare; a toy that pushes START A POOL down
 *   the page costs more than it earns. So it is an overlay with no layout of
 *   its own, and its one control sits in dead space.
 *
 *   It must be operable from the keyboard. It lives inside the hero, which is
 *   the region that has to work for everybody, and a mouse-only easter egg in
 *   there is a hole in the page rather than a bit of fun.
 *
 *   It must never make a sound on its own. Same rule as the arcade: `play` is
 *   a no-op until somebody has turned sound on, and nothing here turns it on.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BAR_X,
  GAP_HALF,
  kickReadout,
  launch,
  meterReading,
  type Shot,
  stepShot,
  teeFor,
  windDrift,
  windFrom,
  windMph,
  yardsFor,
} from "@/lib/kick";
import { PX } from "@/lib/pixel";
import { play } from "@/lib/sfx";

type Phase = "idle" | "power" | "aim" | "flight" | "good" | "wide" | "short";

/* The first attempt's wind, from the seed the game has always started on, so
 * the sequence of winds a run deals is the same one it dealt before the gauge
 * existed. Drawn once, at module load. */
const FIRST_WIND = windFrom(1);

/* The yardage meter's two colours, on grass. `out` alone is 2.24:1 on turf and
 * the project's own rule is fill only; its lit variant is the one legal for
 * text. `alive` is 4.61:1 on turf and needs no substitute. Both sit inside the
 * `field-type` outline, which puts a panel edge behind every glyph. */
const REACHES = "var(--color-alive)";
const SHORT = "var(--color-out-lit)";

export function HeroKick() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [made, setMade] = useState(0);
  const [streak, setStreak] = useState(0);

  /* THE SIMULATION LIVES IN REFS, NOT STATE. It advances every frame and React
   * has no business re-rendering for a ball position; the only things that
   * become state are the ones the DOM actually shows. */
  const phaseRef = useRef<Phase>("idle");
  /** The raw sweep, 0..2 and wrapping. Never read directly — meterReading()
   *  folds it into what the bar is actually showing. */
  const meterRef = useRef(0);
  const powerRef = useRef(0.5);
  const aimRef = useRef(0);
  const shotRef = useRef<Shot | null>(null);
  const madeRef = useRef(0);
  const holdRef = useRef(0); // frames to hold a result on screen

  /* THE WIND IS DRAWN BEFORE THE KICK, NOT DURING IT.
   *
   * It used to be drawn at the instant the aim was locked, which meant it did
   * not exist while you were aiming — so a gauge could not have helped, and the
   * whole difficulty of the game was a number nobody could see. Now each
   * attempt's wind is drawn as soon as the previous kick lands and shown the
   * whole way through, which is what turns aiming into a decision.
   *
   * Still deterministic, from a seed that advances per kick, so a run can be
   * described and repeated when somebody says a particular kick felt wrong. The
   * ref is what the simulation reads; the state is what the gauge renders. */
  const seedRef = useRef(FIRST_WIND.next);
  const windRef = useRef(FIRST_WIND.wind);
  const [wind, setWind] = useState(FIRST_WIND.wind);

  const rollWind = useCallback(() => {
    const { wind: w, next } = windFrom(seedRef.current);
    seedRef.current = next;
    windRef.current = w;
    setWind(w);
  }, []);

  /** The live yardage readout. Written straight to the DOM from the draw loop,
   *  because it changes every frame and React has no business re-rendering
   *  thirty times a second for a number. */
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const teeX = useCallback(() => teeFor(madeRef.current), []);

  /** One press. The whole game is this function three times. */
  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === "idle" || p === "good" || p === "wide" || p === "short") {
      meterRef.current = 0;
      goPhase("power");
      play("move");
      return;
    }
    if (p === "power") {
      powerRef.current = meterReading(meterRef.current);
      meterRef.current = 0;
      goPhase("aim");
      play("move");
      return;
    }
    if (p === "aim") {
      /* The aim meter runs -1..1 across the middle of its sweep, so stopping
       * it dead centre is a straight kick and either edge is a hook. */
      aimRef.current = meterReading(meterRef.current) * 2 - 1;
      // The wind the gauge has been showing, not a fresh one.
      shotRef.current = launch(
        teeX(),
        powerRef.current,
        aimRef.current,
        windRef.current,
      );
      goPhase("flight");
      play("snap");
    }
  }, [goPhase, teeX]);

  /* ------------------------------------------------------------- the loop */

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* THREE SCREEN PIXELS PER DRAWN PIXEL. Sizing the backing store to the
     * element and drawing 1:1 would give a smooth ball on a field made of hard
     * squares, which is the one thing this whole visual system is against. */
    const SCALE = 3;
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width / SCALE));
      h = Math.max(1, Math.round(r.height / SCALE));
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
    };
    resize();

    const px = (fx: number) => Math.round(fx * w);
    const py = (fy: number) => Math.round(fy * h);

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      const p = phaseRef.current;

      // The spot, always, so the game reads as available rather than hidden.
      const tx = px(teeX());
      const ty = py(0.5);
      ctx.fillStyle = PX.chalk;
      ctx.fillRect(tx - 1, ty - 3, 1, 7);

      /* The gap being aimed at, lit only while aiming. Showing it always would
       * be a second pair of uprights next to the real ones. */
      if (p === "aim" || p === "flight") {
        ctx.fillStyle = "rgba(255,199,44,0.5)";
        ctx.fillRect(px(BAR_X) - 1, py(0.5 - GAP_HALF), 2, 1);
        ctx.fillRect(px(BAR_X) - 1, py(0.5 + GAP_HALF), 2, 1);
      }

      // The ball, in flight or sitting on the spot.
      const s = shotRef.current;
      const bx = p === "flight" && s ? px(s.x) : tx + 1;
      const by = p === "flight" && s ? py(s.y) : ty;
      ctx.fillStyle = PX.panel;
      ctx.fillRect(bx - 1, by - 2, 4, 5);
      ctx.fillStyle = "#7A4A22";
      ctx.fillRect(bx, by - 1, 2, 3);
      ctx.fillStyle = PX.chalk;
      ctx.fillRect(bx, by, 2, 1);

      /* THE METER, drawn beside the ball rather than in a corner, because the
       * ball is where the eye already is and a meter somewhere else means
       * looking away at the moment that matters. */
      if (p === "power" || p === "aim") {
        const mw = Math.round(w * 0.14);
        const mx = tx - Math.round(mw / 2);
        const my = ty + 8;
        ctx.fillStyle = PX.panel;
        ctx.fillRect(mx - 1, my - 1, mw + 2, 5);
        ctx.fillStyle = p === "power" ? PX.action : PX.gold;
        const fill = Math.min(mw, Math.round(mw * meterReading(meterRef.current)));
        ctx.fillRect(mx, my, Math.max(1, fill), 3);
        if (p === "aim") {
          // The centre notch: hit it and the kick goes straight.
          ctx.fillStyle = PX.chalk;
          ctx.fillRect(mx + Math.round(mw / 2), my - 2, 1, 7);
        }
      }

      /* THE YARDAGE METER, live while power sweeps. The number is how far this
       * kick would carry if you pressed now, on the same scale as the spot's
       * own distance, so the two can be compared by eye. Written straight to
       * the node rather than through React: it changes every frame. */
      const readout = readoutRef.current;
      if (readout && p === "power") {
        const r = kickReadout(teeX(), meterReading(meterRef.current));
        readout.textContent = `${r.yards} YD`;
        readout.style.color = r.reaches ? REACHES : SHORT;
      }
      ctx.imageSmoothingEnabled = false;
    };

    /* Paint a correct resting frame before asking for an animation frame at
     * all. rAF does not run in a background tab and there are preview surfaces
     * that never run it, and a blank overlay reads as a failure to load. */
    render();

    let raf = 0;
    let last = 0;
    const STEP = 1000 / 30;
    let carry = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!last) last = t;
      carry += t - last;
      last = t;
      if (carry > STEP * 5) carry = STEP * 5;

      let dirty = false;
      while (carry >= STEP) {
        carry -= STEP;
        const p = phaseRef.current;

        if (p === "power" || p === "aim") {
          /* A triangle wave rather than a sawtooth: it sweeps up and back, so
           * the moment to press arrives twice a cycle instead of once.
           *
           * REDUCED MOTION SLOWS THE SWEEP RATHER THAN THE FRAME RATE. The bar
           * is the only thing on this page that moves without being touched,
           * and at full speed it is a fast oscillation — exactly what that
           * setting is asking not to be shown. A lower frame rate would have
           * made it choppy instead of calm, which is not the same request. It
           * also makes the game easier, which is the right way round. */
          const speed = (p === "power" ? 0.035 : 0.055) * (reduced ? 0.4 : 1);
          meterRef.current += speed;
          if (meterRef.current > 2) meterRef.current -= 2;
          dirty = true;
        }

        if (p === "flight") {
          const s = shotRef.current;
          if (s) {
            /* ONE SIMULATION, AND IT IS THE TESTED ONE. This used to carry its
             * own copy of the flight maths, which is how the two would have
             * drifted apart the first time either was touched — and the copy
             * the tests could see would have been the one that stayed right. */
            const out = stepShot(s);
            dirty = true;
            if (out !== "flying") {
              const good = out === "good";
              madeRef.current = good ? madeRef.current + 1 : 0;
              setMade(madeRef.current);
              setStreak((n) => (good ? n + 1 : 0));
              holdRef.current = 30;
              goPhase(out);
              play(good ? "win" : "out");
              /* The next kick's wind, drawn the moment this one lands, so the
               * gauge always shows the wind you are about to kick into. Drawn
               * here rather than when the result clears, because pressing
               * again during the result starts the next attempt at once, and
               * it must not reuse the wind that decided this one. */
              rollWind();
            }
          }
        }

        if (holdRef.current > 0) {
          holdRef.current -= 1;
          if (holdRef.current === 0) {
            shotRef.current = null;
            goPhase("idle");
            dirty = true;
          }
        }
      }
      if (dirty) render();
    };

    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      render();
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [goPhase, teeX, rollWind]);

  /* -------------------------------------------------------------- controls */

  const label =
    phase === "power"
      ? "SET POWER"
      : phase === "aim"
        ? "SET AIM"
        : phase === "flight"
          ? "…"
          : phase === "good"
            ? "GOOD!"
            : phase === "wide"
              ? "NO GOOD"
              : phase === "short"
                ? "SHORT"
                : "KICK";

  const yards = yardsFor(teeX());

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-[1] hidden lg:block"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="h-full w-full [image-rendering:pixelated]"
      />

      {/* WHAT THE BAR IS, SAID NEXT TO THE BAR.
          The button already changes to SET POWER and SET AIM, but it lives in
          the far corner of the field and the meter is out by the ball, so the
          two never got read as one thing — the bar was an unlabelled rectangle
          filling and emptying.

          Real DOM text rather than glyphs drawn into the canvas, which is the
          same split the attract loop and the game use: the field and the
          sprites are pixels, every word is a node. Positioned from the same
          fraction the tee is drawn at, so it tracks the ball as the spot walks
          back rather than sitting at a remembered offset.

          aria-hidden because the button carries an aria-live label saying the
          same words; announcing both would read the phase change twice. */}
      {phase === "power" || phase === "aim" ? (
        <span
          aria-hidden="true"
          /* `field-type` rather than a dim colour, because this sits on grass.
             The hero's own rule: chalk and cream are legal on turf at any size
             and cream-dim is not, so a 9px label in cream-dim was a contrast
             failure by this project's own measurement. The class carries the
             panel-coloured outline that holds small type against a mow band or
             a yard number passing behind it.

             46px clears the meter. The bar is drawn at ty+7 in canvas pixels
             and the canvas runs at three screen pixels to one, so the track
             occupies roughly centre+21 to centre+36; the first attempt put the
             label at centre+34 and it landed on top of the bar. */
          className="pointer-events-none absolute flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap font-matrix text-[9px] leading-3 field-type"
          style={{ left: `${teeX() * 100}%`, top: "calc(50% + 46px)" }}
        >
          {phase === "power" ? (
            <>
              POWER
              {/* Filled by the draw loop, not by React: it changes every frame.
                  Deliberately childless so a React render can never overwrite
                  what the loop last wrote. */}
              <span ref={readoutRef} />
            </>
          ) : (
            <>
              AIM
              {/* The wind again, beside the bar, because aiming is the moment
                  it matters and the gauge in the corner is out of the eyeline. */}
              <WindText wind={wind} />
            </>
          )}
        </span>
      ) : null}

      {/* The one interactive thing, and it is a real button: focusable, in the
          tab order, operable with Enter or Space like any other.

          TOP RIGHT, AND THAT WAS MEASURED RATHER THAN CHOSEN. Bottom right is
          where a kick control wants to go, next to the posts, and it is where
          this sat until the boxes were read back: HOW A WEEK WORKS occupies
          y 341-383 across x 876-1088 of this field, and the button landed on
          top of it. The clear ground is the band above the headline — x 320 to
          1088, y 0 to 96, empty because the badge is short and the h1 starts
          below it. It is also the region least likely to be squeezed as the
          hero reflows, since everything else here grows downward. */}
      {/* THE HUD. Distance to the posts, the wind you are about to kick into,
          and the button.

          `field-type` rather than the `text-cream-dim` this used to be, because
          it sits on the grass and this component's own note, on the label
          below the ball, records that cream-dim fails contrast on turf by the
          project's measurement. The distance had been quietly breaking that
          rule since it shipped. */}
      <div className="pointer-events-auto absolute right-0 top-0 flex items-center gap-3">
        <span className="font-matrix text-[10px] leading-4 field-type">
          {yards} YD
          {made > 0 ? <span className="text-gold"> · {streak}</span> : null}
        </span>
        <WindGauge wind={wind} />
        <button
          type="button"
          onClick={press}
          className="btn btn-compact btn-secondary"
          aria-live="polite"
        >
          {label}
        </button>
      </div>
    </div>
  );
}

/* THE WIND ARROW, drawn as five-by-five pixels rather than typed as a glyph.
 *
 * The pixel faces this page uses carry a small glyph set and no arrows, so an
 * arrow character would fall back to a system font and sit on the hero looking
 * pasted in. Drawn pointing down and flipped for up. It points the way the
 * wind carries the ball, which `windDrift` is tested to match against a real
 * flight. `currentColor`, so it takes the chalk the text around it is set in. */
const ARROW_CELLS: [number, number][] = [
  [2, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [4, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [2, 4],
];

function WindArrow({ down }: { down: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      className="shrink-0"
      style={down ? undefined : { transform: "scaleY(-1)" }}
    >
      {ARROW_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

/** The wind as the eye reads it: an arrow and a number, or CALM. */
function WindText({ wind }: { wind: number }) {
  const drift = windDrift(wind);
  if (drift === "calm") return <span>CALM</span>;
  return (
    <span className="flex items-center gap-1">
      <WindArrow down={drift === "down"} />
      {windMph(wind)} MPH
    </span>
  );
}

/* THE GAUGE, in the corner next to the distance.
 *
 * Visible before the kick as well as during it, because the wind for the next
 * attempt is drawn the moment the last one lands. That is the whole reason it
 * can help: you read the flag, then you decide how to aim.
 *
 * The visual is hidden from assistive technology and a sentence stands in for
 * it, because "down arrow twelve M P H" read aloud is not information. */
function WindGauge({ wind }: { wind: number }) {
  const drift = windDrift(wind);
  const mph = windMph(wind);
  const spoken =
    drift === "calm"
      ? "No wind."
      : `Wind ${mph} miles an hour, carrying the ball toward the ${
          drift === "down" ? "bottom" : "top"
        } of the field.`;
  return (
    <span className="flex items-center gap-1.5 font-matrix text-[10px] leading-4 field-type">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {drift === "calm" ? null : <span>WIND</span>}
        <WindText wind={wind} />
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
