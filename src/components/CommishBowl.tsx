"use client";

/* COMMISH BOWL — four downs to move the chains, eighty yards to the endzone.
 *
 * WHAT THIS IS NOT. It is not Tecmo Bowl and it is not an emulator. Tecmo Bowl
 * is Tecmo's copyrighted 1987 game; its ROM, its code and its art are theirs,
 * and the NFL and NFLPA licences that put real players in it are not ours to
 * borrow. Shipping that ROM, or a player for it, on a site that takes money is
 * not a design decision, it is a lawsuit. So this is an original game written
 * from nothing, in the visual idiom of that era: 256x144, hard pixels, eight
 * colours, sprites made of rectangles. The idiom belongs to nobody. The game
 * is ours.
 *
 * WHAT IT IS. You take the ball at your own 20. Four downs to gain ten yards
 * and the chains move; fail and you turn it over. Seven defenders pursue,
 * three blockers try to get in their way, and one spin move per play buys you
 * about a third of a second of extra speed. That is the whole game, and it is
 * enough, because the interesting part is the same thing that makes Survivor
 * interesting: a small number of chances and no way to buy more.
 *
 * WHY IT IS ON A PRODUCT THAT HOLDS MONEY. Because the landing page's argument
 * is "this is a football thing among friends", and a football thing among
 * friends should be fun to touch. It lives on its own route rather than the
 * home page, it autoplays nothing, it collects nothing, and the only thing it
 * writes anywhere is a longest run in this browser's localStorage.
 *
 * THIS FILE OWNS THE CLOCK, THE CANVAS AND THE KEYBOARD. The rules live in
 * lib/bowl.ts, with no React and no canvas in them, so a test can play a
 * hundred downs without a browser. That split was not tidiness: this was first
 * opened in a preview that runs no requestAnimationFrame at all, everything
 * sat still, and there was no way to tell a broken simulation from a paused
 * one. Rules you can only inspect by watching them are rules you cannot check.
 *
 * THE DIVISION OF LABOUR IS THE SAME AS THE ATTRACT LOOP. Canvas draws the
 * field and the sprites; every word on screen is real DOM. Downs, yardage and
 * results are text a screen reader can read and a person can select, and the
 * result of every play is announced through an aria-live region. A canvas game
 * cannot be made fully non-visual, which is exactly why nothing here is the
 * only route to anything: it is a toy, on a page of its own, that no part of
 * the product depends on.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  camera,
  DOWNS,
  GOAL,
  gainOf,
  kickoff,
  newWorld,
  nextDown,
  step,
  TICK_MS,
  toGo,
  VIEW_H,
  VIEW_W,
  WORLD,
  yardLine,
  type Input,
  type World,
} from "@/lib/bowl";
import { fanfare, startDrive, stopMusic } from "@/lib/chiptune";
import { TEAMS } from "@/lib/nfl";
import { drawField, drawPlayer, PX } from "@/lib/pixel";
import { play, setSfxEnabled, sfxEnabled } from "@/lib/sfx";

const BEST_KEY = "commish.bowl.best";

type Phase = "ready" | "live" | "tackled" | "first" | "touchdown" | "over";

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Straight-line distance between two lead colours in RGB. Not a perceptual
 *  metric, and it does not need to be: it only has to keep two oranges apart. */
