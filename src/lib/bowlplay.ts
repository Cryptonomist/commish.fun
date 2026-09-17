/* COMMISH BOWL'S PLAYS: one snap, from the whistle to the whistle.
 *
 * lib/bowl.ts is the chase at the heart of the game, a runner against seven
 * pursuers, and it is kept exactly as tuned: its geometry, its blocking and its
 * angle-limited pursuit are what every play here is built on. This file puts a
 * football game around it. A quarterback who throws, receivers who run routes,
 * defenders who cover them, and the kicking game: kickoffs under the 2026
 * rules, punts, returns, fair catches and onside kicks.
 *
 * ONE FRAME FOR EVERY PLAY. The team that snaps or kicks the ball attacks +x,
 * always, and is side 0. The other team is side 1 and attacks -x. The game
 * above this decides which real team that is and the component mirrors the
 * picture when it is the computer's, so the person holding the controls always
 * runs left to right. Nothing in here knows which side is human except through
 * `human`, which says which side a person is steering, or null for a play the
 * computer runs on both sides, which is what the tests do.
 *
 * Same rules as the rest of the arcade: no React, no canvas, no window, no
 * Math.random. The dice are a seeded generator inside the play.
 */

import {
  body,
  type Body,
  BOTTOM,
  clampY,
  GOAL,
  moveToward,
  OWN_GOAL,
  SPIN_TICKS,
  TOP,
  touching,
  TUNING,
  WORLD,
  YARD,
} from "@/lib/bowl";
import type { Effects, Wind } from "@/lib/conditions";
import { between, chance, normal, type Rng, seeded } from "@/lib/rng";

/* ---------------------------------------------------------------- the frame */

export const MID = Math.round((TOP + BOTTOM) / 2);

/** Logical pixels per yard across the field. The picture is squashed the way
 *  every console football game of the era was: a yard is six pixels along the
 *  field and under three across it. */
export const ACROSS = (BOTTOM - TOP) / 53.33;

export type Side = 0 | 1;
export const dirOf = (s: Side): 1 | -1 => (s === 0 ? 1 : -1);
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

/** Yards from side 0's goal line to a world x. */
export const yardOf = (x: number): number => (x - OWN_GOAL) / YARD;
export const xOfYard = (yard: number): number => OWN_GOAL + yard * YARD;

/* ------------------------------------------------------------------ tuning */

/* THE BALANCE NUMBERS, in one object for the same reason bowl.ts gives: they
 * come out of `.probe/bowlplay.ts`, which plays every call against every call
 * a few hundred times, and the next person to touch them will want to do the
 * same. The chase units are bowl.ts's own. */
export const TUNE = {
  run: TUNING.runSpeed,
  cpuRun: 2.1,
  receiver: 1.9,
  qb: 1.5,
  lineman: 1.45,
  blocker: 1.75,
  returnBlocker: 1.8,
  humanDefender: 1.82,
  blockHold: TUNING.blockHold,
  blockSlow: TUNING.blockSlow,
  spinBoost: TUNING.spinBoost,
  jukeBoost: 1.45,
  jukeTicks: 8,
  dl: { speed: 0.95, lead: 2, turn: 0.1 },
  lb: { speed: 1.44, lead: 4, turn: 0.17 },
  /* NEARLY AS FAST AS A RECEIVER, AND WORSE AT TURNING. A back slower than
   * the man he covers never covers him, and every pass became a touchdown in
   * the first probe run. Near-equal speed with a wider turn means a straight
   * go route is contested and a sharp cut still buys separation, which is how
   * route running works. */
  db: { speed: 1.9, lead: 6, turn: 0.2 },
  /* THE LAST MAN, and the reason a completed pass is not a touchdown. The
   * first version of this defence had nobody deep, and a five-yard catch with
   * both backs trailing was a sixty-yard run every time: the receiver and the
   * men chasing him ran at nearly the same speed in the same direction. A
   * safety in front of the ball turns that race into an angle. Bowl.ts's own
   * safety numbers, which were tuned to be the one pursuer a runner cannot
   * simply outrun. */
  safety: { speed: 1.8, lead: 9, turn: 0.24 },
  /** Ticks a receiver takes to gather a catch before he is running again. */
  gather: 8,
  cover: { speed: 1.46, lead: 7, turn: 0.1 },
  gunner: { speed: 1.66, lead: 8, turn: 0.2 },
  passSpeed: 4.4,
  throwError: 0.03,
  reach: 10,
  interception: 0.16,
  humanInterception: 0.5,
};

/** A play that runs longer than thirty seconds has gone wrong somewhere, and
 *  a game must not hang on it. */
export const MAX_TICKS = 900;

/* ------------------------------------------------------------------- types */

export type Role =
  | "qb"
  | "rb"
  | "wr"
  | "ol"
  | "dl"
  | "lb"
  | "db"
  | "s"
  | "k"
  | "p"
  | "cov"
  | "ret"
  | "blk";

export type Actor = Body & {
  team: Side;
  role: Role;
  /** Route waypoints, in world pixels. */
  route: { x: number; y: number }[];
  leg: number;
  /** The receiver this defender covers, or -1. */
  cover: number;
  /** The receiver's number a person throws to, 1 to 3, or 0. */
  tag: number;
  /** Ticks of a juke or a spin left. */
  burst: number;
};

export type OffCall = "run" | "short" | "deep" | "kneel";
export type DefCall = "run" | "cover" | "blitz";
export type PlayType = "scrimmage" | "kickoff" | "onside" | "punt";

export type Flight = {
  kind: "pass" | "kick";
  x: number;
  y: number;
  /** Height, in pixels of lift on screen. Drawn, not simulated. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  /** Where a pass is aimed, and at whom. */
  tx: number;
  ty: number;
  target: number;
  age: number;
  /** Ticks until a pass arrives. */
  eta: number;
  /** Where a kick will come down, worked out at the kick. */
  landX: number;
  landY: number;
  bounces: number;
  rolling: boolean;
  /** How far a rolling onside kick has travelled, in yards. */
  travelled: number;
};

/** A placement rule the game layer turns into a yard line. */
export type KickRule =
  | "touchback" // in the end zone: the 35 on a kickoff, the 20 on a punt
  | "zone-touchback" // landed in the landing zone and downed in the end zone: the 20
  | "short" // a kickoff that did not reach the landing zone: the 40
  | "out" // out of bounds: the 40 on a kickoff, the spot on a punt
  | "fair-catch"
  | "downed"
  | "onside";

export type PlayEnd = "tackle" | "out" | "incomplete" | "touchdown" | "safety" | "dead";

export type PlayResult = {
  end: PlayEnd;
  /** Which side has the ball when it is dead. */
  has: Side;
  /** Where the ball is dead, in world x. Meaningless for placement rules. */
  x: number;
  rule: KickRule | null;
  scorer: Side | null;
  turnover: "interception" | "fumble" | null;
  thrown: boolean;
  caught: boolean;
  sacked: boolean;
  scrambled: boolean;
  kneel: boolean;
  /** The number of the receiver a pass went to, 0 for none. */
  receiver: number;
  catchX: number | null;
  turnoverX: number | null;
  kickLandX: number | null;
  /** Ticks from the snap. */
  ticks: number;
  /** Ticks the game clock ran: a kickoff's flight does not count. */
  clockTicks: number;
};

/** A person's hands on the controls for one tick. */
export type Control = {
  dx: number;
  dy: number;
  /** Space: spin, throw to the lit receiver, switch defender, fair catch. */
  action: boolean;
  /** A number key: throw to that receiver. */
  throwTo: number;
  /** A tap on a player: take control of him, or throw to him. */
  pick: number;
};

export const NO_CONTROL: Control = { dx: 0, dy: 0, action: false, throwTo: 0, pick: -1 };

/** A kickoff or punt as the meters hand it over: power 0..1, accuracy -1..1,
 *  aim in degrees either side of straight downfield. */
export type KickCall = { power: number; accuracy: number; aim: number };

export type PlayEvent =
  | "snap"
  | "throw"
  | "catch"
  | "incomplete"
  | "interception"
  | "sack"
  | "tackle"
  | "fumble"
  | "touchdown"
  | "safety"
  | "kick"
  | "land"
  | "fair-catch"
  | "spin"
  | "out";

