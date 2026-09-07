/* How long is a play, in seconds? The drive loop starts at the snap and stops
   at the whistle, so this is the only number that decides how long the track
   should be — anything past it is never heard. */
import { setupPlay, newWorld, nextDown, step, TICK_MS, TOP, BOTTOM, START, TO_GAIN, type World, type Input } from "../src/lib/bowl";

function bot(w: World, gain: number, phase: number): Input {
  const r = w.runner;
  const ahead = w.defence.filter((d) => d.x > r.x - 6 && d.x < r.x + 120);
  let bestY = r.y, best = -Infinity;
  for (let y = TOP; y <= BOTTOM; y += 3) {
    let near = Infinity;
    for (const d of ahead) {
      const dist = Math.hypot((d.x - r.x) * 0.5, d.y - y);
      if (dist < near) near = dist;
    }
    const sc = near - Math.abs(y - r.y) * 0.15;
    if (sc > best) { best = sc; bestY = y; }
  }
  const closest = Math.min(...w.defence.map((d) => Math.hypot(d.x - r.x, d.y - r.y)));
  return { dx: 1, dy: (bestY - r.y) / gain + Math.sin(w.frame / 6 + phase) * 0.15, spin: closest < 18 };
}

const secs: number[] = [];
const kickSecs: number[] = [];
for (const gain of [3, 5, 8]) for (const phase of [0, 1.1, 2.2, 3.3, 4.4, 5.5]) {
  // kickoff
  const k = newWorld(); setupPlay(k);
  let t = 0, res: string = "live";
  for (let i = 0; i < 4000 && res === "live"; i++) { res = step(k, bot(k, gain, phase)); t++; }
  kickSecs.push((t * TICK_MS) / 1000);

  // a drive of scrimmage downs
  const w = newWorld(); w.kind = "scrimmage"; w.los = START; w.marker = START + TO_GAIN;
  for (let snap = 0; snap < 40; snap++) {
    setupPlay(w);
    let ticks = 0; let r: string = "live";
    for (let i = 0; i < 4000 && r === "live"; i++) { r = step(w, bot(w, gain, phase)); ticks++; }
    secs.push((ticks * TICK_MS) / 1000);
    if (r === "touchdown") break;
    if (nextDown(w) === "turnover") break;
  }
}
const q = (a: number[], f: number) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
console.log(`scrimmage plays: n=${secs.length}  p10 ${q(secs,0.1).toFixed(1)}s  median ${q(secs,0.5).toFixed(1)}s  p90 ${q(secs,0.9).toFixed(1)}s  max ${q(secs,1).toFixed(1)}s`);
console.log(`kickoff returns: n=${kickSecs.length}  median ${q(kickSecs,0.5).toFixed(1)}s  max ${q(kickSecs,1).toFixed(1)}s`);
