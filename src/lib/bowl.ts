/* COMMISH BOWL — the simulation, with no canvas and no React in it.
 *
 * WHY THIS IS A SEPARATE MODULE. It started inside the component, where the
 * only way to find out whether a play resolves correctly was to sit and watch
 * one. That is a bad deal at the best of times, and it became an impossible
 * one the first time this was opened somewhere that does not run
 * requestAnimationFrame: nothing moved, and there was no way to tell a broken
 * simulation from a paused one.
 *
 * So the rules live here as ordinary functions over ordinary objects. `step`
 * takes a world and an input and returns what happened. The component owns the
 * clock, the canvas and the keyboard; this file owns the game, and a test can
 * play a hundred downs in a millisecond without a browser.
 *
 * Everything here is deterministic. No timers, no random, no Date: the only
 * thing that varies between two identical sequences of inputs is nothing.
 */

import { SPRITE_H, SPRITE_W } from "@/lib/pixel";

/* ---------------------------------------------------------------- geometry */

/** The visible window. The world is wider; the camera moves over it. */
export const VIEW_W = 256;
export const VIEW_H = 144;

/** Fixed simulation step. Thirty a second: fast enough that a dodge feels
 *  immediate, slow enough that the sprites still read as animation frames
 *  rather than as smooth motion, which would fight the whole look. */
export const TICK_MS = 1000 / 30;

export const YARD = 6; // logical pixels per yard
export const START = 40; // world x of your own 20
export const GOAL = START + 80 * YARD; // 520
export const WORLD = GOAL + 10 * YARD; // 580, including the endzone

/** Vertical bounds, measured so the sprite's helmet and feet stay inside the
 *  sidelines rather than its origin. */
export const TOP = 8;
export const BOTTOM = VIEW_H - 6 - SPRITE_H;

/* THE BALANCE NUMBERS, in one object, because they were tuned by search and
 * not by eye and the next person to touch them will want to do the same.
 *
 * `.probe/` drives a bot through a few hundred drives and reports how often it
 * scores and who makes the tackles. Every number below came out of that loop.
 * Tuning a chase game by playing it is how you end up with the first version
 * of this file, which read fine, drew fine, and gained exactly three yards on
 * every play anybody ever ran.
 *
 * THE DEFENCE HAS A SHAPE, and the gaps between its units are the game:
 *
 *   THE LINE, four of them, close and spread wide. Slow and sluggish to turn,
 *   so they are beaten by picking a gap and committing to it.
 *   THE LINEBACKERS, two, deeper and quicker, covering the gaps in the line.
 *   THE SAFETY, one, a long way back and nearly as fast as you. He is the last
 *   man and the reason the spin exists.
 */
export type Unit = {
  /** Offset from the middle of the field at the snap. */
  dy: number;
  /** How far in front of the ball he lines up. */
  ahead: number;
  speed: number;
  /** How many ticks ahead of the ball he aims. */
  lead: number;
  /** Radians he can swing his heading through in one tick. */
  turn: number;
};

export const TUNING = {
  runSpeed: 2.1,
  blockSpeed: 2.0,
  /** Ticks a blocked defender stays slowed, and what fraction of his speed he
   *  keeps while he is. */
  blockHold: 16,
  blockSlow: 0.22,
  spinBoost: 1.7,
  line: [-58, -20, 20, 58].map(
    (dy): Unit => ({ dy, ahead: 42, speed: 1.06, lead: 2, turn: 0.1 }),
  ),
  /* NOT MIRRORED, and that is the point. Two linebackers at plus and minus the
     same offset pinch the exact middle of the field, which is where "run at
     the widest gap" sends you — so the instinct the game spends its whole
     first play teaching is also the one that gets you tackled. A trace of a
     straight run showed both of them arriving on the ball at the same tick
     from opposite sides, every time. Offsetting them, and staggering their
     depth, means there is a genuinely better side rather than a trap. */
  backers: [
    { dy: -44, ahead: 96, speed: 1.44, lead: 4, turn: 0.17 },
    { dy: 22, ahead: 110, speed: 1.44, lead: 4, turn: 0.17 },
  ] as Unit[],
  safety: { dy: 12, ahead: 190, speed: 1.76, lead: 9, turn: 0.24 } as Unit,
};

/** One spin per play, ten ticks of it. A cooldown as well as a per-play limit
 *  would be two rules doing one job, and the per-play limit is the one that
 *  makes the decision interesting: when, not how often. */
export const SPIN_TICKS = 10;
export const DOWNS = 4;

/** Ten yards for a new set of downs, the way the sport does it.
 *
 *  THIS IS WHAT MADE IT A GAME. Four downs to cover eighty yards, with a bot
 *  averaging eight a play, is a turnover every single drive and a scoreboard
 *  that only ever says the same thing. Four downs to cover ten, with the same
 *  eight-yard average, is a decision on every snap and a drive that can run.
 *  The balance did not change; the goalposts moved to where the sport already
 *  had them. */
export const TO_GAIN = 10 * YARD;

export const clampY = (y: number) => Math.max(TOP, Math.min(BOTTOM, y));

