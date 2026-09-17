/* Trace one play tick by tick: who has the ball and where everybody is.
 *
 *   npx tsx .probe/trace-play.ts run cover
 *
 * The balance table in bowlplay.ts says what a call produces on average. This
 * says why, one tick at a time, which is what finds a bug that a table only
 * reports.
 */
import { YARD } from "../src/lib/bowl";
import { type DefCall, type OffCall, scrimmage, stepPlay, xOfYard } from "../src/lib/bowlplay";
import { EFFECTS } from "../src/lib/conditions";

const off = (process.argv[2] ?? "run") as OffCall;
const def = (process.argv[3] ?? "run") as DefCall;
const seed = Number(process.argv[4]) || 13;
const los = xOfYard(40);
const p = scrimmage({
  los,
  marker: los + 10 * YARD,
  off,
  def,
  human: null,
  fx: EFFECTS.clear,
  wind: { x: 0, y: 0 },
  seed,
});
const fmt = (n: number) => String(Math.round(n)).padStart(4);
while (!p.result && p.tick < 400) {
  stepPlay(p);
  if (p.tick % 4 === 0 || p.result || p.events.length) {
    const c = p.carrier >= 0 ? p.actors[p.carrier] : null;
    console.log(
      `t${fmt(p.tick)} c${p.carrier} ${c ? `${c.role}${fmt(c.x - los)},${fmt(c.y)}` : "           "} | ` +
        p.actors.map((a, i) => `${i}:${fmt(a.x - los)},${fmt(a.y)}`).join(" ") +
        (p.flight ? ` ball ${fmt(p.flight.x - los)},${fmt(p.flight.y)} ${p.flight.age}/${p.flight.eta}` : "") +
        (p.events.length ? ` [${p.events.join(",")}]` : ""),
    );
  }
}
console.log(p.result);
