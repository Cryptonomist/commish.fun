"use client";

/* One team, one cell, thirty-two of them under time pressure.
 *
 * A Survivor grid gets scanned in the minutes before a lock, and thirty-two
 * identical text buttons make that a reading exercise. The two-stop colour bar
 * turns it into a recognition one: a fan finds Buffalo by its royal-and-red
 * without processing a single letter.
 *
 * The colours are the club's, from `lib/nfl.ts`, and they are content rather
 * than palette — the button's own surfaces stay on the Pigskin tokens so a
 * grid of thirty-two does not turn into thirty-two competing designs. When a
 * team is picked the whole cell goes to the action colour and the bar is
 * dropped: at that point the cell means "your pick", not "Buffalo", and one
 * clear state beats two half-signals.
 */

import type { Team } from "@/lib/nfl";

export type TeamState = "available" | "picked" | "spent";

/** The club's two colours as one bar. Shared by every thirty-two cell grid in
 *  the app so identification looks the same wherever you are scanning. The
 *  65/35 split is asymmetric on purpose: two equal halves read as a flag. */
export function ClubBar({
  team,
  dim = false,
}: {
  team: Team;
  dim?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-0 top-0 flex h-[3px] ${dim ? "opacity-30" : ""}`}
    >
      <span className="h-full grow-[65]" style={{ background: team.lead }} />
      <span className="h-full grow-[35]" style={{ background: team.trim }} />
    </span>
  );
}

export function TeamButton({
  team,
  state = "available",
  disabled = false,
  pending = false,
  onClick,
}: {
  team: Team;
  state?: TeamState;
  disabled?: boolean;
  pending?: boolean;
  onClick?: (team: number) => void;
}) {
  const picked = state === "picked";
  const spent = state === "spent";
  const dead = disabled || spent;

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(team.i) : undefined}
      disabled={dead}
      aria-pressed={picked}
      aria-label={`${team.city} ${team.name}${
        spent ? ", already used this season" : ""
      }`}
      className={[
        "group relative flex h-16 w-full flex-col items-center justify-center gap-0.5",
        "overflow-hidden rounded-xl border text-center transition-colors",
        picked
          ? "border-action bg-action text-night"
          : spent
            ? "border-night-3 bg-night-2/40 text-cream-dim/40"
            : "border-night-3 bg-night-2 text-cream hover:border-action",
        dead ? "cursor-not-allowed" : "",
      ].join(" ")}
    >
      {/* Hidden once picked, when the cell means "your pick" rather than a club
          and one clear state beats two half-signals. */}
      {!picked ? <ClubBar team={team} dim={spent} /> : null}

      <span
        className={`text-sm font-bold tracking-wide ${spent ? "line-through" : ""}`}
      >
        {team.abbr}
      </span>
      <span className="text-[10px] uppercase tracking-wide opacity-70">
        {pending ? "sending…" : team.name}
      </span>
    </button>
  );
}