/** Where the camera sits for a given runner position: centred, and stopped at
 *  both ends of the world so the field never runs out mid-screen. */
export const camera = (rx: number) =>
  Math.max(0, Math.min(WORLD - VIEW_W, Math.round(rx + SPRITE_W / 2 - VIEW_W / 2)));

/* ------------------------------------------------------------------- world */

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks of reduced speed left after a blocker got in the way. */
  slowed: number;
  /** Pixels per tick, and how many ticks ahead of the ball this man aims.
   *  Unused for the runner, who moves at TUNING.runSpeed. */
  speed: number;
  lead: number;
  /** How much of his velocity a defender can redirect in one tick.
   *
   *  THIS IS THE WHOLE GAME. A pursuer who re-aims perfectly every tick cannot
   *  be beaten by anything except raw speed, and a bot search over a hundred
   *  policies proved it: the best drive anyone could manage against perfect
   *  homing was eight yards, and nobody ever scored. Inertia is what makes a
   *  cut mean something — commit hard enough and the defender's own momentum
   *  carries him past you. The runner has no turn limit at all, and that
   *  asymmetry is the entire reason there is something to be good at here. */
  turn: number;
  /** Which defender a blocker has committed to. Blockers used to re-pick the
   *  man nearest the ball every single tick, so both of them oscillated
   *  between the same two targets and neither ever arrived. A block is a
   *  commitment or it is nothing. */
  mark: number;
};

export const body = (
  x: number,
  y: number,
  speed = 0,
  lead = 0,
  turn = 1,
): Body => ({
  x,
  y,
  vx: 0,
  vy: 0,
  slowed: 0,
  speed,
  lead,
  turn,
  mark: -1,
});

export type World = {
  runner: Body;
  defence: Body[];
  blockers: Body[];
  /** World x the current play started from. */
  los: number;
  /** World x that earns a new set of downs. */
  marker: number;
  down: number;
  /** Ticks of boost remaining, and whether it has been spent this play. */
  spin: number;
  spinUsed: boolean;
  frame: number;
};

/** What a single tick did. `tackled` and `touchdown` both mean the play is
 *  over and the caller should stop stepping. */
export type Tick = "live" | "tackled" | "touchdown";

/** A direction, not a velocity: any non-zero pair is normalised, so a
 *  keyboard's (1,1) diagonal is not faster than its (1,0). */
export type Input = { dx: number; dy: number; spin?: boolean };

export function newWorld(): World {
  return {
    runner: body(START, (TOP + BOTTOM) / 2),
    defence: [],
    blockers: [],
    los: START,
    marker: START + TO_GAIN,
    down: 1,
    spin: 0,
    spinUsed: false,
    frame: 0,
  };
}

/** Set up a play from the current line of scrimmage: seven defenders in three
 *  units, and three blockers in front of the ball. */
export function kickoff(w: World): void {
  const mid = (TOP + BOTTOM) / 2;
  w.runner = body(w.los, mid);

  w.defence = [...TUNING.line, ...TUNING.backers, TUNING.safety].map((u) =>
    body(
      Math.min(w.los + u.ahead, GOAL - 8),
      clampY(mid + u.dy),
      u.speed,
      u.lead,
      u.turn,
    ),
  );
  /* THREE BLOCKERS AGAINST FOUR LINEMEN. Two was the obvious number and it
     did not work: the line made eighty-two per cent of every tackle in a
     hundred-policy bot search, because two blocked men still leaves two free,
     and two men either side of a gap close it. An offence outnumbers the rush
     in the real sport for exactly this reason. */
  w.blockers = [-26, 0, 26].map((dy) =>
    body(w.los + 20, clampY(mid + dy), TUNING.blockSpeed, 0, 0.7),
  );
  w.spin = 0;
  w.spinUsed = false;
}

/** A tighter box than the sprite. Tackling on the full 8x15 rectangle means
 *  being brought down by a defender's raised knee half a body away, which
 *  reads as the game cheating even though the pixels did touch. */
export function touching(a: Body, b: Body): boolean {
  return (
    Math.abs(a.x - b.x) < SPRITE_W - 2 && Math.abs(a.y - b.y) < SPRITE_H - 8
  );
}

/** Move `b` at `speed`, swinging his heading toward the target by at most
 *  `b.turn` radians this tick.
 *
 *  THIS IS AN ANGLE LIMIT, and the first version was not. It clamped each
 *  velocity component and then renormalised, which restores most of the
 *  direction it just clamped: seven "sluggish" defenders turned almost
 *  instantly and a bot search over three speed regimes could not score once.
 *  Limiting the heading is the thing that makes a hard cut cost a pursuer
 *  something, and it is the whole reason there is a game here. */
function moveToward(b: Body, tx: number, ty: number, speed: number): void {
  const want = Math.atan2(ty - b.y, tx - b.x);
  const moving = Math.hypot(b.vx, b.vy) > 0.001;
  let heading = want;
  if (moving) {
    const cur = Math.atan2(b.vy, b.vx);
    // Wrap into (-PI, PI] so turning "left past north" is not the long way.
    let diff = want - cur;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    heading = cur + Math.max(-b.turn, Math.min(b.turn, diff));
  }
  b.vx = Math.cos(heading) * speed;
  b.vy = Math.sin(heading) * speed;
  b.x += b.vx;
  b.y = clampY(b.y + b.vy);
}

