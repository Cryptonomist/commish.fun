"use client";

/* ONE KICK AT THE POSTS, SEEN FROM BEHIND THE BALL.
 *
 * Used by both games on /arcade. Commish Bowl brings it up for every field goal
 * and extra point, yours and the computer's; the long kick game is a ladder of
 * them. It takes a distance, a wind and a kicker, runs the kick, says what
 * happened, and hands the result back. The rules of what a make is worth
 * belong to whichever game asked.
 *
 * THREE DECISIONS, the way every kicking game since the nineties has put them:
 *
 *   AIM      turn the kick left or right to play the wind
 *   POWER    stop the bar high enough to reach, which the number beside it
 *            tells you in yards before you commit
 *   ACCURACY stop the needle in the middle, which gets harder the harder you
 *            struck it
 *
 * THIS FILE OWNS THE CLOCK, THE CANVAS AND THE KEYS. The flight is
 * lib/fieldgoal.ts and the picture is lib/kickcam.ts, both pure, both tested,
 * both runnable with no browser at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WindBadge } from "@/components/ArcadeKit";
import { kickHeading, type KickWind } from "@/lib/conditions";
import { type Bit, burst, CONFETTI_MAX_FRAMES, stepConfetti } from "@/lib/confetti";
import { type Flake, makeWeather, stepWeather } from "@/lib/fieldfx";
import {
  accuracyPeriod,
  AIM_MAX,
  callFor,
  type Doink,
  type Kick,
  kickFinished,
  type KickInput,
  type KickOutcome,
  launchKick,
  needle,
  POWER_PERIOD,
  powerFor,
  reach,
  stepKick,
  triangle,
} from "@/lib/fieldgoal";
import {
  CAM_H,
  CAM_W,
  drawKickCam,
  followKick,
  type KickerPose,
  type Look,
  restingCam,
} from "@/lib/kickcam";
import type { Kit } from "@/lib/pixel";
import { play } from "@/lib/sfx";

export type KickResult = {
  outcome: KickOutcome;
  doink: Doink;
  good: boolean;
  call: string;
};

type Phase = "aim" | "power" | "accuracy" | "runup" | "flight" | "done";

const TICK = 1000 / 30;
const RUN_UP_TICKS = 14;
/** How long the computer stands over the ball before it kicks. */
const COMPUTER_SETTLE = 36;
/** The middle of the accuracy dial that counts as a pure strike, as drawn. */
const SWEET = 0.1;

type Props = {
  distance: number;
  look: Look;
  wind: KickWind;
  /** The weather's effect on how far a kick carries. */
  carry: number;
  kicker: Kit;
  /** The team rushing the kick, or null for nobody on the line. */
  rush: Kit | null;
  /** The computer's kick, or null when a person is kicking. */
  auto: KickInput | null;
  /** What this kick is: "FIELD GOAL", "EXTRA POINT", "KICK 4". */
  title: string;
  /** Who is kicking, for the line under the computer's kick. */
  kickerName: string;
  continueLabel: string;
  onResult: (result: KickResult) => void;
  onContinue: () => void;
  /** Set by the parent after a result it wants celebrated, such as a record. */
  celebrate?: boolean;
  /** Extra words for the result banner, from the parent: "NEW BEST: 58 YARDS". */
  note?: string | null;
  /** Height-driven canvas, for a phone held sideways. */
  sideways?: boolean;
};

