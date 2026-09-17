"use client";

/* TWO CARTRIDGES, ONE SLOT.
 *
 * The arcade holds two games and mounts one of them at a time. That is not a
 * layout preference: both listen to the whole window for the arrow keys and the
 * space bar, and two games mounted together would both take every press. A
 * switch at the top is also simply how an arcade menu works.
 *
 * The choice lives in the URL's hash, so a link can go straight to either game
 * and the back button behaves.
 */

import { useEffect, useState } from "react";

import { CommishBowl } from "@/components/CommishBowl";
import { LongKick } from "@/components/LongKick";
import { play } from "@/lib/sfx";

type Game = "bowl" | "kick";

const GAMES: { id: Game; label: string; hash: string }[] = [
  { id: "bowl", label: "COMMISH BOWL", hash: "#bowl" },
  { id: "kick", label: "LONG KICK", hash: "#long-kick" },
];

const fromHash = (hash: string): Game => (hash === "#long-kick" ? "kick" : "bowl");

export function ArcadeSwitch() {
  const [game, setGame] = useState<Game>("bowl");

  // Read after mount: the server has no hash, and rendering on it would hydrate
  // to different markup than the server sent.
  useEffect(() => {
    const sync = () => setGame(fromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Games" className="flex flex-wrap gap-2">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === game}
            onClick={() => {
              if (g.id === game) return;
              play("move");
              window.history.pushState(null, "", g.hash);
              setGame(g.id);
            }}
            className="btn btn-nav"
          >
            {g.label}
          </button>
        ))}
      </nav>
      {game === "bowl" ? <CommishBowl /> : <LongKick />}
    </div>
  );
}
