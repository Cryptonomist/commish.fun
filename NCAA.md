# College football: what it would take

A plan, not a change. Nothing in here is built.

**The recommendation is conference-scoped pools**: an SEC pool, a Big Ten pool,
a Big 12 pool. Not one national pool of 134 teams. That is partly because 134
does not fit in the program, and mostly because a 134-team Survivor pool is a
worse game than the one we already have.

---

## 1. The wall

The program holds exactly thirty-two teams, and it is not a constant to bump.

```rust
pub used_mask: u32,             // Member — one bit per team
pub pick_mask: u32,
pub owned_mask: u32,
pub winners: [u32; WEEKS],      // Pool — one bit per team, per week
pub pushes:  [u32; WEEKS],
pub const TEAM_COUNT: u8 = 32;
```

Those bitsets are the account layout. It is pinned by
`state::tests::account_sizes_are_what_we_think` and it is already deployed.
NCAA FBS is about 134 teams.

Widening the masks to hold 134 means a 136-bit bitset in five places. `winners`
and `pushes` are eighteen-week arrays, so **Pool grows by roughly 470 bytes and
Member by about 39** — rent every pool pays forever. The bit arithmetic in
`rules::survives`, `settle_member` and `Member::has_used` all moves from `u32`
operations to bitset operations, which drags the mode kit into it; PROGRAM.md is
explicit that a mode is "one arm of `rules::survives`, and nothing else", and
this would be the first change to break that. Every deployed pool becomes
unreadable.

There are no pools in production, so that migration is free today and never
again.

## 2. Why the smaller version is also the better one

This is the argument that would matter even if both cost the same.

**Survivor works because you run out of teams.** Thirty-two over eighteen NFL
weeks is tight: by week nine the safe picks are spent, which is the whole
strategic hook and the thing the landing page's playable demo exists to teach.

A hundred and thirty-four teams over a fourteen-week college season means you
never run out. Take a ranked team against an FCS opponent every week and coast
to the end. The scarcity *is* the game, and a national pool deletes it.

It also matches how these are actually run. Nobody organises a 134-team college
survivor pool. They organise an SEC pool.

Conference sizes sit comfortably inside thirty-two with room for realignment.

## 3. What changes on chain

Two bytes on `Pool`, and three checks that currently read constants.

```rust
pub league: u8,      // which team table this pool's indices mean
pub last_week: u8,   // the final week of this league's season
```

**`league`** is not optional and it is not a client concern. Today the program
knows "team 5" and nothing else; if the client alone decides whether that means
Buffalo or Alabama, then a client bug shows the wrong names on a live pool and
members pick blind. The team index is a contract — the same rule that already
governs the NFL table in `lib/nfl.ts` — so the pool has to record which table it
is a contract *for*.

**`last_week`** exists because a college regular season is about fourteen weeks
and `advance_week` ends a pool with `week as usize >= WEEKS`, where WEEKS is
eighteen. A fourteen-week pool would reach its real last week, find four empty
weeks ahead of it, and sit at LOCKED forever — never settling, never paying out,
until the deadman refund fired months later. The check becomes
`week >= pool.last_week`.

Three validations stop reading constants and start reading the pool:

| Now | Becomes |
|---|---|
| `require!(team < TEAM_COUNT)` in `submit_pick` | `team < league_teams(pool.league)` |
| `winners \| pushes` unbounded in `post_results` | reject bits above the league's team count |
| `week as usize >= WEEKS` in `advance_week` | `week >= pool.last_week` |

That needs one table in the program:

```rust
pub fn league_teams(league: u8) -> Option<u8> { /* 0 => 32 (NFL), … */ }
```

`create_pool` rejects an unknown league, exactly the way `mode_enabled` already
rejects an unbuilt mode. A league that is not in the table cannot take money.

Pool goes from 1,616 bytes to 1,618. The pinned size test fails, somebody
updates it deliberately, which is the behaviour that test was written for.

## 4. The team tables are a contract, and this is the real risk

