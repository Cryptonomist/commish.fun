"use client";

/* THE SCOREBOARD, the first thing anybody looks for in a football game.
 *
 * Both clubs and their scores, the quarter and the clock, who has the ball,
 * timeouts left, down and distance and where the ball is, and the flag. Real
 * DOM, like every word in the arcade: a screen reader gets a scoreboard, not a
 * picture of one.
 *
 * The scores are in chalk. Gold is the colour of money on this site and a
 * scoreboard is not money, so the tempting yellow digits are not here.
 */

import { PixelArrow } from "@/components/ArcadeKit";
import {
  abbr,
  clockLabel,
  CPU,
  downLabel,
  type Game,
  HUMAN,
  quarterLabel,
  screenWind,
  spotLabel,
  type Team,
} from "@/lib/bowlgame";
import { headingOf, TIME_OPTIONS, WEATHER_OPTIONS, windMph } from "@/lib/conditions";
import { TEAMS } from "@/lib/nfl";

function Side({ g, team }: { g: Game; team: Team }) {
  const club = TEAMS[g.teams[team]];
  const hasBall =
    (g.stage.kind === "scrimmage" && g.possession === team) ||
    ((g.stage.kind === "try" || g.stage.kind === "two") && g.stage.team === team);
  return (
    <div className={`flex items-center gap-2 ${team === CPU ? "flex-row-reverse text-right" : ""}`}>
      <span
        aria-hidden="true"
        className="bevel h-7 w-2 shrink-0"
        style={{ background: club.lead, boxShadow: `inset 0 -3px 0 ${club.trim}` }}
      />
      <span className="flex flex-col">
        <span className="flex items-center gap-1.5 font-matrix text-[10px] leading-4 text-cream-dim">
          {team === CPU && hasBall ? <BallIcon /> : null}
          {club.abbr}
          {team === HUMAN && hasBall ? <BallIcon /> : null}
        </span>
        <span className={`flex gap-0.5 ${team === CPU ? "justify-end" : ""}`} aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              className="inline-block h-1 w-2"
              style={{ background: i < g.timeouts[team] ? "var(--color-chalk)" : "var(--color-rule)" }}
            />
          ))}
        </span>
      </span>
      <span className="font-matrix text-[22px] leading-7 text-chalk tabular-nums">{g.score[team]}</span>
    </div>
  );
}

function BallIcon() {
  return (
    <svg aria-hidden="true" width="9" height="6" viewBox="0 0 9 6" shapeRendering="crispEdges">
      <rect x="2" y="0" width="5" height="6" fill="#7A4A22" />
      <rect x="1" y="1" width="7" height="4" fill="#7A4A22" />
      <rect x="0" y="2" width="9" height="2" fill="#7A4A22" />
      <rect x="3" y="2" width="3" height="1" fill="currentColor" />
    </svg>
  );
}

export function BowlScoreboard({ g, tools }: { g: Game; tools?: React.ReactNode }) {
  const w = screenWind(g);
  const mph = windMph(w);
  const heading = headingOf(w.x, w.y);
  const weather = WEATHER_OPTIONS.find((o) => o.id === g.conditions.weather)?.label;
  const time = TIME_OPTIONS.find((o) => o.id === g.conditions.time)?.label;
  const showDowns = g.stage.kind === "scrimmage";
  const human = abbr(g, HUMAN);
  const cpu = abbr(g, CPU);

  const spoken = `${human} ${g.score[HUMAN]}, ${cpu} ${g.score[CPU]}. ${
    g.quarter >= 5 ? "Overtime" : `${quarterLabel(g.quarter).toLowerCase()} quarter`
  }, ${clockLabel(g.clock)} left.${
    showDowns ? ` ${abbr(g, g.possession)} ball, ${downLabel(g).toLowerCase()} on the ${spotLabel(g.ballOn, g.possession, g)}.` : ""
  }`;

  return (
    <div className="border-b-2 border-chalk bg-panel px-3 py-2">
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      <div aria-hidden="true" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side g={g} team={HUMAN} />
        <div className="flex flex-col items-center">
          <span className="font-matrix text-[16px] leading-5 text-chalk tabular-nums">{clockLabel(g.clock)}</span>
          <span className="font-matrix text-[9px] leading-4 text-cream-dim">
            {g.quarter >= 5 ? "OT" : `${quarterLabel(g.quarter)} QTR`}
          </span>
        </div>
        <Side g={g} team={CPU} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-rule pt-1.5 font-matrix text-[9px] leading-4">
        <span aria-hidden="true" className="text-chalk">
          {showDowns ? (
            <>
              {downLabel(g)} <span className="text-cream-dim">ON</span> {spotLabel(g.ballOn, g.possession, g)}
            </>
          ) : g.stage.kind === "try" || g.stage.kind === "two" ? (
            "EXTRA POINT TRY"
          ) : g.stage.kind === "kickoff" ? (
            "KICKOFF"
          ) : g.stage.kind === "halftime" ? (
            "HALFTIME"
          ) : g.stage.kind === "final" ? (
            "FINAL"
          ) : (
            "PREGAME"
          )}
        </span>
        <span className="flex items-center gap-2 text-cream-dim">
          <span aria-hidden="true">
            {weather} &middot; {time}
          </span>
          <span aria-hidden="true" className="flex items-center gap-1 text-chalk">
            WIND
            {heading === "calm" ? " CALM" : (
              <>
                <PixelArrow heading={heading} size={10} />
                {mph} MPH
              </>
            )}
          </span>
          {tools}
        </span>
      </div>
    </div>
  );
}
