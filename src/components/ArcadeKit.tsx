"use client";

/* THE ARCADE'S SHARED FURNITURE: the sound switch, the wind flag, and the
 * pickers for the conditions a game is played in.
 *
 * Both cabinets on /arcade carry the same three things, and two copies of a
 * wind arrow is how the long kick game ends up pointing one way while the full
 * game points the other. So they live here, once.
 *
 * Every word is DOM, as it is everywhere else in the arcade: the canvases
 * paint the field and the players, and anything somebody reads is text a
 * screen reader can reach.
 */

import { useCallback, useEffect, useState } from "react";

import type { Heading } from "@/lib/conditions";
import { play, setSfxEnabled, sfxEnabled } from "@/lib/sfx";

/* ------------------------------------------------------------------ sound */

/** Sound is off until somebody turns it on, and the choice is read after
 *  mount, never during render: localStorage does not exist on the server. */
export function useSound(onEnable?: () => void): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(sfxEnabled()), []);
  const toggle = useCallback(() => {
    const next = !sfxEnabled();
    setSfxEnabled(next);
    setOn(next);
    if (next) {
      // Confirm through the thing that was just switched on.
      play("confirm");
      onEnable?.();
    }
  }, [onEnable]);
  return [on, toggle];
}

export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Turn sound off" : "Turn sound on"}
      className={`flex h-6 w-6 items-center justify-center border border-rule text-[11px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
        on ? "bg-action text-panel" : "text-cream-dim hover:text-chalk"
      }`}
    >
      &#9834;
    </button>
  );
}

/* ---------------------------------------------------------------- the guide */

/** Where the written how-to-play sits on /arcade, under whichever game is up. */
export const GUIDE_ID = "how-to-play";

function toGuide(): void {
  const el = document.getElementById(GUIDE_ID);
  if (!el) return;
  const still =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  // Focus follows, so a keyboard or screen reader lands where the eye did.
  el.focus({ preventScroll: true });
}

/** A text link to the full controls, for a setup screen. */
export function GuideLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={toGuide}
      className="w-fit text-left text-xs leading-5 text-cream-dim underline decoration-dotted underline-offset-2 hover:text-chalk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk"
    >
      {children}
    </button>
  );
}

/** The "?" beside the sound switch. */
export function GuideButton() {
  return (
    <button
      type="button"
      onClick={toGuide}
      aria-label="How to play: every control"
      className="flex h-6 w-6 items-center justify-center border border-rule font-matrix text-[10px] leading-none text-cream-dim transition-colors hover:text-chalk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk"
    >
      ?
    </button>
  );
}

/* ------------------------------------------------------------------- wind */

/* THE ARROW, drawn in pixels rather than typed, because the pixel faces this
 * site uses have no arrows and a system-font arrow on a pixel scoreboard looks
 * pasted in. Two drawings, straight and diagonal, and quarter turns of each
 * make all eight directions: a pixel shape survives a ninety-degree turn and
 * does not survive a forty-five. */
const STRAIGHT: [number, number][] = [
  [3, 0], [2, 1], [3, 1], [4, 1], [1, 2], [3, 2], [5, 2],
  [3, 3], [3, 4], [3, 5], [3, 6],
];
const DIAGONAL: [number, number][] = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [5, 1], [6, 1], [4, 2], [6, 2],
  [3, 3], [6, 3], [2, 4], [1, 5], [0, 6],
];

const TURN: Record<Exclude<Heading, "calm">, { cells: [number, number][]; deg: number }> = {
  n: { cells: STRAIGHT, deg: 0 },
  e: { cells: STRAIGHT, deg: 90 },
  s: { cells: STRAIGHT, deg: 180 },
  w: { cells: STRAIGHT, deg: 270 },
  ne: { cells: DIAGONAL, deg: 0 },
  se: { cells: DIAGONAL, deg: 90 },
  sw: { cells: DIAGONAL, deg: 180 },
  nw: { cells: DIAGONAL, deg: 270 },
};

export function PixelArrow({ heading, size = 14 }: { heading: Exclude<Heading, "calm">; size?: number }) {
  const { cells, deg } = TURN[heading];
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className="shrink-0"
      style={{ transform: `rotate(${deg}deg)` }}
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

/** The flag: an arrow and a speed, with a sentence for anyone who cannot see
 *  either. `spoken` is written by the caller, who knows which view the arrow
 *  is drawn for. */
export function WindBadge({
  heading,
  mph,
  spoken,
}: {
  heading: Heading;
  mph: number;
  spoken: string;
}) {
  return (
    <span className="flex items-center gap-1.5 font-matrix text-[10px] leading-4 text-chalk">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        <span className="text-cream-dim">WIND</span>
        {heading === "calm" || mph === 0 ? (
          <span>CALM</span>
        ) : (
          <>
            <PixelArrow heading={heading} />
            <span className="tabular-nums">{mph} MPH</span>
          </>
        )}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- pickers */

/** One row of mutually exclusive choices, as pressable buttons with a note
 *  under them saying what the selected one does. */
export function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string; note: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const current = options.find((o) => o.id === value);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-matrix text-[10px] leading-4 text-cream-dim">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === value}
            onClick={() => {
              play("move");
              onChange(o.id);
            }}
            className="btn btn-nav"
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-cream-dim">{current?.note}</p>
    </fieldset>
  );
}