Everything else here is ordinary work. This is the part that can quietly ruin a
season.

The tables must be **generated once, frozen, and committed** — never fetched at
runtime. The feed already carries every conference with team colours
(`color` / `alternateColor`), so a `scripts/build-teams.mjs` alongside
`build-brand.mjs` writes them out and nobody hand-authors 130 colour pairs.

But once a pool exists, its indices are permanent. If the table is regenerated
mid-season and one team's position moves, every `used_mask` in every live pool
silently means something different. Members would have spent teams they never
picked. The generator therefore has to emit a checksum that a test pins, so a
regeneration that reorders anything fails the build instead of rewriting
history.

**Realignment makes this worse, and it is the thing to design for now.**
Conference membership moves between seasons. If the SEC gains a team in 2027,
`LEAGUE_SEC` no longer means what it meant in 2026, and pools created under the
old table are still on chain referring to it.

So the league id must be immutable per *table*, not per conference:
`SEC_2026` and `SEC_2027` are different leagues with different ids. Old pools
keep resolving against the table they were created with, forever. This costs
nothing now and is close to unfixable later.

## 5. The schedule

College weeks are not NFL weeks. Byes are staggered, teams play twelve games
across fourteen weeks, and conference championship week sits on its own.

Byes need no program change: if your team is not playing, you pick someone else,
exactly as in the NFL. It is the picker's problem and always has been.

What does need work is the lock schedule. `create_pool` demands eighteen
strictly increasing locks with a gap wider than `MIN_POST_DELAY + dispute
window`, and a college season has fourteen. The tail gets padded with dates past
the end of the season and `last_week` stops the pool ever reaching them.

Worth doing at the same time: the NFL schedule is currently derived as
`WEEK_1_KICKOFF + n × 7 days`, which already drifts from reality — see the note
in `lib/schedule.ts` and the bug fixed in `946a4f2`. College is far worse,
because the first kickoff of each week moves around. Both leagues want their
locks read from the schedule feed rather than computed, and doing that once
serves both.

## 6. Client work

- `src/lib/leagues.ts` — the registry: id, display name, season, team table,
  generated and checksummed.
- `TEAMS` becomes `teamsFor(pool.league)`. Every grid that imports the table
  today needs the pool's league threaded to it: `PickGrid`, `ResultsForm`,
  `ResultsPanel`, `TryAWeek`.
- `PoolView` gains `league` and `lastWeek`; `decodePool` gains two fields and
  the encoding check gains two rows.
- `/pools/new` gains a sport-and-conference step, and stops passing
  `POOL_SURVIVOR` with an implied NFL.
- `ScoreTicker` gains a league so a college pool's front door shows college
  scores. `lib/scores.ts` already isolates the provider; this is a second
  endpoint on the same shape.
- The landing page's format list gains college, with the same honest
  availability labels it uses today.

## 7. Phasing

1. **On chain.** The two fields, the three checks, the league table, the size
   test updated. NFL becomes league 0 and behaves identically. Redeploy,
   re-vendor the IDL, extend the encoding check.
2. **One conference, end to end.** The table generator, the SEC, the create
   form, the grids. Prove it with a real pool on the fast clock before adding
   any more.
3. **The rest.** Remaining conferences, the ticker's league switch, the landing
   page copy.

Phase 1 is the only part that touches money. Phases 2 and 3 are ordinary
frontend work that cannot corrupt an existing pool.

## 8. What this does not change

The escrow, the veto, the deadman refund, the claim path, and every one of the
four ways money leaves a vault. `rules::survives` keeps its shape — a Survivor
pool is a Survivor pool whether the teams are professional or not. Nothing in
this plan asks for a new trust assumption.

## 9. The honest estimate

Phase 1 is a day, most of it care rather than code: the account layout moves and
that deserves the same treatment the veto epoch got. Phase 2 is two or three,
with the generator and its checksum being the fiddly part. Phase 3 is a day.

The largest single change since the escrow itself, and the only one so far that
alters an account layout after deployment. It is worth doing while there is
nothing in production to migrate.
