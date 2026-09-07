/* THE BALANCE SEARCH. Not shipped; run by hand when the numbers move.
 *
 * A chase game cannot be balanced by looking at it. This drives a bot through
 * every drive a grid of policies produces, for every candidate TUNING, and
 * reports how often a competent player would score and who is making the
 * tackles. What it caught, in order: a defence that gained exactly three yards
 * on every play ever run, a probe that reported one drive two hundred times,
 * and a defensive line that made eighty-two per cent of the tackles.
 */
import {
  kickoff, newWorld, nextDown, step, gainOf, TOP, BOTTOM, TUNING,
  type World, type Input,
} from "../src/lib/bowl";

type Policy = { gapBias: number; jitter: number; phase: number; spinAt: number };

/** Aim for the widest lane among the defenders ahead, which is what a person
 *  does. Fleeing the nearest man walks you into the next one. */
function bot(w: World, p: Policy, tick: number): Input {
  const r = w.runner;
  const ahead = w.defence.filter((d) => d.x > r.x - 6 && d.x < r.x + 120);
  let bestY = r.y;
  let bestScore = -Infinity;
  for (let y = TOP; y <= BOTTOM; y += 3) {
    let nearest = Infinity;
    for (const d of ahead) {
      const dist = Math.hypot((d.x - r.x) * 0.5, d.y - y);
      if (dist < nearest) nearest = dist;
    }
    const score = nearest - Math.abs(y - r.y) * p.gapBias;
    if (score > bestScore) { bestScore = score; bestY = y; }
  }
  const closest = Math.min(...w.defence.map((d) => Math.hypot(d.x - r.x, d.y - r.y)));
  const dy = (bestY - r.y) / 7 + Math.sin(tick / 6 + p.phase) * p.jitter;
  return { dx: 1, dy, spin: closest < p.spinAt };
}

const POLICIES: Policy[] = [];
for (const gapBias of [0.05, 0.15, 0.35])
  for (const jitter of [0, 0.2])
    for (const phase of [0, 1.3, 2.6, 4.1])
      for (const spinAt of [12, 20, 28]) POLICIES.push({ gapBias, jitter, phase, spinAt });

const UNIT = (i: number) => (i < 4 ? "line" : i < 6 ? "backer" : "safety");

function evaluate() {
  let scored = 0;
  const gains: number[] = [];
  const by: Record<string, number> = { line: 0, backer: 0, safety: 0 };
  let firstDowns = 0;
  let plays = 0;
  for (const p of POLICIES) {
    const w = newWorld();
    // A drive runs until it scores or turns over. The cap is a runaway guard.
    for (let snap = 0; snap < 60; snap++) {
      kickoff(w);
      plays++;
      let res: string = "live";
      for (let i = 0; i < 4000 && res === "live"; i++) res = step(w, bot(w, p, i));
      gains.push(gainOf(w));
      if (res === "touchdown") { scored++; break; }
      let near = "line", nd = Infinity;
      w.defence.forEach((d2, i) => {
        const dist = Math.hypot(d2.x - w.runner.x, d2.y - w.runner.y);
        if (dist < nd) { nd = dist; near = UNIT(i); }
      });
      by[near]++;
      const out = nextDown(w);
      if (out === "first-down") firstDowns++;
      if (out === "turnover") break;
    }
  }
  gains.sort((a, b) => a - b);
  return {
    rate: scored / POLICIES.length,
    median: gains[Math.floor(gains.length / 2)],
    max: gains[gains.length - 1],
    firstDowns: firstDowns / POLICIES.length,
    plays: plays / POLICIES.length,
    by,
  };
}

const arg = process.argv[2];
if (arg === "sweep") {
  const rows: { label: string; rate: number; median: number; max: number }[] = [];
  for (const run of [2.1, 2.25, 2.4])
    for (const lineSpeed of [0.9, 1.05])
      for (const backSpeed of [1.2, 1.35, 1.5])
        for (const safeSpeed of [1.5, 1.7]) {
          TUNING.runSpeed = run;
          TUNING.line.forEach((u) => (u.speed = lineSpeed));
          TUNING.backers.forEach((u) => (u.speed = backSpeed));
          TUNING.safety.speed = safeSpeed;
          const r = evaluate();
          rows.push({ label: `run ${run} line ${lineSpeed} back ${backSpeed} safe ${safeSpeed}`, ...r });
        }
  rows.sort((a, b) => a.rate - b.rate);
  for (const r of rows) {
    console.log(`${(r.rate * 100).toFixed(0).padStart(3)}%  med ${String(r.median).padStart(2)}  max ${String(r.max).padStart(3)}   ${r.label}`);
  }
} else {
  const r = evaluate();
  console.log(`scored ${(r.rate * 100).toFixed(0)}% of drives  median gain ${r.median}  max ${r.max}`);
  console.log(`first downs per drive ${r.firstDowns.toFixed(1)}  plays per drive ${r.plays.toFixed(1)}`);
  console.log("tackled by:", r.by);
}
