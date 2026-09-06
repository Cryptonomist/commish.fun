/* The season schedule, generated once and committed.
 *
 * This is the file COMMISHHANDOFF.md asked for and nobody built:
 *
 *   schedule.json generated once from ESPN per week (lockTs = earliest
 *   kickoff, byeTeams, games[]); committed
 *
 * Three separate defects all come back to not having it. Lock times were
 * derived as WEEK_1_KICKOFF plus seven days a week, which was wrong by a day
 * for the whole of 2026 and drifts anyway because real weeks are not seven days
 * apart. Bye teams were pickable, though the spec says twice that they must not
 * be, so a member could pick a team that was not playing and be eliminated for
 * it. And the commissioner posted results into an alphabetical grid of
 * thirty-two teams with no idea who played whom.
 *
 * Run it with:  node scripts/build-schedule.mjs [season]
 *
 * IT IS COMMITTED, NOT FETCHED. `lock_ts` goes on chain at pool creation and
 * `submit_pick` enforces it to the second, so these numbers are part of the
 * deal a member joins. A file that changed under a running season would move
 * deadlines people had already planned around. Regenerating it only affects
 * pools created afterwards, which is the correct behaviour and the reason it is
 * a build step rather than a runtime call.
 *
 * The feed is ESPN's undocumented endpoint, which is fine here in a way it is
 * not at runtime: this runs once, on a developer's machine, and its output is
 * reviewed in a diff before anybody depends on it.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEASON = Number(process.argv[2] ?? 2026);
const WEEKS = 18;
const OUT = path.join(ROOT, "src", "data", `nfl-schedule-${SEASON}.json`);
const ESPN =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

/* The feed calls Washington WSH; the on-chain team index calls it WAS and that
 * index cannot move. Same alias as `abbrFromFeed` in lib/nfl.ts, duplicated
 * because this script does not run through the TypeScript path aliases — the
 * assertion below is what stops the two drifting apart. */
const ALIASES = { WSH: "WAS" };

/** The canonical thirty-two, read out of lib/nfl.ts so this cannot invent one. */
function canonicalTeams() {
  const src = fs.readFileSync(path.join(ROOT, "src", "lib", "nfl.ts"), "utf8");
  const abbrs = [...src.matchAll(/abbr: "([A-Z]{2,3})"/g)].map((m) => m[1]);
  if (abbrs.length !== 32) {
    throw new Error(`Expected 32 teams in lib/nfl.ts, found ${abbrs.length}`);
  }
  return new Set(abbrs);
}

const normalize = (a) => ALIASES[a] ?? a;
const toEpoch = (iso) => Math.floor(new Date(iso).getTime() / 1000);

async function fetchWeek(week) {
  const url = `${ESPN}?seasontype=2&week=${week}&dates=${SEASON}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`week ${week}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const canonical = canonicalTeams();
  const weeks = [];

  for (let w = 1; w <= WEEKS; w++) {
    const d = await fetchWeek(w);
    if (d?.week?.number !== w) {
      throw new Error(`Asked for week ${w}, feed answered ${d?.week?.number}`);
    }

    const games = [];
    const playing = new Set();
    for (const e of d.events ?? []) {
      const comp = e.competitions?.[0];
      const sides = comp?.competitors ?? [];
      const home = sides.find((c) => c.homeAway === "home")?.team?.abbreviation;
      const away = sides.find((c) => c.homeAway === "away")?.team?.abbreviation;
      if (!home || !away) continue;
      const [h, a] = [normalize(home), normalize(away)];
      for (const t of [h, a]) {
        if (!canonical.has(t)) {
          throw new Error(
            `Week ${w}: feed team "${t}" is not one of the thirty-two in lib/nfl.ts. ` +
              `Either the league changed or an alias is missing.`,
          );
        }
        playing.add(t);
      }
      games.push({ away: a, home: h, kickoff: toEpoch(e.date) });
    }

    if (games.length === 0) throw new Error(`Week ${w} came back with no games`);
    games.sort((x, y) => x.kickoff - y.kickoff);

    /* The lock is the week's FIRST kickoff, which is the whole product. Taken
     * from the games rather than assumed, because it moves: a Wednesday opener,
     * a Thursday most weeks, a Friday for a holiday. */
    const lockTs = games[0].kickoff;
    const byes = [...canonical].filter((t) => !playing.has(t)).sort();

    weeks.push({ week: w, lockTs, byes, games });
    console.log(
      `  week ${String(w).padStart(2)}  ${games.length} games  ` +
        `${byes.length} bye${byes.length === 1 ? "" : "s"}${byes.length ? ` (${byes.join(" ")})` : ""}  ` +
        `lock ${new Date(lockTs * 1000).toISOString()}`,
    );
  }

  /* create_pool requires strictly increasing locks. If the feed ever hands back
   * a week that opens before the one before it, that is a bad schedule and it
   * should fail here rather than at pool creation. */
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].lockTs <= weeks[i - 1].lockTs) {
      throw new Error(
        `Week ${i + 1} locks at or before week ${i}. create_pool would refuse this.`,
      );
    }
  }

  const out = {
    season: SEASON,
    generated: new Date().toISOString(),
    source: "espn",
    weeks,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  const total = weeks.reduce((n, w) => n + w.games.length, 0);
  console.log(
    `\n${path.relative(ROOT, OUT)}  ${WEEKS} weeks, ${total} games, ` +
      `${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`,
  );
}

await main();