export type Play = {
  type: PlayType;
  off: OffCall;
  def: DefCall;
  actors: Actor[];
  carrier: number;
  flight: Flight | null;
  /** The line of scrimmage, or the tee. */
  los: number;
  /** The first-down marker, for the picture. */
  marker: number;
  tick: number;
  /** The tick the game clock started. */
  clockFrom: number;
  human: number;
  humanSide: Side | null;
  fx: Effects;
  /** Miles an hour, in this play's frame. */
  wind: Wind;
  rng: Rng;
  kick: KickCall | null;
  spinUsed: boolean;
  jukeUsed: boolean;
  thrown: boolean;
  caught: boolean;
  crossed: boolean;
  kicked: boolean;
  /** Nobody moves until a kickoff lands or is caught. */
  frozen: boolean;
  fairCatch: boolean;
  /** The carrier got the ball on a kick or an interception, so being tackled
   *  in his own end zone is a touchback rather than a safety. */
  returning: boolean;
  turnover: "interception" | "fumble" | null;
  targetTag: number;
  catchX: number | null;
  turnoverX: number | null;
  kickLandX: number | null;
  /** The receiver Space would throw to right now, or -1. */
  lit: number;
  events: PlayEvent[];
  result: PlayResult | null;
  /** Scratch: defenders already taken by a blocker this tick. */
  taken: Set<number>;
  /** Which way the computer's ball carrier leans this play, in pixels of
   *  preference toward the bottom sideline. */
  lean: number;
  /** The tick a rusher beats his block, and who he is once he has. */
  freeAt: number;
  freeRusher: number;
};

/* ---------------------------------------------------------------- builders */

function actor(
  team: Side,
  role: Role,
  x: number,
  y: number,
  speed: number,
  lead = 0,
  turn = 1,
): Actor {
  return {
    ...body(x, clampY(y), speed, lead, turn),
    team,
    role,
    route: [],
    leg: 0,
    cover: -1,
    tag: 0,
    burst: 0,
  };
}

function basePlay(
  type: PlayType,
  actors: Actor[],
  los: number,
  o: { human: Side | null; fx: Effects; wind: Wind; seed: number },
): Play {
  return {
    type,
    off: "run",
    def: "run",
    actors,
    carrier: -1,
    flight: null,
    los,
    marker: los,
    tick: 0,
    clockFrom: 0,
    human: -1,
    humanSide: o.human,
    fx: o.fx,
    wind: o.wind,
    rng: seeded(o.seed),
    kick: null,
    spinUsed: false,
    jukeUsed: false,
    thrown: false,
    caught: false,
    crossed: false,
    kicked: false,
    frozen: false,
    fairCatch: false,
    returning: false,
    turnover: null,
    targetTag: 0,
    catchX: null,
    turnoverX: null,
    kickLandX: null,
    lit: -1,
    events: [],
    result: null,
    taken: new Set(),
    lean: 0,
    freeAt: Infinity,
    freeRusher: -1,
  };
}

export type ScrimmageOptions = {
  los: number;
  marker: number;
  off: OffCall;
  def: DefCall;
  human: Side | null;
  fx: Effects;
  wind: Wind;
  seed: number;
};

/* A PLAY FROM SCRIMMAGE. Seven on offence and eight on defence, which is about
 * what Tecmo fitted on a screen and what fits on this one:
 *
 *   OFFENCE  0 quarterback, 1 running back, 2 and 3 wide receivers, 4 to 6 line
 *   DEFENCE  7 to 9 line, 10 and 11 linebackers, 12 and 13 corners, 14 safety
 *
 * The extra defender is the safety, and he is what the defence needed: see
 * TUNE.safety.
 *
 * The indices are fixed, which is what lets a test or the component name a
 * player without searching for him.
 *
 * WHERE THE DEFENCE STANDS IS THE CALL. A run stop walks the linebackers and
 * the backs up close; coverage drops them deep; a blitz puts both linebackers
 * on the edges ready to go. Each is strong against one thing and weak against
 * another, which is the whole of play-calling. */
export function scrimmage(o: ScrimmageOptions): Play {
  const { los } = o;
  const pass = o.off === "short" || o.off === "deep";
  const A: Actor[] = [];

  /* THE SPACING IS THE GAME, as it was in bowl.ts. A defensive line standing
   * a yard off the ball stuffed every run the first probe ran, because the
   * chase needs room to be a chase. So the fronts stand a few yards apart, the
   * way a console game has always cheated them, and the line of scrimmage is
   * the painted line between them. */
  /* bowl.ts's own geometry, measured from the ball carrier: blockers twenty
   * pixels in front of him and the line forty-two, spread wide enough that
   * there are gaps to pick. That spacing is what its probe tuned, and a line
   * standing close enough to touch the back as he took the handoff stuffed
   * every run this file's probe ran. */
  A.push(actor(0, "qb", los - (pass ? 18 : 10), MID, TUNE.qb));
  A.push(actor(0, "rb", los - 22, pass ? MID + 24 : MID, TUNE.run));
  A.push(actor(0, "wr", los - 3, MID - 60, TUNE.receiver));
  A.push(actor(0, "wr", los - 3, MID + 60, TUNE.receiver));
  for (const dy of [-33, 0, 33]) A.push(actor(0, "ol", los - 2, MID + dy, TUNE.lineman, 0, 0.7));

  for (const dy of [-48, 0, 48]) {
    A.push(actor(1, "dl", los + 20, MID + dy, TUNE.dl.speed, TUNE.dl.lead, TUNE.dl.turn));
  }
  const lbAhead = o.def === "run" ? [58, 66] : o.def === "cover" ? [84, 92] : [24, 24];
  const lbDy = o.def === "blitz" ? [-40, 34] : [-30, 22];
  for (let i = 0; i < 2; i++) {
    A.push(actor(1, "lb", los + lbAhead[i], MID + lbDy[i], TUNE.lb.speed, TUNE.lb.lead, TUNE.lb.turn));
  }
  const dbAhead = o.def === "cover" ? 70 : o.def === "run" ? 36 : 44;
  for (const dy of [-58, 58]) {
    A.push(actor(1, "db", los + dbAhead, MID + dy, TUNE.db.speed, TUNE.db.lead, TUNE.db.turn));
  }
  const deep = o.def === "cover" ? 180 : o.def === "run" ? 150 : 160;
  A.push(actor(1, "s", los + deep, MID + 6, TUNE.safety.speed, TUNE.safety.lead, TUNE.safety.turn));
  A[12].cover = 2;
  A[13].cover = 3;
  if (o.def === "cover") A[11].cover = 1; // a linebacker spies the back

  const route = (a: Actor, pts: [number, number][]) => {
    a.route = pts.map(([dx, dy]) => ({ x: a.x + dx, y: clampY(a.y + dy) }));
  };
  if (o.off === "short") {
    route(A[2], [[18, 0], [70, 34], [230, 50]]); // a slant from the top
    route(A[3], [[26, 0], [40, 30], [220, 34]]); // a quick out along the bottom
    route(A[1], [[10, -22], [50, -40], [220, -40]]); // the back swings into the flat
    A[2].tag = 1;
    A[3].tag = 2;
    A[1].tag = 3;
  } else if (o.off === "deep") {
    route(A[2], [[440, 6]]); // a go route
    route(A[3], [[72, 0], [440, -74]]); // a post
    A[2].tag = 1;
    A[3].tag = 2;
  }

  const p = basePlay("scrimmage", A, los, o);
  p.off = o.off;
  p.def = o.def;
  /* NO TWO SNAPS ALIKE. Everybody lines up a step or two off his mark and the
   * computer's ball carrier favours one side a little, both from the play's
   * own dice. Without it the same call against the same call produced the same
   * yardage every time, which the probe reported as a median equal to a mean
   * and a person would have noticed by the third run up the middle. */
  for (const a of A) {
    a.x += between(p.rng, -2, 2);
    a.y = clampY(a.y + between(p.rng, -4, 4));
  }
  p.lean = between(p.rng, -12, 12);

  /* SOMEBODY ALWAYS GETS THROUGH, EVENTUALLY, and when is the defensive call.
   *
   * Blocking in this game is a chase rule, and chase rules are good at holding
   * a man up and bad at letting him win: the probe traced five blitzers held at
   * the line for forty ticks and found no sacks at all in two thousand drop-
   * backs. So the moment a rusher beats his man is drawn from the call, and
   * from then on he runs free. A blitz gets there fast, a run stop takes its
   * time, coverage rushes four and waits. What happens next is still the play:
   * a quarterback who has thrown it is not sacked, and a back who has cut away
   * is not tackled for a loss. */
  if (o.off !== "kneel") {
    const passing = o.off === "short" || o.off === "deep";
    const [mean, spread] = passing
      ? o.def === "blitz"
        ? [14, 6]
        : o.def === "run"
          ? [38, 10]
          : [54, 12]
      : o.def === "blitz"
        ? [11, 4]
        : o.def === "run"
          ? [22, 6]
          : [60, 10];
    p.freeAt = Math.max(4, Math.round(mean + normal(p.rng) * spread));
  }
  p.marker = o.marker;
  p.carrier = pass || o.off === "kneel" ? 0 : 1;
  if (o.human === 0) p.human = p.carrier;
  else if (o.human === 1) p.human = 10;
  p.events.push("snap");
  return p;
}

