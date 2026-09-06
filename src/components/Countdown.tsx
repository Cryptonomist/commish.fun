"use client";

/* The clock to first kickoff.
 *
 * Rendered null on the server and on the first client paint, then filled in
 * after mount. A countdown computed during SSR is wrong by the time it reaches
 * the browser, and React will scream about the mismatch — so the honest thing
 * is to admit it is client state.
 */

import { useEffect, useState } from "react";
import { countdown } from "@/lib/format";
import { WEEK_1_KICKOFF } from "@/lib/nfl";

export function Countdown({ to = WEEK_1_KICKOFF }: { to?: Date }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setLabel(countdown(to));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);

  return (
    <span className="tabular-nums text-gold">{label ?? "…"}</span>
  );
}
