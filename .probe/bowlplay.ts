/* THE PLAY BOOK, MEASURED. Not shipped; run by hand when bowlplay.ts moves.
 *
 *   npx tsx .probe/bowlplay.ts
 *
 * Plays every offensive call against every defensive call a few hundred times
 * with the computer on both sides, from midfield, and prints what a play-caller
 * needs to know: yards, how often it gains, completions, sacks, interceptions.
 * Then kickoffs and punts. The rock-paper-scissors of play-calling is only real
 * if this table says so.
 */
import { YARD } from "../src/lib/bowl";
import {
  computerKickoff,
  computerPunt,
  type DefCall,
  kickoff,
  type OffCall,
  punt,
  runPlay,
  scrimmage,
  xOfYard,
  yardOf,
} from "../src/lib/bowlplay";
import { EFFECTS } from "../src/lib/conditions";
import { seeded } from "../src/lib/rng";

const N = Number(process.argv[2]) || 300;
const fx = EFFECTS.clear;
const calm = { x: 0, y: 0 };

const offs: OffCall[] = ["run", "short", "deep"];
const defs: DefCall[] = ["run", "cover", "blitz"];

console.log(`scrimmage from the 40, ${N} plays each`);
console.log("off   def     avg   med  gain%  comp%  sack%  int%  fum%  td%  ticks  tackled by");
for (const off of offs) {
  for (const def of defs) {
    const yards: number[] = [];
    let thrown = 0, caught = 0, sacks = 0, ints = 0, fumbles = 0, tds = 0, ticks = 0;
    const by: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const los = xOfYard(40);
      const p = scrimmage({ los, marker: los + 10 * YARD, off, def, human: null, fx, wind: calm, seed: i * 7919 + 13 });
      const r = runPlay(p);
      if (r.end === "tackle" && p.carrier >= 0) {
        const c = p.actors[p.carrier];
        let near = "", dist = Infinity;
        for (const a of p.actors) {
          if (a.team === c.team) continue;
          const d = Math.hypot(a.x - c.x, a.y - c.y);
          if (d < dist) { dist = d; near = a.role; }
        }
        by[near] = (by[near] ?? 0) + 1;
      }
      ticks += r.ticks;
      if (r.thrown) thrown++;
      if (r.caught) caught++;
      if (r.sacked) sacks++;
      if (r.turnover === "interception") ints++;
      if (r.turnover === "fumble") fumbles++;
      if (r.end === "touchdown" && r.scorer === 0) tds++;
      const gain = r.turnover ? 0 : r.end === "incomplete" ? 0 : Math.round(yardOf(r.x) - 40);
      yards.push(r.end === "touchdown" ? 60 : gain);
    }
    yards.sort((a, b) => a - b);
    const avg = yards.reduce((n, y) => n + y, 0) / N;
    const pct = (n: number, of = N) => `${Math.round((n / Math.max(1, of)) * 100)}`.padStart(5);
    console.log(
      `${off.padEnd(5)} ${def.padEnd(6)} ${avg.toFixed(1).padStart(5)} ${String(yards[N >> 1]).padStart(5)} ${pct(yards.filter((y) => y > 0).length)} ${pct(caught, thrown)} ${pct(sacks)} ${pct(ints)} ${pct(fumbles)} ${pct(tds)}  ${String(Math.round(ticks / N)).padStart(5)}  ${JSON.stringify(by)}`,
    );
  }
}

console.log(`\nkickoffs from the 35, ${N}`);
const rules: Record<string, number> = {};
const starts: number[] = [];
let returnTds = 0;
const r = seeded(99);
for (let i = 0; i < N; i++) {
  const p = kickoff({ tee: xOfYard(35), onside: false, human: null, fx, wind: calm, seed: i * 31 + 5 });
  p.kick = computerKickoff(r);
  const res = runPlay(p);
  const key = res.end === "touchdown" ? "return td" : res.rule ?? "returned";
  rules[key] = (rules[key] ?? 0) + 1;
  if (res.end === "touchdown") returnTds++;
  else if (!res.rule) starts.push(Math.round(100 - yardOf(res.x)));
}
starts.sort((a, b) => a - b);
console.log(rules, "median return start (receiving team's yard line):", starts[starts.length >> 1], "tds:", returnTds);

console.log(`\npunts from own 30, ${N}`);
const prules: Record<string, number> = {};
const nets: number[] = [];
for (let i = 0; i < N; i++) {
  const los = xOfYard(30);
  const p = punt({ los, human: null, fx, wind: calm, seed: i * 37 + 3 });
  p.kick = computerPunt(r, 70, 1);
  const res = runPlay(p);
  const key = res.end === "touchdown" ? "return td" : res.rule ?? "returned";
  prules[key] = (prules[key] ?? 0) + 1;
  if (res.end !== "touchdown") {
    const spot = res.rule === "touchback" ? 80 : yardOf(res.x);
    nets.push(Math.round(spot - 30));
  }
}
nets.sort((a, b) => a - b);
console.log(prules, "median net punt:", nets[nets.length >> 1]);