export type KickoffOptions = {
  /** World x of the tee: the kicking team's 35, or its 20 after a safety. */
  tee: number;
  onside: boolean;
  human: Side | null;
  fx: Effects;
  wind: Wind;
  seed: number;
};

/* A KICKOFF, UNDER THE DYNAMIC KICKOFF RULES THE LEAGUE HAS USED SINCE 2024.
 *
 * The coverage team lines up twenty-five yards in front of the tee, at the
 * receiving team's forty, and the receiving team's front line five yards
 * beyond them. Nobody but the kicker and the returner may move until the ball
 * lands or is caught. That rule is why these formations can stand this close,
 * and it is why the chase starts where the ball comes down.
 *
 *   KICKING    0 kicker, 1 to 7 coverage
 *   RECEIVING  8 to 12 front line, 13 and 14 the setup zone, 15 the returner */
export function kickoff(o: KickoffOptions): Play {
  const { tee } = o;
  const A: Actor[] = [];
  A.push(actor(0, "k", tee - 14, MID, 1.2));
  const line = tee + 25 * YARD;
  for (const dy of [-66, -44, -22, 0, 22, 44, 66]) {
    A.push(actor(0, "cov", line - 6, MID + dy, TUNE.cover.speed, TUNE.cover.lead, TUNE.cover.turn));
  }
  for (const dy of [-60, -30, 0, 30, 60]) {
    A.push(actor(1, "blk", Math.min(GOAL - 60, line + 5 * YARD), MID + dy, TUNE.returnBlocker, 0, 0.7));
  }
  for (const dy of [-28, 28]) {
    A.push(actor(1, "blk", Math.min(GOAL - 40, line + 10 * YARD), MID + dy, TUNE.returnBlocker, 0, 0.7));
  }
  A.push(actor(1, "ret", GOAL - 5 * YARD, MID - 8, TUNE.run));

  const p = basePlay(o.onside ? "onside" : "kickoff", A, tee, o);
  p.frozen = true;
  if (o.human === 0) p.human = 4;
  else if (o.human === 1) p.human = 15;
  return p;
}

export type PuntOptions = {
  los: number;
  human: Side | null;
  fx: Effects;
  wind: Wind;
  seed: number;
};

/* A PUNT. The punter fifteen yards deep, a line of five in front of him, two
 * gunners split wide who leave at the snap, and on the other side a rush, two
 * players to hold up the gunners, and a returner where the ball should come
 * down.
 *
 *   PUNTING    0 punter, 1 to 5 line, 6 and 7 gunners
 *   RECEIVING  8 to 12 rush, 13 and 14 jammers, 15 the returner */
export function punt(o: PuntOptions): Play {
  const { los } = o;
  const A: Actor[] = [];
  A.push(actor(0, "p", los - 14 * YARD, MID, 1.2));
  for (const dy of [-32, -16, 0, 16, 32]) A.push(actor(0, "ol", los - 3, MID + dy, TUNE.lineman, 0, 0.7));
  for (const dy of [-64, 64]) {
    A.push(actor(0, "cov", los - 3, MID + dy, TUNE.gunner.speed, TUNE.gunner.lead, TUNE.gunner.turn));
  }
  for (const dy of [-36, -18, 0, 18, 36]) {
    A.push(actor(1, "dl", los + 7, MID + dy, TUNE.dl.speed, TUNE.dl.lead, TUNE.dl.turn));
  }
  for (const dy of [-58, 58]) A.push(actor(1, "blk", los + 9, MID + dy, TUNE.returnBlocker, 0, 0.7));
  A.push(actor(1, "ret", Math.min(GOAL - 3 * YARD, los + 42 * YARD), MID, TUNE.run));

  const p = basePlay("punt", A, los, o);
  p.carrier = 0;
  if (o.human === 0) p.human = 6;
  else if (o.human === 1) p.human = 15;
  p.events.push("snap");
  return p;
}

/* ---------------------------------------------------------------- movement */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Move straight at a direction with no turning limit: how a person steers,
 *  and how a route runner cuts. Velocity is kept even when a sideline clamps
 *  the position, because a runner still pushing at the paint is going out. */
function moveBy(a: Actor, dx: number, dy: number, speed: number): void {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    a.vx = 0;
    a.vy = 0;
    return;
  }
  a.vx = (dx / len) * speed;
  a.vy = (dy / len) * speed;
  a.x = clamp(a.x + a.vx, 2, WORLD - 10);
  a.y = clampY(a.y + a.vy);
}

const centre = (a: Actor) => ({ x: a.x + 4, y: a.y + 8 });

function speedOf(p: Play, a: Actor, base = a.speed): number {
  return base * p.fx.footing * (a.slowed > 0 ? TUNE.blockSlow : 1);
}

function nearestFoe(p: Play, a: Actor): { index: number; dist: number } {
  let index = -1;
  let dist = Infinity;
  p.actors.forEach((o, i) => {
    if (o.team === a.team) return;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < dist) {
      dist = d;
      index = i;
    }
  });
  return { index, dist };
}

/** The angle-limited chase from bowl.ts: each man leads the ball carrier by
 *  his own amount, with a wobble so seven of them do not move as one. */
function pursue(p: Play, d: Actor, i: number, c: Actor, boost = 1): void {
  const wobble = Math.sin((p.tick + i * 7) / 9) * 2;
  /* A PASS RUSH FIGHTS THROUGH A BLOCK; A RUN BLOCK BURIES A MAN. The probe
   * traced five blitzers held at the line of scrimmage for forty ticks by four
   * blockers and not one sack in two thousand drop-backs, because a man being
   * pass-blocked was slowed exactly as much as one being run-blocked. Pass
   * protection only has to last as long as the quarterback's read, and it
   * loses ground doing it. */
  const rushing = c.role === "qb" && !p.thrown && !p.crossed;
  const slowed = d.slowed > 0 ? (rushing ? 0.55 : TUNE.blockSlow) : 1;
  moveToward(
    d,
    c.x + c.vx * d.lead,
    clampY(c.y + c.vy * d.lead + wobble),
    d.speed * p.fx.footing * slowed * boost,
  );
}

/* BLOCKING, as bowl.ts does it: pick the biggest threat to the ball carrier
 * that nobody else has, and stay on him until he is beaten or irrelevant. A
 * block that re-picks every tick is two blockers swapping the same man. */
function block(p: Play, b: Actor, ref: Actor): void {
  const dir = dirOf(ref.team);
  const held = b.mark >= 0 ? p.actors[b.mark] : undefined;
  const stale =
    !held ||
    held.team === b.team ||
    p.taken.has(b.mark) ||
    dir * (held.x - ref.x) < -14 ||
    Math.hypot(held.x - ref.x, held.y - ref.y) > 90;
  if (stale) {
    let pick = -1;
    let nearest = Infinity;
    p.actors.forEach((d, i) => {
      if (d.team === b.team || p.taken.has(i)) return;
      if (dir * (d.x - ref.x) < -4) return;
      const dist = Math.hypot(d.x - ref.x, d.y - ref.y);
      if (dist < nearest) {
        nearest = dist;
        pick = i;
      }
    });
    b.mark = pick;
  }
  if (b.mark < 0) {
    moveToward(b, ref.x + dir * 24, ref.y, speedOf(p, b));
    return;
  }
  p.taken.add(b.mark);
  const t = p.actors[b.mark];
  moveToward(b, t.x, t.y, speedOf(p, b));
  if (touching(b, t)) t.slowed = TUNE.blockHold;
}