function apart(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** A club far enough from `us` to read as the other team at sprite size.
 *  Walks from a random offset so the fixture varies, and falls back to the
 *  most distant club in the league if nothing clears the bar. */
function pickOpponent(us: number): number {
  /* 120, and the league was measured rather than eyeballed to pick it. Of the
     496 possible matchups, 149 — thirty per cent — fall under this bar, and
     six pairs share an identical lead colour outright: Atlanta/Houston,
     Atlanta/New York, Cincinnati/Denver, Green Bay/Pittsburgh,
     Green Bay/Washington, Houston/New York. Those games were unplayable.
     The tightest club for choice is Cincinnati and it still has 17 eligible
     opponents of 31, so the fallback below is a guard, not a code path. */
  const MIN = 120;
  const start = Math.floor(Math.random() * TEAMS.length);
  let best = -1;
  let bestGap = -1;
  for (let i = 0; i < TEAMS.length; i++) {
    const j = (start + i) % TEAMS.length;
    if (j === us) continue;
    const gap = apart(TEAMS[us].lead, TEAMS[j].lead);
    if (gap >= MIN) return j;
    if (gap > bestGap) {
      bestGap = gap;
      best = j;
    }
  }
  return best;
}

export function CommishBowl() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("ready");
  const [down, setDown] = useState(1);
  const [ball, setBall] = useState(20); // yard line, counted from your own end
  const [need, setNeed] = useState(10); // yards to a new set of downs
  const [gained, setGained] = useState(0);
  const [best, setBest] = useState(0);

  /* Kits are picked on the client. Picking during render would give the server
   * one pair of teams and the browser another, which React reports as a
   * hydration mismatch and, more to the point, makes the page flicker. */
  /* Read after mount, never during render: localStorage does not exist on the
   * server, and branching on it while rendering hydrates to different markup
   * than the server sent. */
  const [sfx, setSfx] = useState(false);
  useEffect(() => setSfx(sfxEnabled()), []);

  const toggleSfx = useCallback(() => {
    const next = !sfxEnabled();
    setSfxEnabled(next);
    setSfx(next);
    if (next) {
      // Confirm through the thing that was just switched on, so pressing it
      // tells you what you turned on rather than only that you did.
      play("first");
      // Mid-play, the music should come straight back rather than waiting for
      // the next snap.
      if (phaseRef.current === "live") startDrive();
    }
    // Turning it off is handled inside setSfxEnabled, which stops the loop.
  }, []);

  const [kits, setKits] = useState<{ us: number; them: number } | null>(null);
  useEffect(() => {
    const us = Math.floor(Math.random() * TEAMS.length);
    /* THE TWO SIDES HAVE TO BE TELLABLE APART, and "any club that is not this
     * club" does not achieve that: the league has four or five oranges and a
     * shelf of navies, so a random pair came up Cincinnati against Cleveland
     * often enough to matter. Twenty-two sprites in two shades of the same
     * colour is not a hard game, it is an unreadable one.
     *
     * So the opponent is drawn from the clubs whose lead colour is actually
     * far from ours, and the walk starts at a random offset so it is not
     * always the same fixture. The distance is a plain RGB one — good enough
     * to separate orange from navy, which is the whole job. */
    const them = pickOpponent(us);
    setKits({ us, them });
    try {
      setBest(Number(window.localStorage.getItem(BEST_KEY)) || 0);
    } catch {
      // A browser that refuses storage still gets to play; it just forgets.
    }
  }, []);

  /* REDUCED MOTION is honoured by never starting anything unasked. Nothing on
   * this page moves until somebody presses SNAP, and pressing SNAP is a
   * request for motion, so there is no separate still mode to build. Worth
   * writing down so nobody adds an attract loop here later without thinking
   * about who it starts moving for. */

  /* The formation is laid out at mount so the resting frame is a football
     field with a team on it rather than a lone man on an empty one. */
  const worldRef = useRef<World | null>(null);
  if (worldRef.current === null) {
    const w = newWorld();
    kickoff(w);
    worldRef.current = w;
  }

  const phaseRef = useRef<Phase>("ready");
  const keysRef = useRef<Record<string, boolean>>({});
  /** Set for exactly one tick when the spin is pressed, then cleared by the
   *  loop. Holding the key must not hold the boost. */
  const spinRef = useRef(false);
  /** Where a finger or a held mouse button is, in logical canvas coordinates,
   *  or null when nothing is pressed. Touch steers by pointing rather than
   *  through an on-screen pad, which would eat a third of a 375px screen. */
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  /** False while the cabinet is scrolled out of view. The loop stops dead
   *  rather than resolving a play nobody is watching. */
  const seenRef = useRef(true);

  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const snap = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    if (phaseRef.current === "touchdown" || phaseRef.current === "over") {
      Object.assign(w, newWorld());
      setDown(1);
      setBall(20);
      setNeed(10);
    }
    setGained(0);
    kickoff(w);
    play("snap");
    /* The loop runs for the length of the down and stops at the whistle. It is
     * bounded by the play rather than by the page, which is what keeps music
     * on a website from being something done TO somebody. */
    startDrive();
    goPhase("live");
  }, [goPhase]);

  /* ------------------------------------------------------------- the loop */

  useEffect(() => {
    const canvas = canvasRef.current;
    const w = worldRef.current;
    if (!canvas || !w || !kits) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const us = TEAMS[kits.us];
    const them = TEAMS[kits.them];

    let raf = 0;
    let last = 0;
    let carry = 0;

    const remember = (yards: number) => {
      try {
        const prev = Number(window.localStorage.getItem(BEST_KEY)) || 0;
        if (yards > prev) {
          window.localStorage.setItem(BEST_KEY, String(yards));
          setBest(yards);
        }
      } catch {
        // Not remembering a personal best is not a reason to stop the game.
      }
    };

    /** The direction the player is asking for, from whichever device they are
     *  using. Keys win when both are active. */
    const readInput = (): Input => {
      const k = keysRef.current;
      let dx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      const p = pointRef.current;
      if (p && !dx && !dy) {
        // The pointer is in screen space and the runner is in world space, so
        // the camera has to come off one of them before they can be compared.
        const camX = camera(w.runner.x);
        const rx = w.runner.x - camX + 4;
        const ry = w.runner.y + 7;
        const d = Math.hypot(p.x - rx, p.y - ry);
        // A dead zone, or the runner jitters around a stationary finger.
        if (d >= 6) {
          dx = (p.x - rx) / d;
          dy = (p.y - ry) / d;
        }
      }
      const spin = spinRef.current;
      spinRef.current = false;
      return { dx, dy, spin };
    };

    const render = () => {
      const camX = camera(w.runner.x);
      drawField(ctx, VIEW_W, VIEW_H, camX);

      // THE ENDZONE, painted over the field rather than as part of it: it is
      // a property of this game, not of a football field in general.
      if (camX + VIEW_W > GOAL) {
        const gx = Math.round(GOAL - camX);
        ctx.fillStyle = "rgba(11,23,16,0.55)";
        ctx.fillRect(gx, 4, VIEW_W - gx, VIEW_H - 9);
        ctx.fillStyle = "rgba(251,253,248,0.18)";
        for (let x = gx + 6; x < VIEW_W; x += 8) {
          ctx.fillRect(x, 5, 1, VIEW_H - 11);
        }
        ctx.fillStyle = PX.chalk;
        ctx.fillRect(gx, 4, 2, VIEW_H - 9);
        // Goalposts at the back of the endzone.
        const post = Math.round(WORLD - camX - 6);
        ctx.fillStyle = PX.gold;
        ctx.fillRect(post, 30, 2, VIEW_H - 60);
        ctx.fillRect(post - 4, 30, 10, 2);
      }

      // The line of scrimmage in orange, the first-down marker in gold. Two
      // dashed lines, and between them is the entire question the play is
      // asking. A chain gang is the only HUD this sport ever needed.
      const lx = Math.round(w.los - camX);
      if (lx > -2 && lx < VIEW_W) {
        ctx.fillStyle = PX.action;
        for (let y = 6; y < VIEW_H - 6; y += 4) ctx.fillRect(lx, y, 1, 2);
      }
      const mx = Math.round(w.marker - camX);
      if (mx > -2 && mx < VIEW_W && w.marker < GOAL) {
        ctx.fillStyle = PX.gold;
        for (let y = 6; y < VIEW_H - 6; y += 4) ctx.fillRect(mx, y, 1, 2);
      }

      const live = phaseRef.current === "live";
      const dead =
        phaseRef.current === "tackled" ||
        phaseRef.current === "first" ||
        phaseRef.current === "over";
      const stride = Math.floor(w.frame / 4) % 2 === 0;

      w.blockers.forEach((b) =>
        drawPlayer(ctx, b.x - camX, b.y, us, {
          stride: live && stride,
          facing: b.vx < 0 ? -1 : 1,
        }),
      );
      w.defence.forEach((d) =>
        drawPlayer(ctx, d.x - camX, d.y, them, {
          stride: live && stride,
          facing: d.vx < 0 ? -1 : 1,
        }),
      );

      // The runner last, so he is never behind anybody, and carrying the ball
      // so there is never a question about which of eleven sprites is you.
      const r = w.runner;
      if (w.spin > 0) {
        // The spin reads as a chalk streak at his feet. It is the only
        // feedback that the boost is actually running.
        ctx.fillStyle = PX.chalk;
        ctx.fillRect(Math.round(r.x - camX) - 2, Math.round(r.y) + 14, 12, 1);
      }
      drawPlayer(ctx, r.x - camX, r.y, us, {
        stride: live && stride,
        facing: r.vx < 0 ? -1 : 1,
        ball: true,
        out: dead,
      });
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      /* SCROLLED AWAY IS PAUSED, not fast-forwarded. Dropping the clock here
         means it restarts when the cabinet comes back into view, so a play
         left running while somebody read the rest of the page does not
         resolve itself off screen. */
      if (!seenRef.current) {
        last = 0;
        carry = 0;
        return;
      }
      if (!last) {
        last = t;
        // Coming back to a down that is still live: pick the music up again.
        if (phaseRef.current === "live") startDrive();
      }
      carry += t - last;
      last = t;
      // Cap the catch-up. A tab that was hidden for a minute must not run
      // eighteen hundred simulation steps the instant it comes back.
      if (carry > TICK_MS * 6) carry = TICK_MS * 6;
      while (carry >= TICK_MS) {
        carry -= TICK_MS;
        if (phaseRef.current !== "live") continue;

        const result = step(w, readInput());
        if (result === "live") continue;

        const yards = gainOf(w);
        setGained(yards);
        remember(yards);

        stopMusic(); // the whistle
        if (result === "touchdown") {
          fanfare();
          goPhase("touchdown");
          break;
        }
        const outcome = nextDown(w);
        setBall(yardLine(w));
        setNeed(toGo(w));
        setDown(w.down);
        /* Three different endings need three different noises. Everything used
         * to resolve to the same descending menu-rejection blip, so being
         * brought down a yard short of the sticks and picking up a first down
         * sounded identical. */
        play(
          outcome === "first-down"
            ? "first"
            : outcome === "turnover"
              ? "out"
              : "tackle",
        );
        goPhase(
          outcome === "turnover"
            ? "over"
            : outcome === "first-down"
              ? "first"
              : "tackled",
        );
        break;
      }
      render();
    };

    /* Paint one complete frame synchronously. requestAnimationFrame does not
       fire in a background tab, and there are preview surfaces that never run
       it at all, so the resting frame has to be correct before the loop is
       ever asked to produce one. */
    render();
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(
      ([entry]) => {
        seenRef.current = entry.isIntersecting;
        if (entry.isIntersecting) return;
        keysRef.current = {};
        /* Scrolled out of view pauses the play, so it has to silence the loop
         * as well — music continuing over a paused game is worse than either. */
        stopMusic();
      },
      { threshold: 0.25 },
    );
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      /* Leaving the page mid-down must not leave a marching band playing under
       * whatever the visitor opened next. */
      stopMusic();
    };
  }, [kits, goPhase]);

  /* -------------------------------------------------------------- controls */

  useEffect(() => {
    const map: Record<string, string> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
      W: "up",
      S: "down",
      A: "left",
      D: "right",
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = map[e.key];
      if (dir) {
        keysRef.current[dir] = true;
        /* Only swallow the arrow keys while a play is actually running.
           Taking them the rest of the time would break scrolling on a page
           that merely contains a game, which is a bad trade for a toy. */
        if (phaseRef.current === "live") e.preventDefault();
        return;
      }
      if ((e.key === " " || e.key === "Enter") && phaseRef.current === "live") {
        e.preventDefault();
        if (e.repeat) return;
        spinRef.current = true;
        play("move");
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = map[e.key];
      if (dir) keysRef.current[dir] = false;
    };
    /* Keys go stale when a window loses focus mid-press: the keyup lands in
       another window and the runner sprints into the sideline forever. */
    const onBlur = () => {
      keysRef.current = {};
      pointRef.current = null;
    };

    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const pointerAt = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    pointRef.current = {
      x: ((e.clientX - r.left) / r.width) * VIEW_W,
      y: ((e.clientY - r.top) / r.height) * VIEW_H,
    };
  }, []);

  /* GOAL rather than a number once the marker is pinned to the goal line,
     which is what a scoreboard says and what everybody already understands. */
  const chains = ball + need >= 100 ? "GOAL" : String(need);
  const ordinal = ["1ST", "2ND", "3RD", "4TH"][Math.min(DOWNS - 1, down - 1)];

  return (
    <div className="panel-primary scanlines relative overflow-hidden">
      {/* TOP RAIL, the same furniture as the attract cabinet on the landing
          page, because this is the same machine running a second cartridge. */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-chalk px-3 py-2 font-matrix text-[10px] leading-4">
        <span className="text-chalk">COMMISH BOWL</span>
        <span className="text-cream-dim">
          {ordinal} &amp; <span className="text-chalk">{chains}</span>
          <span className="ml-2 opacity-70">ON {ball}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-gold tabular-nums">BEST {best} YD</span>
          {/* THE GAME SHIPPED WITHOUT THIS and was therefore silent with no way
              to fix that: sound is off until somebody turns it on, and the only
              toggle on the site was in the landing page's cabinet. Nothing is
              constructed for a visitor who never presses it. */}
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

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          role="img"
          aria-label="A pixel football field. Your runner carries the ball left to right while seven defenders pursue."
          className="block w-full touch-none"
          style={{ imageRendering: "pixelated", aspectRatio: "16 / 9" }}
          onPointerDown={(e) => {
            if (phaseRef.current !== "live") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pointerAt(e);
          }}
          onPointerMove={(e) => {
            if (pointRef.current) pointerAt(e);
          }}
          onPointerUp={() => {
            pointRef.current = null;
          }}
          onPointerCancel={() => {
            pointRef.current = null;
          }}
        />

        {/* THE CARD BETWEEN PLAYS. It covers the field only when the field is
            not being played on, and it is never a modal: the button in it is
            the same snap the keyboard reaches. */}
        {phase !== "live" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel/70 px-4 text-center">
            <p
              className="font-matrix text-[13px] leading-5 text-chalk sm:text-[16px] sm:leading-6"
              aria-live="polite"
            >
              {phase === "ready"
                ? "1ST & 10. TAKE IT."
                : phase === "first"
                  ? `${gained} YD. FIRST DOWN.`
                  : phase === "tackled"
                    ? `TACKLED. ${gained} YD.`
                    : phase === "touchdown"
                      ? "TOUCHDOWN"
                      : "TURNOVER ON DOWNS"}
            </p>
            <button type="button" onClick={snap} className="btn btn-primary">
              {phase === "ready"
                ? "SNAP"
                : phase === "first" || phase === "tackled"
                  ? `${ordinal} DOWN`
                  : "PLAY AGAIN"}
            </button>
            {phase === "touchdown" ? (
              <Link href="/pools/new" className="btn btn-secondary">
                START A REAL POOL
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* BOTTOM RAIL: the controls, written down, because a game that only
          explains itself by being played excludes everyone who cannot watch
          it move. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-2 border-chalk px-3 py-2">
        <span className="font-matrix text-[10px] leading-4 text-cream-dim">
          ARROWS / WASD &middot; SPACE TO SPIN &middot; &#9834; FOR SOUND
        </span>
        <span className="text-xs text-cream-dim">
          On a phone, hold and drag on the field to run.
        </span>
      </div>
    </div>
  );
}
