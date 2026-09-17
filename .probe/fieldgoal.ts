/* THE LEG, MEASURED. Not shipped; run by hand when fieldgoal.ts's numbers move.
 *
 *   npx tsx .probe/fieldgoal.ts
 *
 * Prints how far a straight kick reaches at each power in still air and in a
 * strong wind either way, and how often the computer's kicker makes a kick from
 * each distance. Every tuned constant in lib/fieldgoal.ts came out of reading
 * these two tables, not out of watching a ball fly.
 */
import { computerKick, driftAt, reach, resolveKick } from "../src/lib/fieldgoal";
import { seeded } from "../src/lib/rng";

const powers = [0, 0.25, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
console.log("reach (yards) by power");
for (const [label, along, carry] of [
  ["calm", 0, 1],
  ["tail 20", 20, 1],
  ["head 20", -20, 1],
  ["snow", 0, 0.92],
] as const) {
  console.log(
    label.padEnd(8),
    powers.map((p) => `${p}:${reach(p, along, carry).toFixed(1)}`).join("  "),
  );
}

console.log("\ncrosswind drift at the posts (yards), power 0.9");
for (const mph of [5, 10, 15, 20]) {
  console.log(
    `cross ${mph}`.padEnd(8),
    [30, 45, 55, 65].map((d) => `${d}:${driftAt(d, 0.9, { cross: mph, along: 0 }).toFixed(2)}`).join("  "),
  );
}

console.log("\ncomputer make rate by distance (400 kicks each)");
for (const [label, wind] of [
  ["calm", { cross: 0, along: 0 }],
  ["cross 15", { cross: 15, along: 0 }],
  ["head 12", { cross: 5, along: -12 }],
] as const) {
  const row: string[] = [];
  for (const d of [25, 33, 40, 45, 50, 55, 60, 65, 70]) {
    const r = seeded(d * 7919 + label.length);
    let made = 0;
    for (let i = 0; i < 400; i++) {
      const input = computerKick(r, d, wind, 1);
      if (resolveKick(d, input, wind, 1).outcome === "good") made++;
    }
    row.push(`${d}:${Math.round((made / 400) * 100)}%`);
  }
  console.log(label.padEnd(8), row.join("  "));
}