export function FieldGoalKick({
  distance,
  look,
  wind,
  carry,
  kicker,
  rush,
  auto,
  title,
  kickerName,
  continueLabel,
  onResult,
  onContinue,
  celebrate = false,
  note = null,
  sideways = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("aim");
  const [result, setResult] = useState<KickResult | null>(null);
  const [aimShown, setAimShown] = useState(auto ? auto.aim : 0);

  const phaseRef = useRef<Phase>("aim");
  const clockRef = useRef(0); // meter phase, in cycles
  const powerRef = useRef(0);
  const accuracyRef = useRef(0);
  const aimRef = useRef(auto ? auto.aim : 0);
  const aimHoldRef = useRef(0); // -1, 0 or 1 while an aim key or button is held
  const kickRef = useRef<Kick | null>(null);
  const camRef = useRef(restingCam());
  const trailRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const flakesRef = useRef<Flake[]>([]);
  const frameRef = useRef(0);
  const runUpRef = useRef(0);
  const poseRef = useRef<KickerPose>("set");
  const strikeRef = useRef(0);
  const announcedRef = useRef(false);
  const cheeringRef = useRef(false);
  const settleRef = useRef(0);
  const confettiRef = useRef<Bit[] | null>(null);
  const confettiFramesRef = useRef(0);
  const reducedRef = useRef(false);
  const seenRef = useRef(true);

  // The moving parts of the meters, written straight to the DOM from the loop.
  const powerFillRef = useRef<HTMLDivElement | null>(null);
  const legRef = useRef<HTMLSpanElement | null>(null);
  const needleRef = useRef<HTMLDivElement | null>(null);

  // The callbacks can change between renders; the loop reads the latest.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  /* THE LEG TABLE. `reach` flies a whole kick, and the number beside the power
   * bar changes every frame, so the reaches are flown once per kick for a
   * hundred powers and read back from the table. Same flight, same wind, so
   * the meter and the kick cannot disagree. */
  const legs = useMemo(() => {
    const table: number[] = [];
    for (let i = 0; i <= 100; i++) table.push(reach(i / 100, wind.along, carry));
    return table;
  }, [wind.along, carry]);
  const needed = useMemo(() => powerFor(distance, wind.along, carry), [distance, wind.along, carry]);

  const legAt = useCallback(
    (power: number) => {
      const f = Math.max(0, Math.min(1, power)) * 100;
      const i = Math.floor(f);
      const j = Math.min(100, i + 1);
      return legs[i] + (legs[j] - legs[i]) * (f - i);
    },
    [legs],
  );

  /** One press: the whole game is this function three times. */
  const press = useCallback(() => {
    if (auto) return;
    const p = phaseRef.current;
    if (p === "aim") {
      clockRef.current = 0;
      goPhase("power");
      play("move");
    } else if (p === "power") {
      powerRef.current = triangle(clockRef.current);
      clockRef.current = 0;
      goPhase("accuracy");
      play("move");
    } else if (p === "accuracy") {
      accuracyRef.current = needle(clockRef.current);
      runUpRef.current = 0;
      goPhase("runup");
    }
  }, [auto, goPhase]);

  /* ------------------------------------------------------------- the loop */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    reducedRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    flakesRef.current = makeWeather(distance * 131 + 7, look.weather, CAM_W, CAM_H);

    const render = () => {
      drawKickCam(ctx, {
        distance,
        kick: kickRef.current,
        cam: camRef.current,
        look,
        wind,
        frame: frameRef.current,
        kicker,
        rush,
        pose: poseRef.current,
        runUp: runUpRef.current,
        aim: aimRef.current,
        aiming: phaseRef.current === "aim" || phaseRef.current === "power" || phaseRef.current === "accuracy",
        flakes: flakesRef.current,
        cheering: cheeringRef.current,
        trail: trailRef.current,
      });
      const bits = confettiRef.current;
      if (bits) {
        for (const b of bits) {
          if (!b.alive) continue;
          ctx.fillStyle = b.color;
          ctx.fillRect(Math.round(b.x * CAM_W), Math.round(b.y * CAM_H), b.size, b.size);
        }
      }
    };

    const tick = () => {
      frameRef.current += 1;
      const p = phaseRef.current;
      const slow = reducedRef.current ? 0.5 : 1;

      if (!reducedRef.current) {
        stepWeather(flakesRef.current, look.weather, wind.cross * 0.04, CAM_W, CAM_H);
      }

      if (p === "aim") {
        if (auto) {
          settleRef.current += 1;
          if (settleRef.current >= COMPUTER_SETTLE) {
            powerRef.current = auto.power;
            accuracyRef.current = auto.accuracy;
            aimRef.current = auto.aim;
            runUpRef.current = 0;
            goPhase("runup");
          }
        } else if (aimHoldRef.current !== 0) {
          aimRef.current = Math.max(
            -AIM_MAX,
            Math.min(AIM_MAX, aimRef.current + aimHoldRef.current * 0.25),
          );
          setAimShown(Math.round(aimRef.current * 4) / 4);
        }
      } else if (p === "power") {
        clockRef.current += (TICK / 1000 / POWER_PERIOD) * slow;
        const power = triangle(clockRef.current);
        if (powerFillRef.current) powerFillRef.current.style.width = `${power * 100}%`;
        if (legRef.current) {
          const leg = legAt(power);
          const reaches = leg >= distance;
          // Clamped against the colour, so the number never argues with it.
          legRef.current.textContent = `${reaches ? Math.max(distance, Math.floor(leg)) : Math.min(distance - 1, Math.floor(leg))} YD`;
          legRef.current.style.color = reaches ? "var(--color-alive)" : "var(--color-out-lit)";
        }
      } else if (p === "accuracy") {
        clockRef.current += (TICK / 1000 / accuracyPeriod(powerRef.current)) * slow;
        const n = needle(clockRef.current);
        if (needleRef.current) needleRef.current.style.left = `${((n + 1) / 2) * 100}%`;
      } else if (p === "runup") {
        runUpRef.current = Math.min(1, runUpRef.current + 1 / RUN_UP_TICKS);
        poseRef.current = Math.floor(frameRef.current / 4) % 2 === 0 ? "stride" : "set";
        if (runUpRef.current >= 1) {
          kickRef.current = launchKick(
            distance,
            { power: powerRef.current, accuracy: accuracyRef.current, aim: aimRef.current },
            wind,
            carry,
          );
          trailRef.current = [];
          poseRef.current = "strike";
          strikeRef.current = 10;
          announcedRef.current = false;
          play("kick");
          goPhase("flight");
        }
      } else if (p === "flight" || p === "done") {
        const k = kickRef.current;
        if (k) {
          if (!k.resting) stepKick(k);
          followKick(camRef.current, k);
          if (!k.landed) {
            trailRef.current.push({ x: k.x, y: k.y, z: k.z });
            if (trailRef.current.length > 12) trailRef.current.shift();
          } else if (trailRef.current.length > 0 && frameRef.current % 2 === 0) {
            trailRef.current.shift();
          }
          if (strikeRef.current > 0 && --strikeRef.current === 0) poseRef.current = "set";

          if (k.outcome !== null && !announcedRef.current) {
            announcedRef.current = true;
            const good = k.outcome === "good";
            if (k.doink) play("doink");
            play(good ? "win" : "out");
            cheeringRef.current = good;
          }
          if (p === "flight" && kickFinished(k) && k.outcome) {
            const r: KickResult = {
              outcome: k.outcome,
              doink: k.doink,
              good: k.outcome === "good",
              call: callFor(k.outcome, k.doink),
            };
            setResult(r);
            goPhase("done");
            onResultRef.current(r);
          }
        }
      }

      if (confettiRef.current) {
        confettiFramesRef.current += 1;
        const alive = stepConfetti(confettiRef.current);
        if (alive === 0 || confettiFramesRef.current > CONFETTI_MAX_FRAMES) confettiRef.current = null;
      }
    };

    /* A correct resting frame first: requestAnimationFrame does not run in a
     * background tab, and a black box reads as a failure to load. */
    render();

    let raf = 0;
    let last = 0;
    let carryMs = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!seenRef.current) {
        last = 0;
        carryMs = 0;
        return;
      }
      if (!last) last = t;
      carryMs += t - last;
      last = t;
      if (carryMs > TICK * 6) carryMs = TICK * 6;
      let dirty = false;
      while (carryMs >= TICK) {
        carryMs -= TICK;
        tick();
        dirty = true;
      }
      if (dirty) render();
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(
      ([entry]) => {
        seenRef.current = entry.isIntersecting;
      },
      { threshold: 0.2 },
    );
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
    // The kick is fixed for the life of this component: a new kick remounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A celebration the parent asked for, from the posts. Not under reduced
   * motion: a hundred and twenty pieces across the screen is exactly what that
   * setting asks not to be shown. */
  useEffect(() => {
    if (!celebrate || reducedRef.current) return;
    confettiRef.current = burst(frameRef.current * 7919 + distance, 120, {
      points: [
        { x: 0.42, y: 0.18 },
        { x: 0.58, y: 0.18 },
      ],
      sideways: "both",
    });
    confettiFramesRef.current = 0;
  }, [celebrate, distance]);

  /* -------------------------------------------------------------- controls */

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = phaseRef.current;
      if (e.key === " " || e.key === "Enter") {
        // Leave Enter on a focused button to that button.
        if (e.key === "Enter" && document.activeElement instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (e.repeat) return;
        if (p === "done") onContinue();
        else press();
        return;
      }
      if (auto || p !== "aim") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        aimHoldRef.current = -1;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        aimHoldRef.current = 1;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) aimHoldRef.current = 0;
    };
    const onBlur = () => {
      aimHoldRef.current = 0;
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [auto, onContinue, press]);

  const holdAim = (dir: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      aimHoldRef.current = dir;
    },
    onPointerUp: () => {
      aimHoldRef.current = 0;
    },
    onPointerCancel: () => {
      aimHoldRef.current = 0;
    },
    onLostPointerCapture: () => {
      aimHoldRef.current = 0;
    },
  });

  const heading = kickHeading(wind);
  const mph = Math.round(Math.hypot(wind.cross, wind.along));
  const spoken =
    mph === 0
      ? "No wind."
      : `Wind ${mph} miles an hour, ${wind.along > 3 ? "behind the kick" : wind.along < -3 ? "into the kick" : "across the field"}${
          Math.abs(wind.cross) > 3 ? `, pushing it to the ${wind.cross > 0 ? "right" : "left"}` : ""
        }.`;
  const reachable = needed <= 1;
  // No degree sign: the pixel face has none, and a fallback glyph in the middle
  // of a pixel label is the one thing on screen that looks broken.
  const aimWords =
    aimShown === 0
      ? "STRAIGHT"
      : `${Math.abs(aimShown).toFixed(aimShown % 1 === 0 ? 0 : 1)} ${aimShown < 0 ? "LEFT" : "RIGHT"}`;

  return (
    <div className={sideways ? "flex min-h-0 flex-1 flex-col" : "flex flex-col"}>
      <div
        className={
          sideways ? "relative flex min-h-0 flex-1 items-center justify-center" : "relative"
        }
      >
        <canvas
          ref={canvasRef}
          width={CAM_W}
          height={CAM_H}
          role="img"
          aria-label={`A ${distance}-yard kick, seen from behind the holder, at the goalposts.`}
          className={sideways ? "block touch-none" : "block w-full touch-none"}
          style={
            sideways
              ? { imageRendering: "pixelated", aspectRatio: "16 / 9", height: "100%", width: "auto", maxWidth: "100%" }
              : { imageRendering: "pixelated", aspectRatio: "16 / 9" }
          }
          onPointerDown={() => {
            const p = phaseRef.current;
            if (p === "power" || p === "accuracy") press();
          }}
        />

        {/* THE HEAD OF THE SCREEN: what this kick is, and the flag. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <span className="panel flex flex-col px-2 py-1 font-matrix text-[10px] leading-4 text-chalk">
            <span className="text-cream-dim">{title}</span>
            <span className="text-[13px] leading-5 tabular-nums">{distance} YD</span>
          </span>
          <span className="panel px-2 py-1">
            <WindBadge heading={heading} mph={mph} spoken={spoken} />
          </span>
        </div>

        {/* THE CALL. */}
        {phase === "done" && result ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center px-3">
            <div className="kick-cleared panel flex flex-col items-center gap-1 px-5 py-3 text-center">
              <span
                className="font-matrix text-[14px] leading-6 sm:text-[18px]"
                style={{ color: result.good ? "var(--color-alive)" : "var(--color-out-lit)" }}
              >
                {result.call}
              </span>
              {note ? (
                <span className="font-matrix text-[10px] leading-4 text-chalk">{note}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* THE CONTROLS, and what each press will do. One rail, the same height
          whichever step of the kick it is showing, so the page does not jump
          under the thumb between presses. */}
      <div
        className="flex min-h-[88px] flex-col justify-center gap-2 border-t-2 border-chalk px-3 py-2"
        aria-live="polite"
      >
        {auto ? (
          <p className="font-matrix text-[11px] leading-5 text-chalk">
            {phase === "done" && result ? (
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>{result.call}</span>
                <button type="button" onClick={onContinue} className="btn btn-primary btn-compact">
                  {continueLabel}
                </button>
              </span>
            ) : (
              `${kickerName} LINE UP A ${distance}-YARD ${title}.`
            )}
          </p>
        ) : phase === "aim" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Aim left" className="btn btn-secondary btn-compact w-12 px-0" {...holdAim(-1)}>
                &lt;
              </button>
              <span className="w-28 text-center font-matrix text-[10px] leading-4 text-chalk tabular-nums">
                AIM {aimWords}
              </span>
              <button type="button" aria-label="Aim right" className="btn btn-secondary btn-compact w-12 px-0" {...holdAim(1)}>
                &gt;
              </button>
            </div>
            <button type="button" onClick={press} className="btn btn-primary btn-compact">
              KICK
            </button>
          </div>
        ) : phase === "power" ? (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex justify-between font-matrix text-[10px] leading-4 text-chalk">
                <span>POWER</span>
                <span>
                  LEG <span ref={legRef}>0 YD</span>
                </span>
              </span>
              <div className="relative h-4 border-2 border-chalk bg-panel">
                <div ref={powerFillRef} className="absolute inset-y-0 left-0 bg-action" style={{ width: "0%" }} />
                {/* Where the leg starts reaching. Past the end when nothing does. */}
                <div
                  aria-hidden="true"
                  className="absolute -top-1 -bottom-1 w-[2px]"
                  style={{
                    left: `calc(${Math.min(1, needed) * 100}% - 1px)`,
                    background: reachable ? "var(--color-alive)" : "var(--color-out-lit)",
                  }}
                />
              </div>
            </div>
            <button type="button" onClick={press} className="btn btn-primary btn-compact shrink-0">
              SET
            </button>
          </div>
        ) : phase === "accuracy" ? (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-matrix text-[10px] leading-4 text-chalk">ACCURACY: STOP IT IN THE MIDDLE</span>
              <div className="relative h-4 border-2 border-chalk bg-panel">
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 bg-alive/40"
                  style={{ left: `${((1 - SWEET) / 2) * 100}%`, width: `${SWEET * 100}%` }}
                />
                <div ref={needleRef} className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 bg-chalk" style={{ left: "50%" }} />
              </div>
            </div>
            <button type="button" onClick={press} className="btn btn-primary btn-compact shrink-0">
              SET
            </button>
          </div>
        ) : phase === "done" && result ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-matrix text-[11px] leading-5" style={{ color: result.good ? "var(--color-alive)" : "var(--color-out-lit)" }}>
              {result.call}
            </span>
            <button type="button" onClick={onContinue} className="btn btn-primary btn-compact">
              {continueLabel}
            </button>
          </div>
        ) : (
          <p className="font-matrix text-[11px] leading-5 text-cream-dim">
            {phase === "runup" ? "HERE'S THE SNAP..." : "IT'S IN THE AIR..."}
          </p>
        )}
        {!auto && (phase === "aim" || phase === "power" || phase === "accuracy") ? (
          <p className="text-xs leading-5 text-cream-dim">
            {phase === "aim"
              ? "Arrows or the buttons to aim into the wind. Space or KICK to start the power bar."
              : phase === "power"
                ? "The green line is how much leg this distance needs. Space, tap or SET to lock it."
                : "The harder you kicked, the faster this moves. Space, tap or SET."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
