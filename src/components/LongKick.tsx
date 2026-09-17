"use client";

/* LONG KICK: how far back can you make one from?
 *
 * The homepage has a field goal game in its hero, and that one is a plan view
 * on purpose, drawn over the page's own field. This is the arcade's version,
 * and it gets everything that one cannot have: the kicker's-eye view, a real
 * flight with wind along the field and across it, a crossbar and uprights you
 * can ring, weather, the time of day, and the league record to chase.
 *
 * The rules are lib/longkick.ts. The kick is components/FieldGoalKick.tsx,
 * which Commish Bowl uses for its field goals as well, so a fifty-yarder here
 * is the same fifty-yarder there.
 *
 * Nothing here touches a wallet or the chain. The only thing it writes is a
 * longest kick, in this browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { GuideButton, GuideLink, OptionRow, SoundToggle, useSound } from "@/components/ArcadeKit";
import { FieldGoalKick, type KickResult } from "@/components/FieldGoalKick";
import {
  EFFECTS,
  kickWind,
  TIME_OPTIONS,
  type TimeOfDay,
  type Weather,
  WEATHER_OPTIONS,
  type Wind,
} from "@/lib/conditions";
import {
  afterKick,
  celebrates,
  newRun,
  NFL_RECORD,
  NFL_RECORD_HOLDER,
  noteFor,
  type Run,
  runOver,
  STRIKES,
  windForKick,
} from "@/lib/longkick";
import { LANDSCAPE_PLAY_QUERY } from "@/lib/mobile";
import { PX } from "@/lib/pixel";
import { seeded, type Rng } from "@/lib/rng";
import { play } from "@/lib/sfx";

const BEST_KEY = "commish.longkick.best";

/** The house kit: the brand's orange with chalk trim. Nobody's club. */
const HOUSE = { lead: PX.action, trim: PX.chalk };

type Screen = "setup" | "kick" | "over";

