/* Where does a kickoff return actually end up? A return that always scores is
   not a play, and one that always dies on the 5 is a loading screen. */
import { setupPlay, newWorld, nextDown, step, yardLine, TOP, BOTTOM, TUNING, type World, type Input } from "../src/lib/bowl";

function bot(w: World, gain: number, phase: number): Input {
  const r = w.runner;
  const ahead = w.defence.filter((d) => d.x > r.x - 6 && d.x < r.x + 140);
  let bestY = r.y, bestScore = -Infinity;
  for (let y = TOP; y <= BOTTOM; y += 3) {
    let near = Infinity;
    for (const d of ahead) {
      const dist = Math.hypot((d.x - r.x) * 0.5, d.y - y);
      if (dist < near) near = dist;
    }
    const score = near - Math.abs(y - r.y) * 0.15;
    if (score > bestScore) { bestScore = score; bestY = y; }
  }
  const closest = Math.min(...w.defence.map((d) => Math.hypot(d.x - r.x, d.y - r.y)));
  return { dx: 1, dy: (bestY - r.y) / gain + Math.sin(w.frame / 6 + phase) * 0.15, spin: closest < 18 };
}

function trial() {
  const ends: number[] = [];
  let tds = 0;
  for (const gain of [3, 5, 8]) for (const phase of [0, 1.1, 2.2, 3.3, 4.4, 5.5]) {
    const w = newWorld();
    setupPlay(w);
    let res: string = "live";
    for (let i = 0; i < 4000 && res === "live"; i++) res = step(w, bot(w, gain, phase));
    if (res === "touchdown") { tds++; ends.push(100); continue; }
    nextDown(w);
    ends.push(yardLine(w));
  }
  ends.sort((a, b) => a - b);
  const q = (f: number) => ends[Math.floor(f * (ends.length - 1))];
  return { tds, n: ends.length, p10: q(0.1), med: q(0.5), p90: q(0.9), best: ends[ends.length - 1] };
}

const r = trial();
console.log(`returns ${r.n}  touchdowns ${r.tds}`);
console.log(`ends at own yard line — p10 ${r.p10}  median ${r.med}  p90 ${r.p90}  best ${r.best}`);
