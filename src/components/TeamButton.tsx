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

/* A bye is not a spent team and must not look like one. Spent means you used it
 * and it is gone for the season; bye means it is not playing this week and will
 * be pickable again next. They are both unavailable and that is where the
 * similarity ends, so the bye keeps its full name struck through nothing and
 * says what it is. */
export type TeamState = "available" | "picked" | "spent" | "bye";

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
  const bye = state === "bye";
  const dead = disabled || spent || bye;

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(team.i) : undefined}
      disabled={dead}
      aria-pressed={picked}
      aria-label={`${team.city} ${team.name}${
        spent ? ", already used this season" : bye ? ", on a bye this week" : ""
      }`}
      /* THE TILE IS THE CLUB'S COLOUR NOW, not a dark card with a stripe on it.
         That only works because the label carries a panel-coloured outline, so
         the pair the eye resolves is chalk on panel at 17.92:1 over any of the
         thirty-two leads. Without the outline this would be a legibility
         lottery decided by whichever club you happened to support. */
      style={
        picked || spent || bye ? undefined : { background: team.lead }
      }
      className={[
        "group relative flex h-16 w-full flex-col items-center justify-center gap-0.5",
        "overflow-hidden text-center",
        "transition-transform duration-75 active:translate-x-[2px] active:translate-y-[2px]",
        picked
          ? "bg-action text-panel bevel-in"
          : spent || bye
            ? /* Dither, not opacity. The label keeps full contrast and the
                 unavailability is carried by the checkerboard, the
                 strikethrough and the cursor. */
              "bg-panel dither bevel"
            : "bevel hover:brightness-110",
        dead ? "cursor-not-allowed" : "",
      ].join(" ")}
    >
      {/* Hidden once picked, when the cell means "your pick" rather than a club
          and one clear state beats two half-signals. On an available tile the
          lead colour is now the whole background, so the bar carries only the
          trim, which is what stops thirty-two tiles reading as thirty-two
          flags. */}
      {!picked && !spent && !bye ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[4px]"
          style={{ background: team.trim }}
        />
      ) : null}

      {/* The abbreviation is a thing you RECOGNISE, so it wears the matrix
          face. Locked to 12px with no tracking: Press Start 2P is drawn on an
          8px em, and a fractional size or any letter-spacing breaks the grid
          it is built on. */}
      <span
        className={`font-matrix text-[12px] leading-4 ${
          picked ? "" : "tile-label"
        } ${spent ? "line-through" : ""}`}
      >
        {team.abbr}
      </span>
      {/* The club name is LANGUAGE, so it stays in the text face. That is the
          boundary the whole direction rests on, and it would be easiest to get
          wrong right here, two lines apart from its opposite.

          Full strength, never dimmed: on a spent tile the dither carries the
          state and the words stay readable. */}
      <span
        className={`text-[10px] uppercase tracking-wide ${
          picked ? "text-panel" : "tile-label"
        }`}
      >
        {pending ? "sending…" : bye ? "BYE" : team.name}
      </span>
    </button>
  );
}