export function LongKick() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [weather, setWeather] = useState<Weather>("clear");
  const [time, setTime] = useState<TimeOfDay>("day");
  const [run, setRun] = useState<Run>(newRun);
  const [best, setBest] = useState(0);
  const [kickNo, setKickNo] = useState(0);
  const [wind, setWind] = useState<Wind>({ x: 0, y: 0 });
  const [celebrate, setCelebrate] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sound, toggleSound] = useSound();

  const rngRef = useRef<Rng>(seeded(1));
  const bestRef = useRef(0);

  /* Sideways on a phone fills the screen, the same way Commish Bowl does and
   * for the reasons lib/mobile.ts gives: CSS, not the fullscreen API. */
  const [sideways, setSideways] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(LANDSCAPE_PLAY_QUERY);
    const apply = () => setSideways(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    if (!sideways || screen !== "kick") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sideways, screen]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(BEST_KEY)) || 0;
      bestRef.current = stored;
      setBest(stored);
    } catch {
      // A browser that refuses storage still gets to kick; it just forgets.
    }
  }, []);

  const start = useCallback(() => {
    /* Seeded from the clock inside a click, which is the only place a game's
     * dice should come from: never during render, where the server and the
     * browser would roll different ones. */
    rngRef.current = seeded(Date.now());
    setWind(windForKick(rngRef.current, weather));
    setRun(newRun());
    setNote(null);
    setCelebrate(false);
    setKickNo((n) => n + 1);
    play("confirm");
    setScreen("kick");
  }, [weather]);

  /* Read through a ref, not a state updater: an updater may run twice in
   * development, and this one plays a fanfare and writes to storage. */
  const runRef = useRef(run);
  runRef.current = run;

  const onResult = useCallback((r: KickResult) => {
    const current = runRef.current;
    const before = bestRef.current;
    setNote(noteFor(current.distance, r.good, before));
    const party = celebrates(current.distance, r.good, before);
    setCelebrate(party);
    if (party) play("champion");
    if (r.good && current.distance > before) {
      bestRef.current = current.distance;
      setBest(current.distance);
      try {
        window.localStorage.setItem(BEST_KEY, String(current.distance));
      } catch {
        // Not remembering a best is not a reason to stop the game.
      }
    }
    const after = afterKick(current, r.good);
    runRef.current = after;
    setRun(after);
  }, []);

  const next = useCallback(() => {
    if (runOver(run)) {
      setScreen("over");
      return;
    }
    // A new wind every kick, miss or make: see windForKick.
    setWind(windForKick(rngRef.current, weather));
    setNote(null);
    setCelebrate(false);
    setKickNo((n) => n + 1);
  }, [run, weather]);

  const carry = EFFECTS[weather].carry;

  return (
    <div
      className={
        sideways && screen === "kick"
          ? "game-surface panel-primary scanlines fixed inset-0 z-50 flex h-[100dvh] w-[100dvw] flex-col overflow-hidden"
          : "game-surface panel-primary scanlines relative overflow-hidden"
      }
    >
      {/* TOP RAIL: the same furniture as Commish Bowl's, a different cartridge. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-chalk px-3 py-2 font-matrix text-[10px] leading-4">
        <span className="text-chalk">LONG KICK</span>
        {screen === "kick" ? (
          <span className="flex items-center gap-1" aria-label={`${run.strikesLeft} of ${STRIKES} misses left`}>
            {Array.from({ length: STRIKES }, (_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="inline-block h-2.5 w-4 rounded-[50%] border border-panel"
                style={{ background: i < run.strikesLeft ? "#7A4A22" : "transparent", borderColor: i < run.strikesLeft ? PX.panel : PX.dim }}
              />
            ))}
          </span>
        ) : null}
        <span className="flex items-center gap-3">
          <span className="text-chalk tabular-nums">BEST {best > 0 ? `${best} YD` : "NONE"}</span>
          <span className="hidden text-cream-dim sm:inline">NFL RECORD {NFL_RECORD}</span>
          {sideways && screen === "kick" ? null : <GuideButton />}
          <SoundToggle on={sound} onToggle={toggleSound} />
        </span>
      </div>

      {screen === "setup" ? (
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="font-matrix text-[13px] leading-5 text-chalk">HOW FAR BACK CAN YOU MAKE ONE FROM?</p>
            <p className="max-w-xl text-sm leading-relaxed text-cream-dim">
              Start at {newRun().distance} yards. Every make moves you back, every miss costs one of
              your {STRIKES} strikes and you go again from the same spot. The NFL record is {NFL_RECORD}{" "}
              yards ({NFL_RECORD_HOLDER}).
            </p>
          </div>
          <OptionRow label="WEATHER" options={WEATHER_OPTIONS} value={weather} onChange={setWeather} />
          <OptionRow label="TIME OF DAY" options={TIME_OPTIONS} value={time} onChange={setTime} />
          <div className="flex flex-col gap-3">
            <button type="button" onClick={start} className="btn btn-primary w-fit">
              START KICKING
            </button>
            <GuideLink>How to aim, set the power and hit it clean: every control is listed under the game.</GuideLink>
          </div>
        </div>
      ) : screen === "kick" ? (
        <FieldGoalKick
          key={kickNo}
          distance={run.distance}
          look={{ time, weather }}
          wind={kickWind(wind)}
          carry={carry}
          kicker={HOUSE}
          rush={null}
          auto={null}
          title={`KICK ${run.kicks + 1}`}
          kickerName="YOU"
          continueLabel={runOver(run) ? "SEE HOW FAR" : "NEXT KICK"}
          onResult={onResult}
          onContinue={next}
          celebrate={celebrate}
          note={note}
          sideways={sideways}
        />
      ) : (
        <div className="flex flex-col items-start gap-4 p-4 sm:p-6" aria-live="polite">
          <p className="font-matrix text-[16px] leading-6 text-chalk">
            {run.longest > 0 ? `YOUR LONGEST: ${run.longest} YARDS` : "NOTHING THROUGH THIS TIME"}
          </p>
          <p className="max-w-xl text-sm leading-relaxed text-cream-dim">
            {run.longest > NFL_RECORD
              ? `That is longer than any field goal ever made in an NFL game. Cam Little's record is ${NFL_RECORD}.`
              : run.longest === NFL_RECORD
                ? "That ties the NFL record."
                : run.longest > 0
                  ? `${run.made} made on ${run.kicks} kicks. The NFL record is ${NFL_RECORD}, ${NFL_RECORD - run.longest} yards further back.`
                  : `${run.kicks} kicks, no makes. The wind and the accuracy needle are the whole game: aim into the flag and stop the needle in the green.`}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={start} className="btn btn-primary">
              KICK AGAIN
            </button>
            <button
              type="button"
              onClick={() => {
                play("move");
                setScreen("setup");
              }}
              className="btn btn-secondary"
            >
              CHANGE CONDITIONS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
