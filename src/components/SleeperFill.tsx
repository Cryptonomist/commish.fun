"use client";

/* Pull a final table out of the league everybody actually played in.
 *
 * The commissioner is looking at their standings in another tab. Asking them to
 * retype the order into a payout sheet is how a sheet gets posted wrong, and
 * the wrong name on a prize is the one mistake this product cannot shrug off.
 *
 * IT FILLS, IT DOES NOT DECIDE. Same rule as filling a week from the
 * scoreboard: the chain only ever sees what the commissioner signed, the
 * members' veto is untouched, and this is a button rather than something that
 * happens on load, because a person should take somebody else's data
 * deliberately. It also cannot know a league's own rules — a side pot for
 * highest week, a punishment for last place — so it proposes the ordinary
 * reading and expects to be corrected.
 *
 * THE MATCH IS BY NAME AND IT IS OFTEN WRONG. A Sleeper display name and the
 * name somebody typed when joining this pool are two different strings written
 * months apart. Whatever matches is filled, whatever does not is left blank and
 * counted out loud, because a fill that silently assigns the wrong person is
 * worse than one that assigns nobody.
 */

import { useState } from "react";

import type { SleeperLeague, SleeperStanding } from "@/lib/sleeper";

type Member = { wallet: string; name: string };

export function SleeperFill({
  members,
  slotCount,
  onFill,
}: {
  members: Member[];
  slotCount: number;
  /** slot index -> wallet base58, for whatever could be matched. */
  onFill: (draft: Record<number, string>) => void;
}) {
  const [id, setId] = useState("");
  const [league, setLeague] = useState<SleeperLeague | null>(null);
  const [order, setOrder] = useState<SleeperStanding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(
        `/api/sleeper?league=${encodeURIComponent(id.trim())}`,
      );
      const body = (await res.json()) as
        | (SleeperLeague & { error?: undefined })
        | { error: string };
      if (!res.ok || "error" in body) {
        throw new Error(
          "error" in body ? body.error : "Could not read that league.",
        );
      }
      setLeague(body);
      const { payoutOrder } = await import("@/lib/sleeper");
      setOrder(payoutOrder(body));
    } catch (e) {
      setLeague(null);
      setOrder([]);
      setError(e instanceof Error ? e.message : "Could not read that league.");
    } finally {
      setLoading(false);
    }
  }

  function fill() {
    const norm = (s: string) => s.trim().toLowerCase();
    const byName = new Map(members.map((m) => [norm(m.name), m.wallet]));
    const taken = new Set<string>();
    const draft: Record<number, string> = {};
    let matched = 0;

    order.slice(0, slotCount).forEach((s, i) => {
      const wallet = byName.get(norm(s.name));
      // One person cannot hold two slots on a sheet the program will accept,
      // so a duplicate match is dropped rather than silently overwriting.
      if (wallet && !taken.has(wallet)) {
        draft[i] = wallet;
        taken.add(wallet);
        matched++;
      }
    });

    onFill(draft);
    setNote(
      matched === slotCount
        ? `Filled all ${slotCount} from Sleeper. Check them before posting.`
        : `Filled ${matched} of ${slotCount}. The rest are names that do not ` +
          `match anybody in this pool, so pick those yourself.`,
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-night-3 bg-night/40 p-3">
      <p className="text-xs font-bold tracking-[0.14em] text-cream-dim">
        FILL FROM SLEEPER
      </p>

      <div className="mt-2 flex gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="League id from the Sleeper URL"
          inputMode="numeric"
          className="min-w-0 grow rounded-lg border border-night-3 bg-night-2 px-3 py-2.5 text-sm text-cream outline-none placeholder:text-cream-dim/50 focus:border-action"
        />
        <button
          type="button"
          onClick={load}
          disabled={loading || id.trim().length === 0}
          className="shrink-0 rounded-lg border border-night-3 px-4 text-sm font-bold text-cream transition-colors hover:border-action disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Reading…" : "Read"}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-out">{error}</p> : null}

      {league ? (
        <>
          <p className="mt-3 text-sm text-cream">
            {league.name}{" "}
            <span className="text-cream-dim">
              · {league.season} · {league.totalRosters} teams
            </span>
          </p>
          <p className="text-xs text-cream-dim">
            {league.championRosterId !== null
              ? "Ordered by the playoff bracket, then the regular season table."
              : "No playoff bracket yet, so this is the regular season table: wins, then points for."}
          </p>

          <ol className="mt-2 flex flex-col gap-1">
            {order.slice(0, Math.max(slotCount, 5)).map((s, i) => (
              <li
                key={s.rosterId}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-cream">
                  <span className="mr-2 text-cream-dim tabular-nums">
                    {i + 1}.
                  </span>
                  {s.name}
                </span>
                <span className="shrink-0 text-xs text-cream-dim tabular-nums">
                  {s.wins}-{s.losses}
                  {s.ties > 0 ? `-${s.ties}` : ""} · {s.points.toFixed(2)}
                </span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={fill}
            className="mt-3 h-11 w-full rounded-lg border border-action text-sm font-bold tracking-wide text-action transition-colors hover:bg-action/10"
          >
            Use this order
          </button>

          {note ? <p className="mt-2 text-xs text-cream-dim">{note}</p> : null}

          <p className="mt-2 text-xs text-cream-dim">
            This only fills the form. Nothing reaches the chain until you post
            the sheet, and members can still throw it out.
          </p>
        </>
      ) : null}
    </div>
  );
}