/** Yards gained on the play so far, never negative: losing ground behind the
 *  line is a nil gain here rather than a negative one, because a game with no
 *  passing has no reason to model a sack. */
export const gainOf = (w: World): number =>
  Math.max(0, Math.round((w.runner.x - w.los) / YARD));

/** One tick. Mutates the world and says what happened. */
export function step(w: World, input: Input): Tick {
  w.frame++;

  if (input.spin && !w.spinUsed) {
    w.spin = SPIN_TICKS;
    w.spinUsed = true;
  }
  if (w.spin > 0) w.spin--;

  const { dx, dy } = input;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const speed = TUNING.runSpeed * (w.spin > 0 ? TUNING.spinBoost : 1);
    w.runner.vx = (dx / len) * speed;
    w.runner.vy = (dy / len) * speed;
  } else {
    w.runner.vx = 0;
    w.runner.vy = 0;
  }
  w.runner.x = Math.max(
    4,
    Math.min(WORLD - SPRITE_W - 2, w.runner.x + w.runner.vx),
  );
  w.runner.y = clampY(w.runner.y + w.runner.vy);

  /* BLOCKING. A blocker picks the defender who is the biggest threat — nearest
     to the ball, in front of it, and not already taken — and then STAYS ON
     HIM until he is beaten or irrelevant. The first version re-picked every
     tick, so two blockers chased the same man, swapped, chased back, and
     nobody was ever blocked. */
  const taken = new Set<number>();
  for (const b of w.blockers) {
    const held = b.mark >= 0 ? w.defence[b.mark] : undefined;
    const stale =
      !held ||
      taken.has(b.mark) ||
      held.x < w.runner.x - 14 || // beaten: he is behind the ball now
      Math.hypot(held.x - w.runner.x, held.y - w.runner.y) > 90;
    if (stale) {
      let pick = -1;
      let nearest = Infinity;
      w.defence.forEach((d, i) => {
        if (taken.has(i)) return;
        if (d.x < w.runner.x - 4) return; // already beaten, not a threat
        const dist = Math.hypot(d.x - w.runner.x, d.y - w.runner.y);
        if (dist < nearest) {
          nearest = dist;
          pick = i;
        }
      });
      b.mark = pick;
    }
    if (b.mark < 0) {
      // Nobody to block: get in front of the ball and stay useful.
      moveToward(b, w.runner.x + 24, w.runner.y, b.speed);
      continue;
    }
    taken.add(b.mark);
    const t = w.defence[b.mark];
    moveToward(b, t.x, t.y, b.speed);
    // A block that lasts a third of a second is a nudge. This one holds.
    if (touching(b, t)) t.slowed = TUNING.blockHold;
  }

  /* PURSUIT. Each man leads the ball by his own amount, which is what makes
     the line beatable and the safety not. A defender who has been blocked
     runs at a third speed for a moment, which is the whole payoff of having
     blockers at all. */
  let caught = false;
  w.defence.forEach((d, i) => {
    if (d.slowed > 0) d.slowed--;
    // A per-defender phase, so seven men do not move as one organism.
    const wobble = Math.sin((w.frame + i * 7) / 9) * 2;
    moveToward(
      d,
      w.runner.x + w.runner.vx * d.lead,
      clampY(w.runner.y + w.runner.vy * d.lead + wobble),
      d.speed * (d.slowed > 0 ? TUNING.blockSlow : 1),
    );
    if (touching(d, w.runner)) caught = true;
  });

  /* THE ENDZONE BEATS THE TACKLE on the tick they happen together. A runner
     who crosses the line and is touched in the same frame has scored: that is
     how the sport works, and the alternative is a game that occasionally eats
     a touchdown for reasons nobody watching can see. */
  if (w.runner.x >= GOAL) return "touchdown";
  return caught ? "tackled" : "live";
}

/** What closing out a tackled play did. */
export type Outcome = "first-down" | "next-down" | "turnover";

/** Close out a tackled play: the ball moves to where he went down, and either
 *  the chains move or the down count does. */
export function nextDown(w: World): Outcome {
  w.los = w.runner.x;
  if (w.los >= w.marker) {
    w.down = 1;
    w.marker = Math.min(w.los + TO_GAIN, GOAL);
    return "first-down";
  }
  if (w.down >= DOWNS) return "turnover";
  w.down += 1;
  return "next-down";
}

/** Yards still needed for a new set, or for the score when the marker has been
 *  pinned to the goal line. */
export const toGo = (w: World): number =>
  Math.max(0, Math.ceil((w.marker - w.los) / YARD));

/** The yard line the ball sits on, counted from your own goal, which is how a
 *  scoreboard says it. */
export const yardLine = (w: World): number =>
  Math.round(20 + (w.los - START) / YARD);
