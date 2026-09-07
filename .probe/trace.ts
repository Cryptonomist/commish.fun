import { setupPlay, newWorld, step, TOP, BOTTOM, type World, type Input } from "../src/lib/bowl";

const w: World = newWorld();
setupPlay(w);
const UNIT = (i: number) => (i < 4 ? `L${i}` : i < 6 ? `B${i - 4}` : "SAF");

console.log("snap: runner", w.runner.x.toFixed(0), w.runner.y.toFixed(0));
console.log("defence:", w.defence.map((d, i) => `${UNIT(i)}@${d.x.toFixed(0)},${d.y.toFixed(0)}`).join(" "));
console.log("blockers:", w.blockers.map((b) => `${b.x.toFixed(0)},${b.y.toFixed(0)}`).join(" "));
console.log("field band:", TOP, "to", BOTTOM);

// Straight down the middle, no evasion, to see the raw shape of the pursuit.
const input: Input = { dx: 1, dy: 0 };
for (let i = 1; i <= 200; i++) {
  const res = step(w, input);
  if (i % 5 === 0 || res !== "live") {
    const near = w.defence
      .map((d, j) => ({ j, dx: d.x - w.runner.x, dy: d.y - w.runner.y, s: d.slowed }))
      .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))
      .slice(0, 3)
      .map((n) => `${UNIT(n.j)} dx${n.dx.toFixed(0)} dy${n.dy.toFixed(0)}${n.s ? " SLOW" : ""}`)
      .join("  ");
    console.log(`t${String(i).padStart(3)} run ${w.runner.x.toFixed(0)},${w.runner.y.toFixed(0)}  ${near}`);
  }
  if (res !== "live") { console.log("=>", res, "at", ((w.runner.x - w.los) / 6).toFixed(1), "yd"); break; }
}