function runRoute(p: Play, r: Actor): void {
  const wp = r.route[r.leg];
  const speed = speedOf(p, r);
  if (!wp) {
    moveBy(r, dirOf(r.team), 0, speed);
    return;
  }
  moveBy(r, wp.x - r.x, wp.y - r.y, speed);
  if (Math.hypot(wp.x - r.x, wp.y - r.y) < 5) r.leg += 1;
}

/** Man coverage: stay on the receiver, `cushion` pixels on the downfield side
 *  of him and `lag` ticks behind where he is going. */
function coverMan(p: Play, d: Actor, r: Actor, cushion: number, lag: number): void {
  const dir = dirOf(r.team);
  moveToward(d, r.x + r.vx * lag + dir * cushion, clampY(r.y + r.vy * lag), speedOf(p, d));
}

/* THE COMPUTER'S BALL CARRIER: find the widest lane among the defenders ahead
 * and run at it. The same policy `.probe/probe.ts` used to balance the chase,
 * which is exactly why it plays the chase fairly. */
function laneFor(p: Play, c: Actor): [number, number] {
  const dir = dirOf(c.team);
  let bestY = c.y;
  let bestScore = -Infinity;
  for (let y = TOP + 6; y <= BOTTOM - 6; y += 3) {
    let nearest = 90;
    for (const f of p.actors) {
      if (f.team === c.team) continue;
      const ahead = dir * (f.x - c.x);
      if (ahead < -6 || ahead > 120) continue;
      nearest = Math.min(nearest, Math.hypot((f.x - c.x) * 0.5, f.y - y));
    }
    const score = nearest - Math.abs(y - c.y - p.lean) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  /* NEVER MORE THAN ABOUT FORTY DEGREES OFF STRAIGHT. Steering at a lane in
   * proportion to how far away it is sent the first version of this runner
   * straight across the field toward a gap on the far side, gaining nothing,
   * and every run in the probe lost a yard. A back runs downhill and bends. */
  return [dir, clamp((bestY - c.y) / 10, -0.85, 0.85)];
}

/* ------------------------------------------------------------------- the ball */

/* KICKS FROM ABOVE. A kickoff or a punt is a ball flying downfield with a
 * height drawn as lift and a shadow, pushed by the wind along the field and
 * across it, and hooked by a mishit. Distance and hang time come off the power
 * meter; the weather's carry shortens both. */
export const KICKOFF_YARDS = { min: 42, range: 34 };
export const PUNT_YARDS = { min: 30, range: 32 };
const Z_GRAVITY = 0.08;
const WIND_ALONG = 0.00025; // px per tick squared, per mph
const WIND_ACROSS = 0.000076;
const HOOK = 0.004;

function launchKick(p: Play, fromX: number, fromY: number, call: KickCall): void {
  const kind = p.type;
  const power = clamp(call.power, 0, 1);
  const accuracy = clamp(call.accuracy, -1, 1);
  const angle = ((clamp(call.aim, -25, 25) + accuracy * 8) * Math.PI) / 180;
  let yards: number;
  let hang: number;
  if (kind === "onside") {
    yards = 11 + power * 4;
    hang = 20;
  } else if (kind === "punt") {
    yards = (PUNT_YARDS.min + PUNT_YARDS.range * power) * p.fx.carry;
    hang = Math.round(96 + 44 * power);
  } else {
    yards = (KICKOFF_YARDS.min + KICKOFF_YARDS.range * power) * p.fx.carry;
    hang = Math.round(96 + 30 * power);
  }
  const f: Flight = {
    kind: "kick",
    x: fromX,
    y: fromY,
    z: 2,
    vx: (Math.cos(angle) * yards * YARD) / hang,
    vy: (Math.sin(angle) * yards * ACROSS) / hang,
    vz: (Z_GRAVITY * hang) / 2,
    ax: kind === "onside" ? 0 : p.wind.x * WIND_ALONG,
    ay: kind === "onside" ? 0 : p.wind.y * WIND_ACROSS + accuracy * HOOK,
    tx: 0,
    ty: 0,
    target: -1,
    age: 0,
    eta: hang,
    landX: 0,
    landY: 0,
    bounces: 0,
    rolling: false,
    travelled: 0,
  };
  // Where it will come down, flown once now so the returner can go there.
  let x = f.x;
  let y = f.y;
  let vx = f.vx;
  let vy = f.vy;
  let z = f.z;
  let vz = f.vz;
  for (let t = 0; t < 400; t++) {
    vx += f.ax;
    vy += f.ay;
    x += vx;
    y += vy;
    z += vz;
    vz -= Z_GRAVITY;
    if (z <= 0) break;
  }
  f.landX = x;
  f.landY = y;
  p.flight = f;
  p.kicked = true;
  p.carrier = -1;
  p.events.push("kick");
}

/** Where a kickoff or punt with this call would come down, before anybody
 *  kicks it: the readout beside the power meter, flown through the same
 *  launch as the real kick so the two cannot disagree. */
export function kickLanding(
  type: "kickoff" | "punt",
  fromX: number,
  fromY: number,
  call: KickCall,
  wind: Wind,
  fx: Effects,
): { x: number; y: number } {
  const p = basePlay(type, [], fromX, { human: null, fx, wind, seed: 1 });
  launchKick(p, fromX, fromY, call);
  const f = p.flight as Flight;
  return { x: f.landX, y: f.landY };
}

/* A PASS. Thrown at where the receiver will be when it arrives, worked out
 * twice so the lead is for the real flight time, and missed by a little: more
 * under pressure, more in the rain, more the further it goes. */
function throwPass(p: Play, qbIndex: number, receiver: number): void {
  const qb = p.actors[qbIndex];
  const r = p.actors[receiver];
  const from = centre(qb);
  let eta = Math.max(6, Math.hypot(r.x - qb.x, r.y - qb.y) / TUNE.passSpeed);
  let ax = r.x + 4 + r.vx * eta;
  let ay = r.y + 8 + r.vy * eta;
  for (let i = 0; i < 2; i++) {
    eta = Math.max(6, Math.hypot(ax - from.x, ay - from.y) / TUNE.passSpeed);
    ax = r.x + 4 + r.vx * eta;
    ay = r.y + 8 + r.vy * eta;
  }
  const pressure = nearestFoe(p, qb).dist < 18 ? 1 : 0;
  const sigma =
    (TUNE.throwError + pressure * 0.05) * (1 + eta / 35) * (p.fx.hands < 0.95 ? 1.3 : 1);
  const dist = Math.hypot(ax - from.x, ay - from.y);
  ax += normal(p.rng) * sigma * dist * 0.5;
  ay += normal(p.rng) * sigma * dist * 0.5;
  // The wind carries a ball in the air a few pixels on a deep throw.
  ay += p.wind.y * 0.00012 * eta * eta;
  ax += p.wind.x * 0.0002 * eta * eta;
  const t = Math.max(6, Math.round(Math.hypot(ax - from.x, ay - from.y) / TUNE.passSpeed));
  p.flight = {
    kind: "pass",
    x: from.x,
    y: from.y,
    z: 6,
    vx: (ax - from.x) / t,
    vy: (ay - from.y) / t,
    vz: 0,
    ax: 0,
    ay: 0,
    tx: ax,
    ty: clampY(ay - 8) + 8,
    target: receiver,
    age: 0,
    eta: t,
    landX: ax,
    landY: ay,
    bounces: 0,
    rolling: false,
    travelled: 0,
  };
  p.carrier = -1;
  p.thrown = true;
  p.targetTag = r.tag;
  p.events.push("throw");
  // A person throwing takes the receiver, to go and get it.
  if (p.humanSide === qb.team) p.human = receiver;
}

/** How open a receiver is: the distance to the nearest defender, in pixels,
 *  with a defender trailing behind him counting for less than one in front. A
 *  pass is thrown ahead of a receiver, so the man chasing him is further from
 *  the ball than the man waiting for it. */
function openness(p: Play, r: Actor): number {
  const dir = dirOf(r.team);
  let best = Infinity;
  for (const d of p.actors) {
    if (d.team === r.team) continue;
    const along = d.x - r.x;
    const behind = dir * along < 0;
    const dist = Math.hypot(along * (behind ? 1.8 : 1), d.y - r.y);
    if (dist < best) best = dist;
  }
  return best;
}

function eligible(p: Play): number[] {
  const out: number[] = [];
  p.actors.forEach((a, i) => {
    if (a.tag > 0 && a.team === 0) out.push(i);
  });
  return out;
}

/** The receiver to throw to. The computer, `reading`, looks downfield first:
 *  a man still behind the line is only the answer when nobody else is. */
function mostOpen(p: Play, reading = false): number {
  let best = -1;
  let score = -Infinity;
  for (const i of eligible(p)) {
    const depth = p.actors[i].x - p.los;
    const s =
      openness(p, p.actors[i]) + depth * (reading ? 0.12 : 0.04) - (reading && depth < 12 ? 20 : 0);
    if (s > score) {
      score = s;
      best = i;
    }
  }
  return best;
}

/* ------------------------------------------------------------ the whistle */

function finish(p: Play, end: PlayEnd, has: Side, x: number, extra: Partial<PlayResult> = {}): void {
  p.result = {
    end,
    has,
    x,
    rule: null,
    scorer: null,
    turnover: p.turnover,
    thrown: p.thrown,
    caught: p.caught,
    sacked: false,
    scrambled: p.crossed,
    kneel: false,
    receiver: p.targetTag,
    catchX: p.catchX,
    turnoverX: p.turnoverX,
    kickLandX: p.kickLandX,
    ticks: p.tick,
    clockTicks: Math.max(0, p.tick - p.clockFrom),
    ...extra,
  };
}

/** The ball carrier is down, or out: work out what that means. */
function dead(p: Play, how: "tackle" | "out", c: Actor): void {
  const team = c.team;
  const ball = c.x + 4;
  const inOwnEndZone = team === 0 ? ball < OWN_GOAL : ball > GOAL;
  if (inOwnEndZone) {
    if (p.returning) {
      finish(p, "dead", team, c.x, { rule: "touchback" });
    } else {
      p.events.push("safety");
      finish(p, "safety", team, c.x, { scorer: other(team) });
    }
    return;
  }
  const sacked =
    p.type === "scrimmage" &&
    c.role === "qb" &&
    !p.thrown &&
    (p.off === "short" || p.off === "deep") &&
    dirOf(team) * (c.x - p.los) < 0;
  p.events.push(how === "out" ? "out" : sacked ? "sack" : "tackle");
  if (how === "tackle" && chance(p.rng, p.fx.fumble)) {
    p.events.push("fumble");
    if (chance(p.rng, 0.5)) {
      p.turnover = "fumble";
      p.turnoverX = c.x;
      finish(p, how, other(team), c.x, { sacked, turnover: "fumble", turnoverX: c.x });
      return;
    }
  }
  finish(p, how, team, c.x, { sacked });
}

/** Touchdown, sideline or tackle, in that order: the end zone beats a tackle on
 *  the same tick, the way bowl.ts has always had it. */
function checkCarrier(p: Play): void {
  const c = p.actors[p.carrier];
  if (!c) return;
  if (c.team === 0 ? c.x + 6 >= GOAL : c.x + 2 <= OWN_GOAL) {
    p.events.push("touchdown");
    finish(p, "touchdown", c.team, c.x, { scorer: c.team });
    return;
  }
  if ((c.y <= TOP && c.vy < -0.01) || (c.y >= BOTTOM && c.vy > 0.01)) {
    dead(p, "out", c);
    return;
  }
  for (const o of p.actors) {
    if (o.team === c.team) continue;
    /* A MAN LOCKED UP WITH A BLOCKER CANNOT MAKE THE TACKLE. Without this the
     * probe had the defensive line making two tackles in three at two yards
     * past the line, blocked or not, because a slowed lineman standing in the
     * hole still touched the back running through it. A block that holds a
     * man is a block the ball carrier can run past. */
    // Scrimmage only: on a return, the same rule made one kickoff in twenty-five
    // a touchdown, and a return team blocks for about six seconds, not forever.
    // And not a quarterback in the pocket, who is sacked by whoever gets there.
    const pocket = c.role === "qb" && !p.thrown && !p.crossed;
    if (p.type === "scrimmage" && !pocket && o.slowed > TUNE.blockHold - 6) continue;
    if (touching(o, c)) {
      dead(p, "tackle", c);
      return;
    }
  }
}

/* ------------------------------------------------------------- the person */

function nearestTo(p: Play, side: Side, x: number, y: number): number {
  let best = -1;
  let dist = Infinity;
  p.actors.forEach((a, i) => {
    if (a.team !== side || a.role === "k" || a.role === "p") return;
    const d = Math.hypot(a.x + 4 - x, a.y + 8 - y);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/** Where the ball is, for choosing who to switch to. */
function ballPoint(p: Play): { x: number; y: number } {
  if (p.carrier >= 0) return centre(p.actors[p.carrier]);
  if (p.flight) return p.flight.kind === "pass" ? { x: p.flight.tx, y: p.flight.ty } : { x: p.flight.x, y: p.flight.y };
  return { x: p.los, y: MID };
}

/** Decide who the person is steering this tick. */
function assignHuman(p: Play, input: Control): void {
  const side = p.humanSide;
  if (side === null) return;
  const c = p.carrier >= 0 ? p.actors[p.carrier] : null;
  if (c && c.team === side) {
    p.human = p.carrier;
    return;
  }
  // A tap on one of your own players takes him.
  if (input.pick >= 0 && p.actors[input.pick]?.team === side) {
    p.human = input.pick;
    return;
  }
  /* Space switches players only while you are defending: against a ball
   * carrier, against a pass to the other side, or covering your own kick. On
   * offence and on a return it means something else. */
  const f = p.flight;
  const defending = c
    ? c.team !== side
    : f
      ? f.kind === "pass"
        ? p.actors[f.target]?.team !== side
        : side === 0
      : false;
  if (defending && input.action) {
    const b = ballPoint(p);
    p.human = nearestTo(p, side, b.x, b.y);
  }
  if (p.human < 0 || p.actors[p.human].team !== side) {
    const b = ballPoint(p);
    p.human = nearestTo(p, side, b.x, b.y);
  }
}

/** Steer the person's player from the controls. */
function steer(p: Play, a: Actor, input: Control, isCarrier: boolean): void {
  const base = isCarrier
    ? a.role === "qb" && !p.crossed
      ? TUNE.qb
      : TUNE.run
    : Math.max(a.speed, TUNE.humanDefender);
  moveBy(a, input.dx, input.dy, base * burstFactor(a, TUNE.spinBoost) * p.fx.footing);
}

/** The multiplier from a spin or a juke, counted in positive ticks, or from
 *  the stumble of gathering in a catch, counted in negative ones. */
function burstFactor(a: Actor, boost: number): number {
  if (a.burst > 0) {
    a.burst -= 1;
    return boost;
  }
  if (a.burst < 0) {
    a.burst += 1;
    return 0.45;
  }
  return 1;
}

/** The ball carrier runs. A person steers him and has one spin a play; the
 *  computer runs at the widest lane and has one juke. */
function moveCarrier(p: Play, c: Actor, input: Control): void {
  if (p.human === p.carrier && p.humanSide === c.team) {
    if (input.action && !p.spinUsed && c.burst >= 0) {
      p.spinUsed = true;
      c.burst = SPIN_TICKS;
      p.events.push("spin");
    }
    steer(p, c, input, true);
    return;
  }
  if (!p.jukeUsed && c.burst === 0 && nearestFoe(p, c).dist < 14) {
    p.jukeUsed = true;
    c.burst = TUNE.jukeTicks;
  }
  const [dx, dy] = laneFor(p, c);
  moveBy(c, dx, dy, TUNE.cpuRun * burstFactor(c, TUNE.jukeBoost) * p.fx.footing);
}

/* ------------------------------------------------------------- scrimmage */

const DROP_TICKS = { short: 10, deep: 24 };

function stepScrimmage(p: Play, input: Control): void {
  if (p.off === "kneel") {
    const qb = p.actors[0];
    qb.vx = 0;
    qb.vy = 0;
    if (p.tick >= 24) finish(p, "tackle", 0, p.los - YARD, { kneel: true });
    return;
  }

  const pass = p.off === "short" || p.off === "deep";
  const c = p.carrier >= 0 ? p.actors[p.carrier] : null;

  /* THE BALL CARRIER, or the quarterback with the ball still in his hand. */
  if (c) {
    const isHuman = p.human === p.carrier && p.humanSide === c.team;
    const passPhase = pass && c.role === "qb" && !p.thrown && !p.crossed && c.team === 0;

    if (passPhase) {
      const drop = p.off === "deep" ? DROP_TICKS.deep : DROP_TICKS.short;
      if (p.tick <= drop) {
        moveBy(c, -1, 0, TUNE.qb * p.fx.footing);
      } else if (isHuman) {
        steer(p, c, input, true);
        let target = -1;
        if (input.throwTo > 0) target = p.actors.findIndex((a) => a.team === 0 && a.tag === input.throwTo);
        else if (input.pick >= 0 && p.actors[input.pick]?.tag > 0 && p.actors[input.pick].team === 0) target = input.pick;
        else if (input.action) target = mostOpen(p);
        if (target >= 0) throwPass(p, p.carrier, target);
      } else {
        c.vx = 0;
        c.vy = 0;
        const read = p.tick - drop;
        const minRead = p.off === "deep" ? 18 : 6;
        if (read >= minRead) {
          const best = mostOpen(p, true);
          const open = best >= 0 ? openness(p, p.actors[best]) : 0;
          /* Pressure is felt, not measured: a quarterback who always knew the
           * instant a rusher was on him would never be sacked, and the probe
           * found exactly that. Half the time he does not see it coming. */
          const pressure = nearestFoe(p, c).dist < 16 && chance(p.rng, 0.5);
          const need = p.off === "deep" ? 22 : 14;
          // Throw to the open man, or to the least-covered one with the rush
          // arriving, or throw it away rather than hold it forever.
          const bail = pressure && read > 24 && chance(p.rng, 0.12);
          if (best >= 0 && (open >= need || (pressure && open >= 7) || bail || read > 64)) {
            throwPass(p, p.carrier, best);
          }
        }
      }
      if (!p.thrown && dirOf(c.team) * (c.x - p.los) > 2) p.crossed = true;
      p.lit = p.thrown ? -1 : mostOpen(p);
    } else {
      moveCarrier(p, c, input);
    }
  }

  const carrier = p.carrier >= 0 ? p.actors[p.carrier] : null;
  const f = p.flight;
  const passPhase =
    pass && carrier !== null && carrier.role === "qb" && !p.thrown && !p.crossed;

  /* EVERYBODY ELSE. Four situations, and each player does the obvious thing
   * in each: the ball is in the air, the offence has it, the defence has it
   * back after an interception, or nobody has it. */
  p.taken.clear();
  p.actors.forEach((a, i) => {
    if (i === p.carrier) return;
    if (a.slowed > 0) a.slowed -= 1;
    /* The receiver a pass is thrown to goes and gets it on his own, even when
     * a person is about to take him over. Steering him there by hand was left
     * to the player at first, and a player still holding "upfield" from the
     * drop-back ran him straight away from the ball. */
    const chasingPass = f !== null && f.kind === "pass" && i === f.target;
    if (i === p.human && p.humanSide === a.team && !chasingPass) {
      steer(p, a, input, false);
      return;
    }

    if (f && f.kind === "pass") {
      if (a.team === 0) {
        if (i === f.target) moveToward(a, f.tx - 4, f.ty - 8, speedOf(p, a));
        else if (a.tag > 0) runRoute(p, a);
        else a.vx = a.vy = 0;
      } else {
        // Everybody breaks on the ball; the ones nearest it arrive in time.
        const near = Math.hypot(a.x + 4 - f.tx, a.y + 8 - f.ty) < 120;
        moveToward(a, f.tx - 4, f.ty - 8, speedOf(p, a) * (near || a.role === "db" ? 1 : 0.7));
      }
      return;
    }
    if (!carrier) return;

    if (a.team === carrier.team) {
      if (carrier.team === 1) block(p, a, carrier); // an interception: block for him
      else if (passPhase) {
        if (a.tag > 0) runRoute(p, a);
        else if (a.role === "ol" || a.role === "rb") block(p, a, carrier);
      } else if (a.role === "qb") {
        a.vx = a.vy = 0;
      } else {
        block(p, a, carrier);
      }
      return;
    }

    if (carrier.team === 1) {
      pursue(p, a, i, carrier); // the old offence chasing an interception
      return;
    }

    if (p.tick >= p.freeAt && p.freeRusher < 0 && carrier.x < p.los + 8) {
      // The rusher nearest the ball beats his block.
      let best = -1;
      let dist = Infinity;
      p.actors.forEach((d, j) => {
        if (d.team !== 1 || (d.role !== "dl" && d.role !== "lb") || j === p.human) return;
        const dd = Math.hypot(d.x - carrier.x, d.y - carrier.y);
        if (dd < dist) {
          dist = dd;
          best = j;
        }
      });
      p.freeRusher = best;
    }
    if (i === p.freeRusher) {
      a.slowed = 0;
      moveToward(a, carrier.x + carrier.vx * 2, carrier.y + carrier.vy * 2, 1.85 * p.fx.footing);
      return;
    }

    const beyond = carrier.x - p.los > 0;
    if (a.role === "dl") {
      pursue(p, a, i, carrier);
    } else if (a.role === "lb") {
      if (p.def === "blitz") pursue(p, a, i, carrier, 1.18);
      else if (p.def === "run" && passPhase && p.tick > 14) {
        // Came up for the run, saw the pass, and drops to take away the short
        // throw: a run stop bites first and recovers second.
        moveToward(a, p.los + 44, a.y, speedOf(p, a));
      } else if (p.def === "run") pursue(p, a, i, carrier, passPhase ? 0.9 : 1.04);
      else if (passPhase && a.cover >= 0) coverMan(p, a, p.actors[a.cover], 8, 2);
      else if (passPhase || (p.tick < 12 && !beyond)) {
        // Coverage: drop to the zone and read it before coming up.
        moveToward(a, p.los + 64, a.y, speedOf(p, a) * 0.6);
      } else pursue(p, a, i, carrier);
    } else if (a.role === "db") {
      const read = p.def === "run" ? 4 : p.def === "blitz" ? 8 : 16;
      const man = a.cover >= 0 ? p.actors[a.cover] : null;
      if (man && (passPhase || (p.tick < read && !beyond))) {
        const cushion = p.def === "cover" ? 12 : p.def === "blitz" ? 2 : 0;
        const lag = p.def === "run" ? 0 : 2;
        coverMan(p, a, man, cushion, lag);
      } else {
        pursue(p, a, i, carrier);
      }
    } else if (a.role === "s") {
      const read = p.def === "run" ? 6 : 14;
      if (passPhase || (p.tick < read && !beyond)) {
        // Over the top of the deepest receiver, and between him and the middle.
        let deepest: Actor | null = null;
        for (const r of p.actors) {
          if (r.team === 0 && r.tag > 0 && (!deepest || r.x > deepest.x)) deepest = r;
        }
        const tx = Math.max(p.los + 120, (deepest ? deepest.x : p.los) + 56);
        const ty = deepest ? MID + (deepest.y - MID) * 0.5 : MID;
        moveToward(a, tx, ty, speedOf(p, a));
      } else {
        pursue(p, a, i, carrier);
      }
    }
  });

  /* THE BALL IN THE AIR. Drawn with lift on an arc; it arrives when it
   * arrives, and whoever is there decides it. */
  if (f && f.kind === "pass") {
    f.age += 1;
    const s = f.age / f.eta;
    f.x += f.vx;
    f.y += f.vy;
    f.z = 6 * (1 - s) + 4 * (8 + f.eta * 0.5) * s * (1 - s);
    if (f.age >= f.eta) resolvePass(p, f);
  }

  if (!p.result && p.carrier >= 0) checkCarrier(p);
  // A play with no ball in anybody's hands and none in the air must still end.
  if (!p.result && p.carrier < 0 && !p.flight) finish(p, "incomplete", 0, p.los);
}

function resolvePass(p: Play, f: Flight): void {
  p.flight = null;
  const bx = f.tx;
  const by = f.ty;
  let off = -1;
  let offDist = Infinity;
  let def = -1;
  let defDist = Infinity;
  p.actors.forEach((a, i) => {
    const d = Math.hypot(a.x + 4 - bx, a.y + 8 - by);
    if (a.team === 0) {
      if (a.tag > 0 && d < offDist) {
        offDist = d;
        off = i;
      }
    } else if (d < defDist) {
      defDist = d;
      def = i;
    }
  });

  const reach = TUNE.reach;
  if (def >= 0 && defDist <= reach * 0.8 && defDist < offDist) {
    const human = p.humanSide === 1 && p.human === def;
    const pick = chance(p.rng, (human ? TUNE.humanInterception : TUNE.interception) * p.fx.hands);
    if (pick) {
      const d = p.actors[def];
      p.carrier = def;
      p.turnover = "interception";
      p.turnoverX = d.x;
      p.returning = true;
      p.events.push("interception");
      if (p.humanSide === 1) p.human = def;
      return;
    }
    p.events.push("incomplete");
    finish(p, "incomplete", 0, p.los);
    return;
  }
  if (off >= 0 && offDist <= reach) {
    const contest = defDist <= reach ? 1 - defDist / reach : 0;
    // A ball that has been in the air a long time is a harder catch.
    const hands = (0.95 - 0.55 * contest - Math.max(0, f.eta - 18) * 0.01) * p.fx.hands;
    if (chance(p.rng, hands)) {
      const r = p.actors[off];
      p.carrier = off;
      p.caught = true;
      p.catchX = r.x;
      // Gathering the ball in costs a step, which is when defenders arrive.
      r.burst = -TUNE.gather;
      p.events.push("catch");
      if (p.humanSide === 0) p.human = off;
      return;
    }
  }
  p.events.push("incomplete");
  finish(p, "incomplete", 0, p.los);
}

/* ---------------------------------------------------------------- kicking */

const KICK_AT = 12;
const PUNT_AT = 22;

/** Kicking team side 0 always. The returner is actor 15 on both kinds. */
const RETURNER = 15;

function stepKickoff(p: Play, input: Control): void {
  const k = p.actors[0];
  if (!p.kicked) {
    moveBy(k, 1, 0, 14 / KICK_AT);
    if (p.tick >= KICK_AT) {
      const call = p.kick ?? { power: 0.8, accuracy: 0, aim: 0 };
      launchKick(p, p.los, MID + 8, call);
    }
    return;
  }

  const f = p.flight;
  const ret = p.actors[RETURNER];

  if (p.type === "onside") {
    stepOnside(p, f);
    return;
  }

  if (f) {
    /* The returner goes to where it is coming down, unless it is coming down
     * short of the landing zone: that ball is spotted at the forty whatever
     * happens, and catching it could only make it worse. */
    const short = f.bounces === 0 && f.landX < GOAL - 20 * YARD;
    if (p.carrier < 0 && !short) {
      const tx = f.rolling || f.bounces > 0 ? f.x - 4 : f.landX - 4;
      const ty = f.rolling || f.bounces > 0 ? f.y - 8 : f.landY - 8;
      moveToward(ret, tx, clampY(ty), speedOf(p, ret, TUNE.run));
    }
    flyKick(p, f);
    if (p.result) return;

    if (p.flight && p.carrier < 0 && !short) {
      const ball = p.flight;
      const near = Math.hypot(ret.x + 4 - ball.x, (ret.y + 8 - ball.y) * 1.3) < 10;
      if (near && ball.z < 14) {
        // Caught, or picked up off the ground.
        const deep = ball.x >= GOAL + 2 * YARD;
        if (deep) {
          finish(p, "dead", 1, ball.x, { rule: ball.bounces > 0 ? "zone-touchback" : "touchback" });
          return;
        }
        p.carrier = RETURNER;
        p.returning = true;
        p.flight = null;
        p.frozen = false;
        if (p.clockFrom === 0) p.clockFrom = p.tick;
        p.events.push("catch");
        if (p.humanSide === 1) p.human = RETURNER;
      }
    }
    if (p.flight && p.flight.bounces > 0) {
      // Once it is on the ground, the coverage may down it by touching it.
      const ball = p.flight;
      for (let i = 1; i <= 7; i++) {
        const a = p.actors[i];
        if (Math.hypot(a.x + 4 - ball.x, a.y + 8 - ball.y) < 7) {
          finish(p, "dead", 1, ball.x, { rule: "downed" });
          return;
        }
      }
    }
  }

  if (p.frozen) return;
  stepChase(p, input);
}

/** Fly a kick one tick and apply the landing rules. */
function flyKick(p: Play, f: Flight): void {
  f.age += 1;
  if (f.rolling) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= p.type === "punt" ? 0.93 : 0.9;
    f.vy *= 0.9;
    f.z = 0;
    if (p.type === "punt" && f.x >= GOAL) {
      finish(p, "dead", 1, f.x, { rule: "touchback" });
      return;
    }
    if (Math.hypot(f.vx, f.vy) < 0.05) {
      if (p.type === "punt") finish(p, "dead", 1, f.x, { rule: "downed" });
      else if (f.x >= GOAL) finish(p, "dead", 1, f.x, { rule: "zone-touchback" });
      // A kickoff at rest in the field of play waits for the returner.
    }
    return;
  }

  f.vx += f.ax;
  f.vy += f.ay;
  f.x += f.vx;
  f.y += f.vy;
  f.z += f.vz;
  f.vz -= Z_GRAVITY;
  if (f.z > 0) return;

  f.z = 0;
  const first = f.bounces === 0;
  if (first) {
    p.kickLandX = f.x;
    p.events.push("land");
    const out = f.y < TOP - 4 || f.y > BOTTOM + 12;
    if (out) {
      finish(p, "dead", 1, f.x, { rule: "out" });
      return;
    }
    if (f.x >= GOAL) {
      finish(p, "dead", 1, f.x, { rule: "touchback" });
      return;
    }
    if (p.type === "kickoff" && f.x < GOAL - 20 * YARD) {
      finish(p, "dead", 1, f.x, { rule: "short" });
      return;
    }
    p.frozen = false;
    if (p.clockFrom === 0) p.clockFrom = p.tick;
  }
  f.bounces += 1;
  if (f.bounces >= 3) {
    f.rolling = true;
    f.vx *= 0.6;
    f.vy *= 0.6;
  } else {
    // A football off the turf: low, and not quite where you expected.
    f.vz = 1.1 / f.bounces;
    f.vx *= 0.45;
    f.vy = f.vy * 0.45 + between(p.rng, -0.25, 0.25);
  }
}

function stepOnside(p: Play, f: Flight | null): void {
  if (!f) return;
  const startX = p.los;
  if (f.rolling) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= 0.95;
    f.vy *= 0.95;
  } else {
    f.x += f.vx;
    f.y += f.vy;
    f.z += f.vz;
    f.vz -= Z_GRAVITY * 3;
    if (f.z <= 0) {
      f.z = 0;
      f.bounces += 1;
      if (f.bounces >= 3) f.rolling = true;
      else f.vz = 1.4 / f.bounces;
    }
  }
  f.travelled = (f.x - startX) / YARD;
  const live = f.travelled >= 10 || (f.rolling && Math.hypot(f.vx, f.vy) < 0.1);
  if (!live) return;
  if (p.clockFrom === 0) p.clockFrom = p.tick;
  p.frozen = false;
  // Everybody dives at it.
  let first = -1;
  p.actors.forEach((a, i) => {
    if (a.role === "k") return;
    moveToward(a, f.x - 4, f.y - 8, speedOf(p, a) * 1.1);
    if (first < 0 && Math.hypot(a.x + 4 - f.x, a.y + 8 - f.y) < 7) first = i;
  });
  if (first >= 0 || p.tick > 160) {
    /* WHO COMES UP WITH IT. A scramble for a bouncing ball is closer to a coin
     * weighted against the kicking team than to anything a sprite's position
     * decides, and the league's own recovery rate is about one in five. */
    const kickers = chance(p.rng, 0.2);
    finish(p, "dead", kickers ? 0 : 1, f.x, { rule: "onside" });
  }
}

function stepPunt(p: Play, input: Control): void {
  const punter = p.actors[0];
  if (!p.kicked) {
    punter.vx = 0;
    punter.vy = 0;
    // The rush and the protection, before the ball is away.
    p.taken.clear();
    p.actors.forEach((a, i) => {
      if (i === 0) return;
      if (a.slowed > 0) a.slowed -= 1;
      if (a.team === 0) {
        if (a.role === "cov") moveBy(a, 1, 0, speedOf(p, a));
        else block(p, a, punter);
      } else if (a.role === "dl") {
        pursue(p, a, i, punter);
      } else if (a.role === "blk") {
        const gunner = p.actors[a.y < MID ? 6 : 7];
        moveToward(a, gunner.x + 10, gunner.y, speedOf(p, a) * 0.8);
        if (touching(a, gunner)) gunner.slowed = 10;
      } else if (a.role === "ret") {
        a.vx = a.vy = 0;
      }
    });
    if (p.tick >= PUNT_AT) {
      launchKick(p, punter.x + 8, punter.y + 8, p.kick ?? { power: 0.8, accuracy: 0, aim: 0 });
    }
    return;
  }

  const f = p.flight;
  const ret = p.actors[RETURNER];
  if (f) {
    // A person on the return team can call for a fair catch while it is up.
    if (p.humanSide === 1 && input.action && !f.rolling && f.bounces === 0 && !p.fairCatch) {
      p.fairCatch = true;
      p.events.push("fair-catch");
    }
    /* THE COMPUTER'S RETURNER lets a punt go when it is coming down inside
     * his own ten, hoping for the touchback, and calls for a fair catch when
     * a gunner is on top of him. */
    const letItGo = f.landX > GOAL - 10 * YARD && p.humanSide !== 1;
    if (p.carrier < 0) {
      const tx = f.bounces > 0 ? f.x - 4 : f.landX - 4;
      const ty = f.bounces > 0 ? f.y - 8 : f.landY - 8;
      if (letItGo && f.bounces === 0) moveToward(ret, Math.min(tx, GOAL - 14 * YARD), clampY(ty), speedOf(p, ret, TUNE.run));
      else moveToward(ret, tx, clampY(ty), speedOf(p, ret, TUNE.run));
    }
    flyKick(p, f);
    if (p.result) return;
    const ball = p.flight;
    if (ball && p.carrier < 0) {
      const near = Math.hypot(ret.x + 4 - ball.x, (ret.y + 8 - ball.y) * 1.3) < 10;
      if (near && ball.z < 14 && !(letItGo && ball.bounces === 0)) {
        // A punt caught in the air is measured to where it was caught.
        if (p.kickLandX === null) p.kickLandX = ball.x;
        if (p.humanSide !== 1 && ball.bounces === 0) {
          const gunner = Math.min(
            Math.hypot(p.actors[6].x - ret.x, p.actors[6].y - ret.y),
            Math.hypot(p.actors[7].x - ret.x, p.actors[7].y - ret.y),
          );
          if (gunner < 26) p.fairCatch = true;
        }
        if (p.fairCatch && ball.bounces === 0) {
          p.events.push("catch");
          finish(p, "dead", 1, ball.x, { rule: "fair-catch" });
          return;
        }
        p.carrier = RETURNER;
        p.returning = true;
        p.flight = null;
        p.events.push("catch");
        if (p.humanSide === 1) p.human = RETURNER;
      } else if (ball.bounces > 0) {
        for (let i = 1; i <= 7; i++) {
          const a = p.actors[i];
          if (Math.hypot(a.x + 4 - ball.x, a.y + 8 - ball.y) < 7) {
            finish(p, "dead", 1, ball.x, { rule: "downed" });
            return;
          }
        }
      }
    }
  }
  stepChase(p, input);
}

/* THE RETURN AND THE COVERAGE. Once a kick is caught everybody on the kicking
 * team chases and everybody on the return team blocks, which is the whole of a
 * return. Before the catch the coverage runs at where the ball is coming down
 * and the blockers drift back to set up in front of the returner. */
function stepChase(p: Play, input: Control): void {
  assignHuman(p, input);
  const c = p.carrier >= 0 ? p.actors[p.carrier] : null;
  const f = p.flight;

  if (c) moveCarrier(p, c, input);

  p.taken.clear();
  p.actors.forEach((a, i) => {
    // The returner is steered toward the ball by the kick itself until he has it.
    if (i === p.carrier || (i === RETURNER && !c)) return;
    if (a.slowed > 0) a.slowed -= 1;
    if (i === p.human && p.humanSide === a.team) {
      steer(p, a, input, false);
      return;
    }
    if (c) {
      if (a.team === c.team) block(p, a, c);
      else if (a.role === "k" || a.role === "p") moveToward(a, c.x, c.y, speedOf(p, a) * 0.8);
      else pursue(p, a, i, c);
      return;
    }
    if (f) {
      if (a.team === 0) {
        moveToward(a, f.landX - 4, clampY(f.landY - 8), speedOf(p, a) * (a.role === "p" || a.role === "k" ? 0.5 : 1));
      } else if (a.role !== "ret") {
        // Set a wall a few yards in front of where the ball is coming down.
        moveToward(a, f.landX - 4 - 8 * YARD, clampY(a.y), speedOf(p, a) * 0.6);
      }
    }
  });

  if (!p.result && p.carrier >= 0) checkCarrier(p);
}

/* ----------------------------------------------------------------- stepping */

/** One tick. Mutates the play; `result` is set once it is over. */
export function stepPlay(p: Play, input: Control = NO_CONTROL): void {
  if (p.result) return;
  p.tick += 1;
  p.events.length = 0;

  if (p.type === "scrimmage") {
    assignHuman(p, input);
    stepScrimmage(p, input);
  } else if (p.type === "punt") {
    stepPunt(p, input);
  } else {
    stepKickoff(p, input);
  }

  if (!p.result && p.tick >= MAX_TICKS) {
    const c = p.carrier >= 0 ? p.actors[p.carrier] : null;
    if (c) dead(p, "tackle", c);
    else if (p.type === "scrimmage") finish(p, "incomplete", 0, p.los);
    else finish(p, "dead", 1, p.flight ? p.flight.x : p.los, { rule: "downed" });
  }
}

/** Run a play to the whistle with nobody at the controls. For tests, the
 *  probe, and the computer's side of a simulated game. */
export function runPlay(p: Play, control: (p: Play) => Control = () => NO_CONTROL): PlayResult {
  while (!p.result) stepPlay(p, control(p));
  return p.result;
}

/* ------------------------------------------------------------ the computer */

/** The computer's kickoff: deep into the landing zone, mostly, with a leg
 *  about as reliable as a professional's. */
export function computerKickoff(r: Rng): KickCall {
  /* Aimed to come down around the receiving five, which is what kickers have
   * done since the touchback moved out to the thirty-five: a kick in the end
   * zone gives away field position, one in the landing zone makes them
   * return it. */
  return {
    power: clamp(0.56 + normal(r) * 0.08, 0.2, 1),
    accuracy: clamp(normal(r) * 0.2, -1, 1),
    aim: clamp(normal(r) * 5, -20, 20),
  };
}

export function computerOnside(r: Rng): KickCall {
  return { power: clamp(0.4 + normal(r) * 0.2, 0, 1), accuracy: 0, aim: clamp(normal(r) * 10, -20, 20) };
}

/** The computer's punt: as far as it goes, unless that would be into the end
 *  zone, when it tries to pin the ball inside the ten. */
export function computerPunt(r: Rng, yardsToGoal: number, carry: number): KickCall {
  // Distances are from the punter, who stands fourteen yards behind the line.
  const fromPunter = yardsToGoal + 14;
  const full = (PUNT_YARDS.min + PUNT_YARDS.range) * carry;
  let power = clamp(0.84 + normal(r) * 0.08, 0.4, 1);
  if (full > fromPunter - 6) {
    const want = (fromPunter - 8) / carry;
    power = clamp((want - PUNT_YARDS.min) / PUNT_YARDS.range + normal(r) * 0.06, 0, 1);
  }
  return { power, accuracy: clamp(normal(r) * 0.2, -1, 1), aim: clamp(normal(r) * 4, -15, 15) };
}
