/* WHOLE GAMES, MEASURED. Not shipped; run by hand when the rules move.
 *
 *   npx tsx .probe/bowlgame.ts [games] [length]
 *
 * Plays full games with the computer coaching both sides and prints what a
 * box score would: points, how many snaps a game takes, how often it goes to
 * overtime, and anything a real game would never produce.
 */
import { simulateGame } from "../src/lib/bowlsim";
import type { GameLength, Weather } from "../src/lib/conditions";

const N = Number(process.argv[2]) || 60;
const length = (process.argv[3] ?? "standard") as GameLength;

for (const weather of ["clear", "rain", "snow", "wind"] as Weather[]) {
  const totals: number[] = [];
  const snaps: number[] = [];
  let ot = 0;
  let ties = 0;
  let stuck = 0;
  const lines: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const { game, snaps: n } = simulateGame({ weather, time: "day", length }, [3, 21], i * 977 + 31);
    if (game.stage.kind !== "final") stuck++;
    totals.push(game.score[0] + game.score[1]);
    snaps.push(n);
    if (game.quarter >= 5) ot++;
    if (game.score[0] === game.score[1]) ties++;
    for (const line of game.log) {
      const key = line
        .replace(/\d+/g, "#")
        .replace(/\b(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LAC|LAR|LV|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SEA|SF|TB|TEN|WAS)\b/g, "T");
      lines[key] = (lines[key] ?? 0) + 1;
    }
  }
  totals.sort((a, b) => a - b);
  snaps.sort((a, b) => a - b);
  console.log(
    `${weather.padEnd(6)} ${length}: total points median ${totals[N >> 1]} (min ${totals[0]}, max ${totals[N - 1]}), snaps median ${snaps[N >> 1]}, overtime ${ot}, ties ${ties}, never ended ${stuck}`,
  );
  if (weather === "clear") {
    const top = Object.entries(lines).sort((a, b) => b[1] - a[1]).slice(0, 26);
    for (const [k, v] of top) console.log(`   ${String(v).padStart(5)}  ${k}`);
  }
}
