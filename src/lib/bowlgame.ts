/* COMMISH BOWL'S RULEBOOK: a whole game, around the plays.
 *
 * lib/bowlplay.ts runs one snap. This file is everything between snaps: the
 * coin toss, the score, the clock and when it stops, downs and distance, where
 * the ball goes after a touchback or a missed field goal, extra points and
 * two-point tries, safeties, halftime, overtime, and the computer's coach.
 *
 * THE RULES ARE THE NFL'S, AS OF 2026, WHERE A SMALL GAME CAN HOLD THEM:
 *
 *   Kickoffs from the 35 under the dynamic kickoff. A touchback is the 35, a
 *   kick short of the landing zone or out of bounds is the 40, and a kick that
 *   lands in the landing zone and is downed in the end zone is the 20.
 *   Punts: a touchback is the 20.
 *   Extra points are snapped from the 15, a 33-yard kick; two-point tries from
 *   the 2.
 *   A missed field goal goes over at the spot of the kick, or the 20.
 *   After a safety the team that gave it up free kicks from its own 20.
 *   Three timeouts a half. A two-minute warning in each half.
 *   Overtime is the regular season's since 2025: ten minutes, and both teams
 *   get the ball unless the defence scores on the first possession. After
 *   that, the next score wins, and a tie is a tie.
 *
 * WHAT IT SIMPLIFIES, said here rather than discovered: no penalties, no
 * challenges, no kneel-downs by the computer on anything but the final snaps,
 * and overtime runs as long as one of this game's quarters, up to ten minutes,
 * rather than always ten.
 *
 * TEAMS ARE 0 AND 1: 0 is the person, 1 is the computer. A play's frame is
 * whichever of them snaps or kicks; see `frameOf`.
 *
 * No React, no canvas, no Date, no Math.random: the dice are in the game.
 */

import {
  type DefCall,
  type OffCall,
  type PlayResult,
  xOfYard,
  yardOf,
} from "@/lib/bowlplay";
import {
  type Conditions,
  drawWind,
  EFFECTS,
  quarterSeconds,
  type Wind,
  windInFrame,
  windOnScreen,
} from "@/lib/conditions";
import { fieldGoalDistance, PAT_DISTANCE } from "@/lib/fieldgoal";
import { chance, roll, type Rng, seeded, weighted } from "@/lib/rng";
import { TEAMS } from "@/lib/nfl";

export type Team = 0 | 1;
export const HUMAN: Team = 0;
export const CPU: Team = 1;
export const rival = (t: Team): Team => (t === 0 ? 1 : 0);

/* ------------------------------------------------------------- the numbers */

export const TIMEOUTS = 3;
export const OT_TIMEOUTS = 2;
export const TWO_MINUTES = 120;
/** Seconds between snaps while the clock runs: a huddle and most of a play clock. */
export const RUNOFF = 28;
/** A team in a hurry at the end of a half. */
export const HURRY_RUNOFF = 12;
/** Out of bounds outside the final two minutes: the clock restarts at the ready. */
export const OOB_RUNOFF = 12;
export const KNEEL_RUNOFF = 40;
/** A field goal attempt from snap to whistle. */
export const FIELD_GOAL_SECONDS = 4;

export const KICKOFF_TEE = 35;
export const SAFETY_TEE = 20;
export const KICKOFF_TOUCHBACK = 35;
export const ZONE_TOUCHBACK = 20;
export const PUNT_TOUCHBACK = 20;
export const SHORT_KICK_SPOT = 40;
export const TWO_POINT_SPOT = 98;
export const MISSED_FG_FLOOR = 20;

/* ------------------------------------------------------------------ state */

export type Stage =
  | { kind: "toss" }
  | { kind: "choose" }
  | { kind: "kickoff"; kicker: Team; tee: number; afterSafety: boolean }
  | { kind: "scrimmage" }
  | { kind: "try"; team: Team }
  | { kind: "two"; team: Team }
  | { kind: "halftime" }
  | { kind: "overtime"; receiver: Team }
  | { kind: "final" };

export type Stats = {
  yards: [number, number];
  firstDowns: [number, number];
  turnovers: [number, number];
};

export type Game = {
  /** Indices into TEAMS: the person's club, then the computer's. */
  teams: [number, number];
  conditions: Conditions;
  quarterLength: number;
  score: [number, number];
  /** 1 to 4, and 5 for overtime. */
  quarter: number;
  clock: number;
  /** Whether the clock is running between plays. */
  running: boolean;
  /** Seconds that will come off before the next snap, if nobody stops it. */
  runoff: number;
  timeouts: [number, number];
  possession: Team;
  /** Yards from the possessing team's own goal line. */
  ballOn: number;
  down: number;
  /** The yard line that earns a first down, capped at the goal line. */
  firstDownAt: number;
  warned: boolean;
  openingReceiver: Team;
  stage: Stage;
  ot: { first: Team; possessions: number } | null;
  /** The prevailing wind, in miles an hour, as the person sees it in the first quarter. */
  wind: Wind;
  rng: Rng;
  /** Play by play, newest last, the most recent forty lines. */
  log: string[];
  /** Every line ever said, counting the ones that have dropped off `log`. A
   *  caller marks this before a snap and reads the lines since; marking the
   *  length of `log` stops working the moment it is full. */
  said: number;
  stats: Stats;
  /** Set when something worth a card happened between plays. */
  notice: string | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function newGame(conditions: Conditions, teams: [number, number], seed: number): Game {
  const rng = seeded(seed);
  const q = quarterSeconds(conditions.length);
  return {
    teams,
    conditions,
    quarterLength: q,
    score: [0, 0],
    quarter: 1,
    clock: q,
    running: false,
    runoff: 0,
    timeouts: [TIMEOUTS, TIMEOUTS],
    possession: HUMAN,
    ballOn: 25,
    down: 1,
    firstDownAt: 35,
    warned: false,
    openingReceiver: HUMAN,
    stage: { kind: "toss" },
    ot: null,
    wind: drawWind(rng, conditions.weather),
    rng,
    log: [],
    said: 0,
    stats: { yards: [0, 0], firstDowns: [0, 0], turnovers: [0, 0] },
    notice: null,
  };
}

export const abbr = (g: Game, t: Team): string => TEAMS[g.teams[t]].abbr;
export const clubName = (g: Game, t: Team): string => TEAMS[g.teams[t]].name.toUpperCase();

function say(g: Game, line: string): void {
  g.log.push(line);
  g.said += 1;
  if (g.log.length > 40) g.log.shift();
}

/** The lines said since `mark`, a value of `said` taken earlier. */
export function linesSince(g: Game, mark: number): string[] {
  const count = Math.max(0, Math.min(g.log.length, g.said - mark));
  return count === 0 ? [] : g.log.slice(-count);
}

/* ------------------------------------------------------------- the toss */

export type Call = "heads" | "tails";

/** The person calls it in the air. Returns what it landed on and whether
 *  they won. A computer that wins defers, as nearly every NFL team does, so
 *  the person receives the opening kickoff either way unless they choose to
 *  kick. */
export function callToss(g: Game, call: Call): { landed: Call; won: boolean } {
  const landed: Call = roll(g.rng) < 0.5 ? "heads" : "tails";
  const won = landed === call;
  if (won) {
    g.stage = { kind: "choose" };
  } else {
    g.openingReceiver = HUMAN;
    g.stage = { kind: "kickoff", kicker: CPU, tee: KICKOFF_TEE, afterSafety: false };
    say(g, `${abbr(g, CPU)} WON THE TOSS AND DEFERRED.`);
  }
  return { landed, won };
}

export function chooseOpening(g: Game, choice: "receive" | "kick"): void {
  g.openingReceiver = choice === "receive" ? HUMAN : CPU;
  g.stage = {
    kind: "kickoff",
    kicker: rival(g.openingReceiver),
    tee: KICKOFF_TEE,
    afterSafety: false,
  };
  say(g, `${abbr(g, HUMAN)} WON THE TOSS AND ${choice === "receive" ? "WILL RECEIVE" : "DEFERRED"}.`);
}

/* -------------------------------------------------------------- frames */

/** Which team is side 0, attacking +x, in the play this stage runs. */
export function frameOf(g: Game): Team {
  const s = g.stage;
  if (s.kind === "kickoff") return s.kicker;
  if (s.kind === "try" || s.kind === "two") return s.team;
  return g.possession;
}

/** The wind in a play's frame, in miles an hour. Teams change ends every
 *  quarter, and the computer's plays are drawn mirrored. */
export function windFor(g: Game, frame: Team): Wind {
  return windInFrame(windOnScreen(g.wind, g.quarter), frame === CPU);
}

/** The wind as the person sees it on screen this quarter. */
export const screenWind = (g: Game): Wind => windOnScreen(g.wind, g.quarter);

export const effects = (g: Game) => EFFECTS[g.conditions.weather];

/** A yard line the way a broadcast says it, from the possessing team's side. */
export function spotLabel(ballOn: number, team: Team, g: Game): string {
  const b = Math.round(ballOn);
  if (b === 50) return "50";
  return b < 50 ? `${abbr(g, team)} ${b}` : `${abbr(g, rival(team))} ${100 - b}`;
}

export const yardsToGo = (g: Game): number => Math.max(1, Math.ceil(g.firstDownAt - g.ballOn));
export const goalToGo = (g: Game): boolean => g.firstDownAt >= 100;

export function downLabel(g: Game): string {
  const ord = ["1ST", "2ND", "3RD", "4TH"][clamp(g.down, 1, 4) - 1];
  return `${ord} & ${goalToGo(g) ? "GOAL" : yardsToGo(g)}`;
}

export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function quarterLabel(q: number): string {
  return q >= 5 ? "OT" : ["1ST", "2ND", "3RD", "4TH"][q - 1];
}

/* ------------------------------------------------------------- the clock */

/** The final two minutes of either half, or any of overtime. */
export const lateInHalf = (g: Game): boolean =>
  g.quarter >= 5 || ((g.quarter === 2 || g.quarter === 4) && g.clock <= TWO_MINUTES);

/** Take seconds off, giving the two-minute warning on the way past it. The
 *  warning stops the clock at exactly 2:00 when it happens between plays. */
function tick(g: Game, seconds: number, betweenPlays: boolean): void {
  const before = g.clock;
  g.clock = Math.max(0, g.clock - seconds);
  const warnable =
    (g.quarter === 2 || g.quarter === 4) && g.quarterLength > TWO_MINUTES && !g.warned;
  if (warnable && before > TWO_MINUTES && g.clock <= TWO_MINUTES) {
    g.warned = true;
    g.running = false;
    g.runoff = 0;
    if (betweenPlays) g.clock = TWO_MINUTES;
    g.notice = "TWO-MINUTE WARNING";
    say(g, "TWO-MINUTE WARNING.");
  }
}

/** Run the clock between plays, before a snap. Returns false when the time
 *  ran out first, in which case the quarter is over and the stage has moved. */
export function beforeSnap(g: Game): boolean {
  if (g.running && g.runoff > 0) {
    tick(g, g.runoff, true);
    g.runoff = 0;
    if (g.clock <= 0) {
      endQuarter(g);
      return false;
    }
  }
  return true;
}

/** Whether a timeout would do anything for this team right now. */
export const canTimeout = (g: Game, t: Team): boolean =>
  g.timeouts[t] > 0 && g.running && g.runoff > 0 && g.stage.kind === "scrimmage" && g.clock > 0;

export function callTimeout(g: Game, t: Team): boolean {
  if (!canTimeout(g, t)) return false;
  g.timeouts[t] -= 1;
  g.running = false;
  g.runoff = 0;
  say(g, `TIMEOUT, ${abbr(g, t)}. ${g.timeouts[t]} LEFT.`);
  return true;
}

function hurrying(g: Game, offense: Team): boolean {
  if (!lateInHalf(g)) return false;
  if (g.quarter === 2) return true;
  return g.score[offense] <= g.score[rival(offense)];
}

/** After a play in which the ball stayed in play and in the same hands. */
function clockAfterPlay(g: Game, result: PlayResult, offense: Team): void {
  if (result.end === "incomplete") {
    g.running = false;
    g.runoff = 0;
    return;
  }
  if (result.end === "out") {
    if (lateInHalf(g)) {
      g.running = false;
      g.runoff = 0;
    } else {
      g.running = true;
      g.runoff = OOB_RUNOFF;
    }
    return;
  }
  g.running = true;
  g.runoff = result.kneel ? KNEEL_RUNOFF : hurrying(g, offense) ? HURRY_RUNOFF : RUNOFF;
}

function stopClock(g: Game): void {
  g.running = false;
  g.runoff = 0;
}

/* ------------------------------------------------------ quarters and ends */

function endQuarter(g: Game): void {
  stopClock(g);
  const q = g.quarter;
  if (q === 1 || q === 3) {
    g.quarter += 1;
    g.clock = g.quarterLength;
    g.notice = `END OF THE ${quarterLabel(q)} QUARTER`;
    say(g, `END OF THE ${quarterLabel(q)} QUARTER. TEAMS CHANGE ENDS.`);
    return;
  }
  if (q === 2) {
    g.stage = { kind: "halftime" };
    g.notice = "HALFTIME";
    say(g, "HALFTIME.");
    return;
  }
  if (q === 4) {
    if (g.score[0] === g.score[1]) {
      g.quarter = 5;
      g.clock = Math.min(600, g.quarterLength);
      g.timeouts = [OT_TIMEOUTS, OT_TIMEOUTS];
      const receiver: Team = chance(g.rng, 0.5) ? HUMAN : CPU;
      g.stage = { kind: "overtime", receiver };
      g.ot = { first: receiver, possessions: 0 };
      g.notice = "OVERTIME";
      say(g, `END OF REGULATION. OVERTIME: ${abbr(g, receiver)} WILL RECEIVE.`);
      return;
    }
    finalWhistle(g);
    return;
  }
  // Overtime ran out.
  finalWhistle(g);
}

function finalWhistle(g: Game): void {
  stopClock(g);
  g.stage = { kind: "final" };
  g.notice = "FINAL";
  say(g, `FINAL: ${abbr(g, HUMAN)} ${g.score[0]}, ${abbr(g, CPU)} ${g.score[1]}.`);
}

export function startSecondHalf(g: Game): void {
  g.quarter = 3;
  g.clock = g.quarterLength;
  g.timeouts = [TIMEOUTS, TIMEOUTS];
  g.warned = false;
  g.stage = {
    kind: "kickoff",
    kicker: g.openingReceiver,
    tee: KICKOFF_TEE,
    afterSafety: false,
  };
  g.notice = null;
}

export function startOvertime(g: Game): void {
  const s = g.stage;
  if (s.kind !== "overtime") return;
  g.stage = { kind: "kickoff", kicker: rival(s.receiver), tee: KICKOFF_TEE, afterSafety: false };
  g.notice = null;
}

export const winner = (g: Game): Team | "tie" =>
  g.score[0] === g.score[1] ? "tie" : g.score[0] > g.score[1] ? HUMAN : CPU;

/* OVERTIME. A possession ends in a score, a punt, a turnover, a missed field
 * goal or a turnover on downs. The defence scoring on the first possession
 * wins it. Once the first possession is over, any score that leaves somebody
 * ahead wins it, which covers both "the second team answered and passed them"
 * and sudden death afterwards. */
function overtimeAfter(g: Game, possessionEnded: boolean, scorer: Team | null, byDefence: boolean): boolean {
  if (g.quarter < 5 || !g.ot) return false;
  if (scorer !== null && byDefence && g.ot.possessions === 0) {
    finalWhistle(g);
    return true;
  }
  if (possessionEnded) g.ot.possessions += 1;
  const ahead = g.score[0] !== g.score[1];
  if (ahead && g.ot.possessions >= 2) {
    finalWhistle(g);
    return true;
  }
  return false;
}

/** A touchdown during a second or later overtime possession that already
 *  puts the scoring team ahead ends the game without a try. */
function overtimeTouchdownWins(g: Game, scorer: Team): boolean {
  if (g.quarter < 5 || !g.ot || g.ot.possessions < 1) return false;
  return g.score[scorer] > g.score[rival(scorer)];
}

/* ---------------------------------------------------------------- scoring */

function touchdown(g: Game, scorer: Team, byDefence: boolean, how: string): void {
  g.score[scorer] += 6;
  stopClock(g);
  g.notice = "TOUCHDOWN";
  say(g, `${how} TOUCHDOWN, ${abbr(g, scorer)}!`);
  if (g.quarter >= 5 && g.ot) {
    if (byDefence && g.ot.possessions === 0) {
      finalWhistle(g);
      return;
    }
    if (overtimeTouchdownWins(g, scorer)) {
      finalWhistle(g);
      return;
    }
  }
  g.stage = { kind: "try", team: scorer };
}

function safety(g: Game, conceding: Team): void {
  const scorer = rival(conceding);
  g.score[scorer] += 2;
  stopClock(g);
  g.notice = "SAFETY";
  say(g, `SAFETY! TWO POINTS, ${abbr(g, scorer)}.`);
  if (overtimeAfter(g, true, scorer, true)) return;
  g.stage = { kind: "kickoff", kicker: conceding, tee: SAFETY_TEE, afterSafety: true };
}

function giveBall(g: Game, team: Team, ballOn: number): void {
  g.possession = team;
  // Officials spot the ball on a yard, and so does the scoreboard.
  g.ballOn = clamp(Math.round(ballOn), 1, 99);
  g.down = 1;
  g.firstDownAt = Math.min(100, g.ballOn + 10);
  g.stage = { kind: "scrimmage" };
}

/** Where a result's dead-ball spot is, for a team. */
function spotFor(result: PlayResult, frame: Team, team: Team): number {
  const y = yardOf(result.x);
  return team === frame ? y : 100 - y;
}

/* ----------------------------------------------------------- applying plays */

function describeScrimmage(g: Game, r: PlayResult, gain: number, offense: Team): string {
  const who = abbr(g, offense);
  const yards = (n: number) =>
    n === 0 ? "NO GAIN" : n > 0 ? `${n} YARD${n === 1 ? "" : "S"}` : `A LOSS OF ${-n}`;
  if (r.kneel) return `${who} KNEELS.`;
  if (r.sacked) return `${who} QUARTERBACK SACKED FOR ${yards(gain)}.`;
  if (r.end === "incomplete") return `${who} PASS INCOMPLETE.`;
  if (r.caught) return `${who} PASS COMPLETE FOR ${yards(gain)}.`;
  if (r.scrambled) return `${who} QUARTERBACK SCRAMBLES FOR ${yards(gain)}.`;
  return `${who} RUN FOR ${yards(gain)}.`;
}

/** Apply a play from scrimmage, or a two-point try, run with the possessing
 *  team as side 0. */
export function applyScrimmage(g: Game, r: PlayResult): void {
  const offense = g.stage.kind === "two" ? g.stage.team : g.possession;
  const defence = rival(offense);
  g.notice = null;

  // A try is untimed, so it takes nothing off the clock.
  if (g.stage.kind === "two") {
    const made = r.end === "touchdown" && r.scorer === 0;
    if (made) g.score[offense] += 2;
    say(g, made ? `TWO-POINT TRY IS GOOD, ${abbr(g, offense)}.` : `TWO-POINT TRY FAILS.`);
    afterTry(g, offense);
    return;
  }
  tick(g, r.clockTicks / 30, false);

  if (r.end === "touchdown") {
    const scorer: Team = r.scorer === 0 ? offense : defence;
    if (scorer === offense) {
      g.stats.yards[offense] += Math.round(100 - g.ballOn);
      touchdown(g, offense, false, r.caught ? "PASS COMPLETE FOR A" : "RUN FOR A");
    } else {
      g.stats.turnovers[offense] += 1;
      touchdown(g, defence, true, r.turnover === "interception" ? "INTERCEPTION RETURNED FOR A" : "FUMBLE RETURNED FOR A");
    }
    return;
  }

  if (r.end === "safety") {
    // The ball carrier was down in his own end zone.
    safety(g, r.has === 0 ? offense : defence);
    return;
  }

  if (r.turnover) {
    g.stats.turnovers[offense] += 1;
    const spot = r.rule === "touchback" ? 20 : spotFor(r, offense, defence);
    say(
      g,
      r.turnover === "interception"
        ? `INTERCEPTED! ${abbr(g, defence)} BALL ON ${spotLabel(spot, defence, g)}.`
        : `FUMBLE! RECOVERED BY ${abbr(g, defence)} ON ${spotLabel(spot, defence, g)}.`,
    );
    stopClock(g);
    const ended = overtimeAfter(g, true, null, false);
    if (!ended) giveBall(g, defence, spot);
    if (g.clock <= 0 && g.stage.kind === "scrimmage") endQuarter(g);
    return;
  }

  const spot = r.end === "incomplete" ? g.ballOn : yardOf(r.x);
  const gain = Math.round(spot - g.ballOn);
  if (r.end !== "incomplete") g.stats.yards[offense] += gain;
  g.ballOn = clamp(Math.round(spot), 1, 99);
  say(g, describeScrimmage(g, r, gain, offense));

  if (g.ballOn >= g.firstDownAt) {
    g.down = 1;
    g.firstDownAt = Math.min(100, Math.round(g.ballOn) + 10);
    g.stats.firstDowns[offense] += 1;
    clockAfterPlay(g, r, offense);
    g.notice = "FIRST DOWN";
  } else if (g.down >= 4) {
    say(g, `TURNOVER ON DOWNS. ${abbr(g, defence)} BALL.`);
    stopClock(g);
    const ended = overtimeAfter(g, true, null, false);
    if (!ended) giveBall(g, defence, 100 - g.ballOn);
    g.notice = "TURNOVER ON DOWNS";
  } else {
    g.down += 1;
    clockAfterPlay(g, r, offense);
  }
  if (g.clock <= 0 && g.stage.kind === "scrimmage") endQuarter(g);
}

/** Apply a kickoff, run with the kicking team as side 0. */
export function applyKickoff(g: Game, r: PlayResult): void {
  const s = g.stage;
  if (s.kind !== "kickoff") return;
  const kicker = s.kicker;
  const receiver = rival(kicker);
  g.notice = null;
  tick(g, r.clockTicks / 30, false);

  if (r.end === "touchdown") {
    // A return touchdown is the receiving team scoring on its own possession,
    // in overtime as anywhere else.
    const scorer: Team = r.scorer === 0 ? kicker : receiver;
    touchdown(g, scorer, false, scorer === receiver ? "KICKOFF RETURNED FOR A" : "FUMBLE RECOVERED FOR A");
    return;
  }

  let team: Team = r.has === 0 ? kicker : receiver;
  let spot: number;
  switch (r.rule) {
    case "touchback":
      team = receiver;
      spot = KICKOFF_TOUCHBACK;
      say(g, `TOUCHBACK. ${abbr(g, receiver)} BALL ON ${spotLabel(spot, receiver, g)}.`);
      break;
    case "zone-touchback":
      team = receiver;
      spot = ZONE_TOUCHBACK;
      say(g, `DOWNED IN THE END ZONE. ${abbr(g, receiver)} BALL ON ${spotLabel(spot, receiver, g)}.`);
      break;
    case "short":
      team = receiver;
      spot = SHORT_KICK_SPOT;
      say(g, `SHORT OF THE LANDING ZONE. ${abbr(g, receiver)} BALL ON THE 40.`);
      break;
    case "out":
      team = receiver;
      spot = SHORT_KICK_SPOT;
      say(g, `KICKOFF OUT OF BOUNDS. ${abbr(g, receiver)} BALL ON THE 40.`);
      break;
    case "onside":
      spot = spotFor(r, kicker, team);
      say(
        g,
        team === kicker
          ? `ONSIDE KICK RECOVERED BY ${abbr(g, kicker)}!`
          : `ONSIDE KICK RECOVERED BY ${abbr(g, receiver)}.`,
      );
      break;
    default:
      spot = spotFor(r, kicker, team);
      if (r.turnover === "fumble") {
        say(g, `FUMBLE ON THE RETURN! ${abbr(g, team)} BALL ON ${spotLabel(spot, team, g)}.`);
      } else {
        say(g, `KICKOFF RETURNED TO ${spotLabel(spot, team, g)}.`);
      }
  }
  giveBall(g, team, spot);
  // The clock starts when the ball is touched, so a return leaves it running.
  if (r.clockTicks > 0 && !r.rule && r.end === "tackle") {
    g.running = true;
    g.runoff = hurrying(g, team) ? HURRY_RUNOFF : RUNOFF;
  } else {
    stopClock(g);
  }
  if (g.clock <= 0) endQuarter(g);
}

/** Apply a punt, run with the punting team as side 0. */
export function applyPunt(g: Game, r: PlayResult): void {
  const punter = g.possession;
  const receiver = rival(punter);
  g.notice = null;
  tick(g, r.clockTicks / 30, false);

  if (r.end === "touchdown") {
    const scorer: Team = r.scorer === 0 ? punter : receiver;
    if (g.quarter >= 5 && g.ot) g.ot.possessions += 1;
    touchdown(g, scorer, false, scorer === receiver ? "PUNT RETURNED FOR A" : "FUMBLE RECOVERED FOR A");
    return;
  }
  let team: Team = r.has === 0 ? punter : receiver;
  let spot: number;
  const land = r.kickLandX !== null ? Math.round(yardOf(r.kickLandX) - g.ballOn) : null;
  if (r.rule === "touchback") {
    team = receiver;
    spot = PUNT_TOUCHBACK;
    say(g, `PUNT INTO THE END ZONE. TOUCHBACK, ${abbr(g, receiver)} BALL ON ${spotLabel(spot, receiver, g)}.`);
  } else {
    spot = spotFor(r, punter, team);
    const kicked = land !== null ? `PUNT ${land} YARDS, ` : "PUNT, ";
    if (team === punter) say(g, `${kicked}MUFFED AND RECOVERED BY ${abbr(g, punter)}!`);
    else if (r.rule === "fair-catch") say(g, `${kicked}FAIR CATCH ON ${spotLabel(spot, team, g)}.`);
    else if (r.rule === "downed") say(g, `${kicked}DOWNED ON ${spotLabel(spot, team, g)}.`);
    else if (r.rule === "out") say(g, `${kicked}OUT OF BOUNDS ON ${spotLabel(spot, team, g)}.`);
    else say(g, `${kicked}RETURNED TO ${spotLabel(spot, team, g)}.`);
  }
  stopClock(g);
  const ended = overtimeAfter(g, true, null, false);
  if (!ended) giveBall(g, team, spot);
  if (g.clock <= 0 && g.stage.kind === "scrimmage") endQuarter(g);
}

/** Apply a field goal attempt from the current line of scrimmage. */
export function applyFieldGoal(g: Game, good: boolean): void {
  const kicker = g.possession;
  const other = rival(kicker);
  const distance = fieldGoalDistance(100 - g.ballOn);
  g.notice = null;
  tick(g, FIELD_GOAL_SECONDS, false);
  stopClock(g);
  if (good) {
    g.score[kicker] += 3;
    g.notice = "FIELD GOAL";
    say(g, `${distance}-YARD FIELD GOAL IS GOOD, ${abbr(g, kicker)}.`);
    if (overtimeAfter(g, true, kicker, false)) return;
    g.stage = { kind: "kickoff", kicker, tee: KICKOFF_TEE, afterSafety: false };
    if (g.clock <= 0) endQuarterAfterScore(g);
    return;
  }
  // Over at the spot of the kick, seven yards behind the line, or the 20.
  const spot = Math.max(MISSED_FG_FLOOR, 100 - (g.ballOn - 7));
  say(g, `${distance}-YARD FIELD GOAL IS NO GOOD. ${abbr(g, other)} BALL ON ${spotLabel(spot, other, g)}.`);
  if (overtimeAfter(g, true, null, false)) return;
  giveBall(g, other, spot);
  if (g.clock <= 0) endQuarter(g);
}

/** After a score with no time left the quarter still ends. At the end of the
 *  first or third the kickoff that was due stays due, and is kicked at the
 *  start of the next quarter; at the end of the second, halftime takes over
 *  and the second half opens with its own kickoff. */
function endQuarterAfterScore(g: Game): void {
  endQuarter(g);
}

export function chooseTry(g: Game, kind: "kick" | "two"): void {
  const s = g.stage;
  if (s.kind !== "try") return;
  if (kind === "two") {
    g.stage = { kind: "two", team: s.team };
  }
}

/** The extra point kick. */
export function applyExtraPoint(g: Game, good: boolean): void {
  const s = g.stage;
  if (s.kind !== "try") return;
  if (good) g.score[s.team] += 1;
  say(g, good ? `EXTRA POINT IS GOOD, ${abbr(g, s.team)}.` : `EXTRA POINT IS NO GOOD.`);
  afterTry(g, s.team);
}

function afterTry(g: Game, team: Team): void {
  g.notice = null;
  if (g.quarter >= 5 && g.ot) {
    if (overtimeAfter(g, true, team, false)) return;
  }
  g.stage = { kind: "kickoff", kicker: team, tee: KICKOFF_TEE, afterSafety: false };
  if (g.clock <= 0) endQuarterAfterScore(g);
}

/* ----------------------------------------------------------- the options */

/** Everything the person could call on this snap. */
export type Options = {
  fieldGoal: number | null;
  punt: boolean;
  kneel: boolean;
  timeout: boolean;
};

export function offenseOptions(g: Game): Options {
  const distance = fieldGoalDistance(100 - g.ballOn);
  return {
    // Anything a leg could conceivably reach. Whether to try is the coach's call.
    fieldGoal: distance <= 72 ? distance : null,
    punt: g.ballOn < 95,
    kneel: lateInHalf(g) && g.score[g.possession] >= g.score[rival(g.possession)],
    timeout: canTimeout(g, g.possession),
  };
}

export const patDistance = (): number => PAT_DISTANCE;

/** The ball on the line of scrimmage, in world x, for the play about to run. */
export function losX(g: Game): number {
  const s = g.stage;
  if (s.kind === "kickoff") return xOfYard(s.tee);
  if (s.kind === "two") return xOfYard(TWO_POINT_SPOT);
  return xOfYard(g.ballOn);
}

export function markerX(g: Game): number {
  if (g.stage.kind === "two") return xOfYard(100);
  return xOfYard(g.firstDownAt);
}

/* ----------------------------------------------------------- the computer */

export type CpuCall = OffCall | "punt" | "field-goal";

/* THE COMPUTER'S COACH. Not clever, and it should not be: it calls what a
 * sensible coach calls on each down and distance, with enough randomness that
 * a person cannot simply read it, and it manages the end of a half the way a
 * television audience expects. */
export function computerOffense(g: Game, team: Team = g.possession): CpuCall {
  const need = Math.ceil(g.firstDownAt - g.ballOn);
  const toGoal = 100 - g.ballOn;
  const fg = fieldGoalDistance(toGoal);
  const margin = g.score[team] - g.score[rival(team)];
  const late = lateInHalf(g);
  const fourthQuarterLate = g.quarter >= 4 && g.clock <= 300;

  // The last play of a half.
  if (late && g.clock <= 12 && (g.quarter === 2 || margin >= -3) && fg <= 58) return "field-goal";
  if (fourthQuarterLate && margin > 0 && g.clock <= 90 && g.timeouts[rival(team)] === 0) return "kneel";

  if (g.down === 4) {
    const mustScoreTouchdown = fourthQuarterLate && margin < -3;
    if (mustScoreTouchdown) return need <= 4 ? "run" : "short";
    if (fg <= 53) return "field-goal";
    if (need <= 1 && g.ballOn >= 40) return "run";
    if (need <= 3 && g.ballOn >= 60) return chance(g.rng, 0.5) ? "run" : "short";
    if (fourthQuarterLate && margin < 0 && g.ballOn >= 35) return need <= 5 ? "short" : "deep";
    return "punt";
  }

  const hurry = late && (g.quarter === 2 || margin <= 0);
  if (hurry) {
    return weighted(g.rng, [
      ["short", 55],
      ["deep", 35],
      ["run", 10],
    ]);
  }
  if (need <= 2) {
    return weighted(g.rng, [
      ["run", 62],
      ["short", 30],
      ["deep", 8],
    ]);
  }
  if (g.down === 3 && need >= 7) {
    return weighted(g.rng, [
      ["short", 45],
      ["deep", 42],
      ["run", 13],
    ]);
  }
  if (g.down === 1) {
    return weighted(g.rng, [
      ["run", 46],
      ["short", 36],
      ["deep", 18],
    ]);
  }
  return weighted(g.rng, [
    ["run", 36],
    ["short", 40],
    ["deep", 24],
  ]);
}

export function computerDefense(g: Game, team: Team = rival(g.possession)): DefCall {
  const need = Math.ceil(g.firstDownAt - g.ballOn);
  const margin = g.score[team] - g.score[rival(team)];
  if (lateInHalf(g) && margin > 0) {
    return weighted(g.rng, [
      ["cover", 60],
      ["run", 15],
      ["blitz", 25],
    ]);
  }
  if (need <= 2) {
    return weighted(g.rng, [
      ["run", 60],
      ["blitz", 28],
      ["cover", 12],
    ]);
  }
  if (g.down >= 3 && need >= 7) {
    return weighted(g.rng, [
      ["cover", 50],
      ["blitz", 36],
      ["run", 14],
    ]);
  }
  return weighted(g.rng, [
    ["run", 40],
    ["cover", 34],
    ["blitz", 26],
  ]);
}

/** Kick the extra point or go for two, from a simple chart: go for two when
 *  it turns a deficit of two into a tie or a deficit of one into a lead, late. */
export function computerTry(g: Game): "kick" | "two" {
  const s = g.stage;
  if (s.kind !== "try") return "kick";
  const margin = g.score[s.team] - g.score[rival(s.team)];
  if (g.quarter >= 4 && (margin === -2 || margin === -1 || margin === 5 || margin === -5)) return "two";
  return "kick";
}

export function computerOnside(g: Game): boolean {
  const s = g.stage;
  if (s.kind !== "kickoff" || s.afterSafety) return false;
  const margin = g.score[s.kicker] - g.score[rival(s.kicker)];
  return g.quarter === 4 && g.clock <= 150 && margin < 0 && margin >= -16;
}

/** Whether the computer, coaching `team`, calls a timeout before the next snap. */
export function computerTimeout(g: Game, team: Team = CPU): boolean {
  if (!canTimeout(g, team)) return false;
  const margin = g.score[team] - g.score[rival(team)];
  if (g.possession === team) {
    if (g.quarter === 2 && g.clock <= 70 && g.ballOn >= 45) return true;
    if (g.quarter >= 4 && g.clock <= 120 && margin <= 0) return true;
    return false;
  }
  // On defence: save time when behind late.
  return g.quarter >= 4 && g.clock <= 160 && margin < 0;
}
