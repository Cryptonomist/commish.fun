"use client";

/* COMMISH BOWL: a whole game of football against the computer.
 *
 * WHAT THIS IS NOT. It is not Tecmo Bowl and it is not an emulator. Tecmo Bowl
 * is Tecmo's copyrighted 1987 game; its ROM, its code and its art are theirs,
 * and the NFL and NFLPA licences that put real players in it are not ours to
 * borrow. So this is an original game written from nothing, in the visual
 * idiom of that era: hard pixels, a handful of colours, sprites made of
 * rectangles. The idiom belongs to nobody. The game is ours.
 *
 * WHAT IT IS. Pick a club, the weather, the hour and how long the quarters
 * are, call the toss, and play four quarters: kickoffs with a power meter and
 * the wind to aim into, three plays to call on offence and three on defence,
 * four downs, punts, field goals and extra points from behind the holder, a
 * clock that stops when an NFL clock stops, halftime, and overtime.
 *
 * THIS FILE OWNS THE CLOCK, THE CANVAS, THE KEYS AND THE BUTTONS. The rules are
 * elsewhere and none of them needs a browser: one snap is lib/bowlplay.ts, the
 * game around the snaps is lib/bowlgame.ts, the picture is lib/bowldraw.ts,
 * and field goals are components/FieldGoalKick.tsx over lib/fieldgoal.ts. The
 * tests play whole games through those modules with nobody watching, which is
 * the only honest way to check a game that the preview surface cannot animate.
 *
 * EVERY WORD IS DOM. The canvas paints the field and the players; the
 * scoreboard, the play calls and what happened on the last snap are text a
 * screen reader reaches and a person can select. A canvas game cannot be made
 * fully non-visual, which is exactly why nothing in the product depends on
 * this page.
 *
 * It autoplays nothing, collects nothing, and writes nothing anywhere.
 */

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  GuideButton,
  GuideLink,
  OptionRow,
  SoundToggle,
  useSound,
  WindBadge,
} from "@/components/ArcadeKit";
import { BowlScoreboard } from "@/components/BowlScoreboard";
import { FieldGoalKick, type KickResult } from "@/components/FieldGoalKick";
import { BOTTOM, TICK_MS, TOP, VIEW_H, VIEW_W } from "@/lib/bowl";
import { cameraFor, drawBowl, focusOf, screenX } from "@/lib/bowldraw";
import {
  abbr,
  applyExtraPoint,
  applyFieldGoal,
  applyKickoff,
  applyPunt,
  applyScrimmage,
  beforeSnap,
  callTimeout,
  callToss,
  canTimeout,
  chooseOpening,
  chooseTry,
  clubName,
  computerDefense,
  computerOffense,
  computerOnside,
  computerTimeout,
  computerTry,
  CPU,
  downLabel,
  effects,
  frameOf,
  type Game,
  HUMAN,
  linesSince,
  losX,
  markerX,
  newGame,
  offenseOptions,
  rival,
  screenWind,
  spotLabel,
  startOvertime,
  startSecondHalf,
  type Team,
  windFor,
  winner,
} from "@/lib/bowlgame";
import {
  computerKickoff,
  computerOnside as onsideCall,
  computerPunt,
  type Control,
  type DefCall,
  kickLanding,
  kickoff,
  MID,
  type OffCall,
  type Play,
  punt,
  scrimmage,
  stepPlay,
  xOfYard,
  yardOf,
} from "@/lib/bowlplay";
import * as kit from "@/lib/audiokit";
import { fanfare, startDrive, stopMusic } from "@/lib/chiptune";
import {
  DEFAULT_CONDITIONS,
  type Conditions,
  gust,
  headingOf,
  kickWind,
  type KickWind,
  LENGTH_OPTIONS,
  TIME_OPTIONS,
  WEATHER_OPTIONS,
  windMph,
} from "@/lib/conditions";
import { type Bit, burst, CONFETTI_MAX_FRAMES, stepConfetti } from "@/lib/confetti";
import { type Flake, makeWeather, stepWeather } from "@/lib/fieldfx";
import {
  accuracyPeriod,
  computerKick,
  fieldGoalDistance,
  type KickInput,
  needle,
  PAT_DISTANCE,
  POWER_PERIOD,
  triangle,
} from "@/lib/fieldgoal";
import { createGameMusic, type Phase as MusicPhase } from "@/lib/gamemusic";
import { LANDSCAPE_PLAY_QUERY } from "@/lib/mobile";
import { TEAMS } from "@/lib/nfl";
import type { Kit } from "@/lib/pixel";
import { roll, type Rng, seeded } from "@/lib/rng";
import { play as sound } from "@/lib/sfx";

/* ------------------------------------------------------------------ modes */

type Mode =
  | { kind: "card" }
  | { kind: "aim" }
  | { kind: "live"; frame: Team; call: string | null; help: string }
  | { kind: "result"; title: string; lines: string[]; tone: "good" | "bad" | "plain" }
  | {
      kind: "kick";
      purpose: "fg" | "pat";
      kicker: Team;
      distance: number;
      wind: KickWind;
      auto: KickInput | null;
      key: number;
    };

type MeterPhase = "aim" | "power" | "accuracy";

const OFF_WORDS: Record<OffCall, string> = {
  run: "RUN",
  short: "SHORT PASS",
  deep: "DEEP PASS",
  kneel: "KNEEL",
};
const DEF_WORDS: Record<DefCall, string> = { run: "RUN STOP", cover: "COVER", blitz: "BLITZ" };

/* What each call is for, said once where it is chosen. */
const OFF_NOTES: Record<"run" | "short" | "deep", string> = {
  run: "Hand it to the back. Best against coverage.",
  short: "A quick throw. Beats the blitz.",
  deep: "Go for the big one. Beats a run stop, and the rush has time to get home.",
};
const DEF_NOTES: Record<DefCall, string> = {
  run: "Crowd the line. Stops the run, gives up the deep ball.",
  cover: "Drop everybody back. Stops the deep ball, gives up the run.",
  blitz: "Send the linebackers. Wrecks a deep drop, beaten by a quick throw.",
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** A club far enough from `us` to read as the other team at sprite size. The
 *  league was measured for this when the arcade had one drive: six pairs of
 *  clubs share a lead colour outright. */
function pickOpponent(us: number, r: () => number): number {
  const MIN = 120;
  const start = Math.floor(r() * TEAMS.length);
  let best = -1;
  let bestGap = -1;
  for (let i = 0; i < TEAMS.length; i++) {
    const j = (start + i) % TEAMS.length;
    if (j === us) continue;
    const [r1, g1, b1] = rgb(TEAMS[us].lead);
    const [r2, g2, b2] = rgb(TEAMS[j].lead);
    const gap = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
    if (gap >= MIN) return j;
    if (gap > bestGap) {
      bestGap = gap;
      best = j;
    }
  }
  return best;
}

const kitOf = (g: Game, t: Team): Kit => ({ lead: TEAMS[g.teams[t]].lead, trim: TEAMS[g.teams[t]].trim });

export function CommishBowl() {
  /* -------------------------------------------------------------- setup */
  const [screen, setScreen] = useState<"setup" | "game">("setup");
  const [team, setTeam] = useState<number | null>(null);
  const [opponent, setOpponent] = useState<number | null>(null);
  const [conditions, setConditions] = useState<Conditions>(DEFAULT_CONDITIONS);

  /* -------------------------------------------------------------- game */
  const gameRef = useRef<Game | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [mode, setModeState] = useState<Mode>({ kind: "card" });
  const modeRef = useRef<Mode>({ kind: "card" });
  const setMode = useCallback((m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  const rngRef = useRef<Rng>(seeded(1));
  const playRef = useRef<Play | null>(null);
  const flakesRef = useRef<Flake[]>([]);
  const frameRef = useRef(0);
  const camRef = useRef(0);
  const seenRef = useRef(true);
  const confettiRef = useRef<Bit[] | null>(null);
  const confettiFramesRef = useRef(0);
  const kickKeyRef = useRef(0);
  const kickResultRef = useRef<KickResult | null>(null);
  const [kickNote, setKickNote] = useState<string | null>(null);

  /* The meters for a kickoff or a punt, in refs: they move every frame. */
  const meterRef = useRef<{ phase: MeterPhase; clock: number; aim: number; power: number; accuracy: number }>({
    phase: "aim",
    clock: 0,
    aim: 0,
    power: 0,
    accuracy: 0,
  });
  const [meterPhase, setMeterPhase] = useState<MeterPhase>("aim");
  const aimHoldRef = useRef(0);
  const powerFillRef = useRef<HTMLDivElement | null>(null);
  const landRef = useRef<HTMLSpanElement | null>(null);
  const needleRef = useRef<HTMLDivElement | null>(null);
  const aimTextRef = useRef<HTMLSpanElement | null>(null);

  /* The person's hands. */
  const keysRef = useRef<Record<string, boolean>>({});
  const actionRef = useRef(false);
  const throwRef = useRef(0);
  const pickRef = useRef(-1);
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  const tapRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const nextSeed = useCallback(() => Math.floor(roll(rngRef.current) * 2 ** 31), []);

  /* --------------------------------------------------------------- sound */
  const music = useRef(
    createGameMusic({
      startLoop: (n) => kit.startLoop(n),
      stopLoop: () => kit.stopLoop(),
      startSynth: () => startDrive(),
      stopSynth: () => stopMusic(),
      playOnce: (n, onEnded) => kit.playOnce(n, 1, onEnded),
      stopOneShots: () => kit.stopOneShots(),
      fanfare: () => fanfare(),
    }),
  ).current;
  const phaseNow = useCallback(
    (): MusicPhase => (modeRef.current.kind === "live" ? "live" : "stopped"),
    [],
  );
  const onSoundOn = useCallback(() => {
    kit.preload(["kickoff", "drive", "touchdown"]);
    music.resume(phaseNow);
  }, [music, phaseNow]);
  const [sfx, toggleSfx] = useSound(onSoundOn);

  /* ------------------------------------------------------ sideways phones */
  const [sideways, setSideways] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(LANDSCAPE_PLAY_QUERY);
    const apply = () => setSideways(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const fullscreen = sideways && screen === "game";
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  /* ---------------------------------------------------------- the preview */

  /** The formation for whatever is about to happen, so the field between
   *  plays shows the ball on its spot and both teams lined up. */
  const preview = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const s = g.stage;
    const fx = effects(g);
    if (s.kind === "kickoff") {
      playRef.current = kickoff({ tee: losX(g), onside: false, human: null, fx, wind: windFor(g, s.kicker), seed: 1 });
    } else if (s.kind === "scrimmage" || s.kind === "two" || s.kind === "try") {
      const offense = s.kind === "scrimmage" ? g.possession : s.team;
      playRef.current = scrimmage({
        los: losX(g),
        marker: markerX(g),
        off: "run",
        def: "run",
        human: null,
        fx,
        wind: windFor(g, offense),
        seed: 1,
      });
    } else if (!playRef.current) {
      // Before the opening kickoff: the teams lined up for it, as scenery.
      playRef.current = kickoff({ tee: xOfYard(35), onside: false, human: null, fx, wind: g.wind, seed: 1 });
    }
  }, []);

  /* -------------------------------------------------------- starting play */

  const goLive = useCallback(
    (p: Play, frame: Team, call: string | null) => {
      playRef.current = p;
      setMode({ kind: "live", frame, call, help: helpFor(p) });
      sound("snap");
      music.snap(p.type === "kickoff", phaseNow);
    },
    [music, phaseNow, setMode],
  );

  const beginGame = useCallback(() => {
    if (team === null || opponent === null) return;
    const seed = Date.now() >>> 0;
    rngRef.current = seeded(seed ^ 0x5bd1e995);
    const g = newGame(conditions, [team, opponent], seed);
    gameRef.current = g;
    flakesRef.current = makeWeather(seed, conditions.weather);
    confettiRef.current = null;
    playRef.current = null;
    preview();
    setMode({ kind: "card" });
    setScreen("game");
    sound("confirm");
    bump();
  }, [team, opponent, conditions, setMode, preview]);

  /** Whatever the stage is, show its card, and lay out its formation. */
  const toCard = useCallback(() => {
    preview();
    setMode({ kind: "card" });
    bump();
  }, [preview, setMode]);

  const startKickoff = useCallback(
    (onside: boolean) => {
      const g = gameRef.current;
      if (!g || g.stage.kind !== "kickoff") return;
      logMarkRef.current = g.said;
      const s = g.stage;
      const human = s.kicker === HUMAN;
      const p = kickoff({
        tee: losX(g),
        onside,
        human: human ? 0 : 1,
        fx: effects(g),
        wind: windFor(g, s.kicker),
        seed: nextSeed(),
      });
      if (human && !onside) {
        playRef.current = p;
        meterRef.current = { phase: "aim", clock: 0, aim: 0, power: 0, accuracy: 0 };
        setMeterPhase("aim");
        setMode({ kind: "aim" });
        return;
      }
      p.kick = onside ? onsideCall(rngRef.current) : computerKickoff(rngRef.current);
      goLive(p, s.kicker, onside ? "ONSIDE KICK" : null);
    },
    [goLive, nextSeed, setMode],
  );

  const startFieldGoal = useCallback(
    (kicker: Team, purpose: "fg" | "pat") => {
      const g = gameRef.current;
      if (!g) return;
      const distance = purpose === "pat" ? PAT_DISTANCE : fieldGoalDistance(100 - g.ballOn);
      const w = kickWind(gust(rngRef.current, windFor(g, kicker), g.conditions.weather));
      const auto = kicker === CPU ? computerKick(rngRef.current, distance, w, effects(g).carry) : null;
      kickKeyRef.current += 1;
      kickResultRef.current = null;
      setKickNote(null);
      setMode({ kind: "kick", purpose, kicker, distance, wind: w, auto, key: kickKeyRef.current });
    },
    [setMode],
  );

  const startPunt = useCallback(
    (kicker: Team) => {
      const g = gameRef.current;
      if (!g) return;
      const p = punt({
        los: losX(g),
        human: kicker === HUMAN ? 0 : 1,
        fx: effects(g),
        wind: windFor(g, kicker),
        seed: nextSeed(),
      });
      if (kicker === HUMAN) {
        playRef.current = p;
        meterRef.current = { phase: "aim", clock: 0, aim: 0, power: 0, accuracy: 0 };
        setMeterPhase("aim");
        setMode({ kind: "aim" });
        return;
      }
      p.kick = computerPunt(rngRef.current, 100 - g.ballOn, effects(g).carry);
      goLive(p, kicker, "PUNT");
    },
    [goLive, nextSeed, setMode],
  );

  const startScrimmage = useCallback(
    (off: OffCall, def: DefCall) => {
      const g = gameRef.current;
      if (!g) return;
      const offense = g.stage.kind === "two" ? g.stage.team : g.possession;
      const p = scrimmage({
        los: losX(g),
        marker: markerX(g),
        off,
        def,
        human: offense === HUMAN ? 0 : 1,
        fx: effects(g),
        wind: windFor(g, offense),
        seed: nextSeed(),
      });
      const call = offense === HUMAN ? `${OFF_WORDS[off]} AGAINST THEIR ${DEF_WORDS[def]}` : `THEY CALLED ${OFF_WORDS[off]} AGAINST YOUR ${DEF_WORDS[def]}`;
      goLive(p, offense, call);
    },
    [goLive, nextSeed],
  );

  /** Where the play-by-play stood when the person made a call, so the lines
   *  shown after the play include anything that happened before the snap: a
   *  timeout by the computer, the two-minute warning. */
  const logMarkRef = useRef(0);

  /** The clock between snaps, and the computer's timeout, before any play
   *  from scrimmage. False when the time ran out first, in which case the
   *  card for whatever comes next is already up. */
  const snapClock = useCallback((): boolean => {
    const g = gameRef.current;
    if (!g) return false;
    logMarkRef.current = g.said;
    if (g.stage.kind !== "scrimmage") return true;
    if (computerTimeout(g, CPU)) callTimeout(g, CPU);
    if (!beforeSnap(g)) {
      sound("horn");
      preview();
      setMode({
        kind: "result",
        title: g.notice ?? "",
        lines: linesSince(g, logMarkRef.current),
        tone: "plain",
      });
      bump();
      return false;
    }
    return true;
  }, [preview, setMode]);

  /* ------------------------------------------------------------ decisions */

  const offenseCall = useCallback(
    (call: OffCall | "punt" | "field-goal") => {
      const g = gameRef.current;
      if (!g) return;
      sound("confirm");
      logMarkRef.current = g.said;
      if (g.stage.kind === "two") {
        startScrimmage(call as OffCall, computerDefense(g, CPU));
        return;
      }
      if (!snapClock()) return;
      if (call === "punt") startPunt(HUMAN);
      else if (call === "field-goal") startFieldGoal(HUMAN, "fg");
      else startScrimmage(call, computerDefense(g, CPU));
    },
    [snapClock, startFieldGoal, startPunt, startScrimmage],
  );

  const defenseCall = useCallback(
    (def: DefCall) => {
      const g = gameRef.current;
      if (!g) return;
      sound("confirm");
      logMarkRef.current = g.said;
      if (g.stage.kind === "two") {
        startScrimmage(roll(rngRef.current) < 0.55 ? "short" : "run", def);
        return;
      }
      if (!snapClock()) return;
      const call = computerOffense(g, CPU);
      if (call === "punt") startPunt(CPU);
      else if (call === "field-goal") startFieldGoal(CPU, "fg");
      else startScrimmage(call, def);
    },
    [snapClock, startFieldGoal, startPunt, startScrimmage],
  );

  const timeout = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (callTimeout(g, HUMAN)) {
      sound("tackle");
      bump();
    }
  }, []);

  /* ------------------------------------------------------ after a play */

  const finishPlay = useCallback(
    (p: Play) => {
      const g = gameRef.current;
      const m = modeRef.current;
      if (!g || !p.result || m.kind !== "live") return;
      const r = p.result;
      const frame = m.frame;
      const logBefore = logMarkRef.current;
      const stageBefore = g.stage.kind;

      if (p.type === "kickoff" || p.type === "onside") applyKickoff(g, r);
      else if (p.type === "punt") applyPunt(g, r);
      else applyScrimmage(g, r);

      const side = (s: 0 | 1 | null): Team | null => (s === null ? null : s === 0 ? frame : rival(frame));
      const scorer = side(r.scorer);
      const lost = r.turnover !== null && side(r.has) !== frame;
      const mine = (t: Team | null) => t === HUMAN;

      let title = "";
      let tone: "good" | "bad" | "plain" = "plain";
      if (r.end === "touchdown") {
        title = "TOUCHDOWN!";
        tone = mine(scorer) ? "good" : "bad";
        music.touchdown();
      } else {
        music.whistle();
        if (r.end === "safety") {
          title = "SAFETY!";
          tone = mine(scorer) ? "good" : "bad";
        } else if (r.turnover === "interception") {
          title = "INTERCEPTED!";
          tone = mine(frame) ? "bad" : "good";
        } else if (r.turnover === "fumble" && lost) {
          title = "FUMBLE!";
          tone = mine(frame) ? "bad" : "good";
        } else if (r.sacked) {
          title = "SACKED!";
          tone = mine(frame) ? "bad" : "good";
        } else if (r.rule === "onside") {
          title = side(r.has) === frame ? "RECOVERED!" : "ONSIDE KICK";
        } else if (g.notice === "FIRST DOWN") {
          title = "FIRST DOWN";
          tone = g.possession === HUMAN ? "good" : "bad";
        } else if (g.notice === "TURNOVER ON DOWNS") {
          title = "TURNOVER ON DOWNS";
          tone = g.possession === HUMAN ? "good" : "bad";
        } else if (r.rule === "touchback" || r.rule === "zone-touchback") {
          title = "TOUCHBACK";
        } else if (r.rule === "fair-catch") {
          title = "FAIR CATCH";
        }
      }
      if (tone === "good") sound(r.end === "touchdown" ? "win" : "first");
      else if (tone === "bad") sound("out");
      else sound("tackle");

      const lines = linesSince(g, logBefore);
      if (m.call) lines.unshift(m.call);
      if (stageBefore !== g.stage.kind && (g.stage.kind === "halftime" || g.stage.kind === "final" || g.stage.kind === "overtime")) {
        sound("horn");
      }
      if (g.stage.kind === "final" && winner(g) === HUMAN && !reducedMotion()) {
        confettiRef.current = burst(frameRef.current + 17);
        confettiFramesRef.current = 0;
      }
      setMode({ kind: "result", title, lines: lines.slice(-4), tone });
      bump();
    },
    [music, setMode],
  );

  const onKickResult = useCallback((r: KickResult) => {
    kickResultRef.current = r;
  }, []);

  const onKickContinue = useCallback(() => {
    const g = gameRef.current;
    const m = modeRef.current;
    const r = kickResultRef.current;
    if (!g || m.kind !== "kick" || !r) return;
    const logBefore = g.said;
    if (m.purpose === "fg") applyFieldGoal(g, r.good);
    else applyExtraPoint(g, r.good);
    const lines = linesSince(g, logBefore);
    if (g.stage.kind === "final") {
      sound("horn");
      if (winner(g) === HUMAN && !reducedMotion()) {
        confettiRef.current = burst(frameRef.current + 23);
        confettiFramesRef.current = 0;
      }
    }
    preview();
    setMode({
      kind: "result",
      title: r.good ? (m.purpose === "fg" ? "FIELD GOAL" : "") : "NO GOOD",
      lines,
      tone: r.good === (m.kicker === HUMAN) ? "good" : "bad",
    });
    bump();
  }, [preview, setMode]);

  /* ---------------------------------------------------------- the meters */

  const kickFromMeters = useCallback(() => {
    const p = playRef.current;
    const g = gameRef.current;
    if (!p || !g) return;
    const m = meterRef.current;
    p.kick = { power: m.power, accuracy: m.accuracy, aim: m.aim };
    // Only the person ever lines up a kick with the meters.
    logMarkRef.current = g.said;
    goLive(p, HUMAN, p.type === "punt" ? "PUNT" : null);
  }, [goLive]);

  const pressMeter = useCallback(() => {
    const m = meterRef.current;
    if (m.phase === "aim") {
      m.phase = "power";
      m.clock = 0;
      setMeterPhase("power");
      sound("move");
    } else if (m.phase === "power") {
      m.power = triangle(m.clock);
      m.phase = "accuracy";
      m.clock = 0;
      setMeterPhase("accuracy");
      sound("move");
    } else {
      m.accuracy = needle(m.clock);
      kickFromMeters();
    }
  }, [kickFromMeters]);

  /* ------------------------------------------------------------- the loop */

  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const reduced = reducedMotion();

    const readControl = (p: Play, mirrored: boolean): Control => {
      const k = keysRef.current;
      let dx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      const point = pointRef.current;
      if (point && !dx && !dy && p.human >= 0) {
        const a = p.actors[p.human];
        const ax = screenX(a.x, mirrored) - camRef.current + 4;
        const ay = a.y + 8;
        const d = Math.hypot(point.x - ax, point.y - ay);
        if (d >= 6) {
          dx = (point.x - ax) / d;
          dy = (point.y - ay) / d;
        }
      }
      const c: Control = {
        dx: mirrored ? -dx : dx,
        dy,
        action: actionRef.current,
        throwTo: throwRef.current,
        pick: pickRef.current,
      };
      actionRef.current = false;
      throwRef.current = 0;
      pickRef.current = -1;
      return c;
    };

    const render = () => {
      const g = gameRef.current;
      const p = playRef.current;
      if (!g || !p) {
        return;
      }
      const m = modeRef.current;
      const frame = m.kind === "live" ? m.frame : frameOf(g);
      const mirrored = frame === CPU;
      const target = cameraFor(focusOf(p), mirrored);
      camRef.current += (target - camRef.current) * (m.kind === "live" ? 0.2 : 1);
      const camX = Math.round(camRef.current);
      const humanQb =
        m.kind === "live" &&
        p.type === "scrimmage" &&
        p.humanSide === 0 &&
        p.carrier === 0 &&
        !p.thrown &&
        !p.crossed &&
        (p.off === "short" || p.off === "deep");
      drawBowl(ctx, {
        play: p,
        mirrored,
        kits: [kitOf(g, frame), kitOf(g, rival(frame))],
        camX,
        time: g.conditions.time,
        weather: g.conditions.weather,
        flakes: flakesRef.current,
        frame: frameRef.current,
        tags: humanQb,
        aim: m.kind === "aim" ? { degrees: meterRef.current.aim, power: meterRef.current.phase === "aim" ? 0.5 : triangle(meterRef.current.clock) } : null,
      });
      const bits = confettiRef.current;
      if (bits) {
        for (const b of bits) {
          if (!b.alive) continue;
          ctx.fillStyle = b.color;
          ctx.fillRect(Math.round(b.x * VIEW_W), Math.round(b.y * VIEW_H), b.size, b.size);
        }
      }
    };

    const tick = () => {
      frameRef.current += 1;
      const g = gameRef.current;
      const m = modeRef.current;
      if (g && !reduced) {
        const w = g.conditions.weather;
        stepWeather(flakesRef.current, w, (windFor(g, HUMAN).x ?? 0) * 0.03, VIEW_W, VIEW_H);
      }

      if (m.kind === "live") {
        const p = playRef.current;
        if (p && !p.result) {
          const mirrored = m.frame === CPU;
          stepPlay(p, readControl(p, mirrored));
          for (const e of p.events) {
            if (e === "throw") sound("throw");
            else if (e === "kick") sound("kick");
            else if (e === "spin") sound("spin");
            else if (e === "catch" || e === "fair-catch") sound("move");
            else if (e === "interception" || e === "fumble") sound("out");
          }
          if (p.result) finishPlay(p);
        }
      } else if (m.kind === "aim") {
        const meter = meterRef.current;
        const slow = reduced ? 0.5 : 1;
        if (meter.phase === "aim" && aimHoldRef.current !== 0) {
          meter.aim = Math.max(-25, Math.min(25, meter.aim + aimHoldRef.current * 0.6));
          if (aimTextRef.current) aimTextRef.current.textContent = aimWords(meter.aim);
        } else if (meter.phase === "power") {
          meter.clock += (TICK_MS / 1000 / POWER_PERIOD) * slow;
          const power = triangle(meter.clock);
          if (powerFillRef.current) powerFillRef.current.style.width = `${power * 100}%`;
          const p = playRef.current;
          if (g && p && landRef.current) {
            const k = p.actors[0];
            const land = kickLanding(
              p.type === "punt" ? "punt" : "kickoff",
              p.type === "punt" ? k.x + 8 : p.los,
              p.type === "punt" ? k.y + 8 : MID + 8,
              { power, accuracy: 0, aim: meter.aim },
              p.wind,
              p.fx,
            );
            landRef.current.textContent = landingWords(p, land.x, land.y);
          }
        } else if (meter.phase === "accuracy") {
          meter.clock += (TICK_MS / 1000 / accuracyPeriod(meter.power)) * slow;
          if (needleRef.current) needleRef.current.style.left = `${((needle(meter.clock) + 1) / 2) * 100}%`;
        }
      }

      if (confettiRef.current) {
        confettiFramesRef.current += 1;
        const alive = stepConfetti(confettiRef.current);
        if (alive === 0 || confettiFramesRef.current > CONFETTI_MAX_FRAMES) confettiRef.current = null;
      }
    };

    render();
    let raf = 0;
    let last = 0;
    let carry = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!seenRef.current) {
        last = 0;
        carry = 0;
        return;
      }
      if (!last) {
        last = t;
        music.resume(phaseNow);
      }
      carry += t - last;
      last = t;
      if (carry > TICK_MS * 6) carry = TICK_MS * 6;
      let dirty = false;
      while (carry >= TICK_MS) {
        carry -= TICK_MS;
        tick();
        dirty = true;
      }
      if (dirty && modeRef.current.kind !== "kick") render();
    };
    raf = requestAnimationFrame(loop);

    const io = new IntersectionObserver(
      ([entry]) => {
        seenRef.current = entry.isIntersecting;
        if (entry.isIntersecting) return;
        keysRef.current = {};
        music.silence();
      },
      { threshold: 0.2 },
    );
    io.observe(canvas);

    /* No silencing here. This effect restarts whenever the mode changes, so
     * the canvas it draws on can come and go around a field goal, and a snap
     * is a mode change: silencing on the way out cut off the music the snap
     * had just started. Leaving the page silences it, below. */
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [screen, mode.kind, finishPlay, music, phaseNow]);

  useEffect(() => () => music.silence(), [music]);

  /* ----------------------------------------------------------- the keys */

  useEffect(() => {
    if (screen !== "game") return;
    const map: Record<string, string> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
      W: "up",
      S: "down",
      A: "left",
      D: "right",
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const m = modeRef.current;
      if (m.kind === "kick") return; // the kick has its own keys
      const dir = map[e.key];
      if (m.kind === "aim") {
        if (dir === "left" || dir === "up") {
          aimHoldRef.current = -1;
          e.preventDefault();
        } else if (dir === "right" || dir === "down") {
          aimHoldRef.current = 1;
          e.preventDefault();
        } else if (e.key === " " || e.key === "Enter") {
          if (e.key === "Enter" && document.activeElement instanceof HTMLButtonElement) return;
          e.preventDefault();
          if (!e.repeat) pressMeter();
        }
        return;
      }
      if (m.kind !== "live") return;
      if (dir) {
        keysRef.current[dir] = true;
        e.preventDefault();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) actionRef.current = true;
        return;
      }
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        throwRef.current = Number(e.key);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = map[e.key];
      if (dir) keysRef.current[dir] = false;
      if (dir) aimHoldRef.current = 0;
    };
    const onBlur = () => {
      keysRef.current = {};
      pointRef.current = null;
      aimHoldRef.current = 0;
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [screen, pressMeter]);

  const pointerAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * VIEW_W,
      y: ((e.clientY - r.top) / r.height) * VIEW_H,
    };
  };

  /** A tap on a player: the nearest one on the person's side to the tap. */
  const pickAt = (x: number, y: number): number => {
    const p = playRef.current;
    const m = modeRef.current;
    if (!p || m.kind !== "live" || p.humanSide === null) return -1;
    const mirrored = m.frame === CPU;
    let best = -1;
    let dist = 16;
    p.actors.forEach((a, i) => {
      if (a.team !== p.humanSide) return;
      const d = Math.hypot(screenX(a.x, mirrored) - camRef.current + 4 - x, a.y + 8 - y);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  };

  /* ------------------------------------------------------------ the view */

  const g = gameRef.current;
  const humanTeamName = g ? clubName(g, HUMAN) : "";
  const cpuName = g ? clubName(g, CPU) : "";

  const setupScreen = (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="font-matrix text-[11px] leading-4 text-chalk">PICK YOUR TEAM</p>
        <ul className="grid w-full grid-cols-6 gap-1 sm:grid-cols-8">
          {TEAMS.map((t) => (
            <li key={t.abbr}>
              <button
                type="button"
                onClick={() => {
                  sound("move");
                  setTeam(t.i);
                  setOpponent(pickOpponent(t.i, Math.random));
                }}
                aria-label={`${t.city} ${t.name}`}
                aria-pressed={team === t.i}
                style={{ background: t.lead }}
                className={`bevel relative flex h-8 w-full items-center justify-center transition-transform duration-75 active:translate-x-[2px] active:translate-y-[2px] ${
                  team === t.i ? "outline outline-2 outline-offset-2 outline-chalk" : ""
                }`}
              >
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: t.trim }} />
                <span className="tile-label font-matrix text-[8px] leading-3">{t.abbr}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="min-h-5 text-xs leading-5 text-cream-dim">
          {team !== null && opponent !== null ? (
            <>
              The {TEAMS[team].city} {TEAMS[team].name} against the {TEAMS[opponent].city} {TEAMS[opponent].name}.{" "}
              <button
                type="button"
                className="underline decoration-dotted underline-offset-2 hover:text-chalk"
                onClick={() => {
                  sound("move");
                  setOpponent(pickOpponent(team, Math.random));
                }}
              >
                Different opponent
              </button>
            </>
          ) : (
            "Your opponent is picked for you, in a colour you can tell apart on the field."
          )}
        </p>
      </div>
      <OptionRow label="WEATHER" options={WEATHER_OPTIONS} value={conditions.weather} onChange={(weather) => setConditions((c) => ({ ...c, weather }))} />
      <OptionRow label="TIME OF DAY" options={TIME_OPTIONS} value={conditions.time} onChange={(time) => setConditions((c) => ({ ...c, time }))} />
      <OptionRow label="GAME LENGTH" options={LENGTH_OPTIONS} value={conditions.length} onChange={(length) => setConditions((c) => ({ ...c, length }))} />
      <div className="flex flex-col gap-3">
        <button type="button" onClick={beginGame} disabled={team === null} className="btn btn-primary w-fit">
          {team === null ? "PICK A TEAM FIRST" : "KICK OFF"}
        </button>
        <GuideLink>How to pass, run, kick and play defense: every control is listed under the game.</GuideLink>
      </div>
    </div>
  );

  return (
    <div
      className={
        fullscreen
          ? "game-surface panel-primary scanlines fixed inset-0 z-50 flex h-[100dvh] w-[100dvw] flex-col overflow-hidden"
          : "game-surface panel-primary scanlines relative overflow-hidden"
      }
    >
      {screen === "setup" || !g ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b-2 border-chalk px-3 py-2 font-matrix text-[10px] leading-4">
            <span className="text-chalk">COMMISH BOWL</span>
            <span className="flex items-center gap-2">
              <GuideButton />
              <SoundToggle on={sfx} onToggle={toggleSfx} />
            </span>
          </div>
          {setupScreen}
        </>
      ) : (
        <>
          <BowlScoreboard
            g={g}
            tools={
              <>
                {/* Not while the game covers the screen: the guide is under it. */}
                {fullscreen ? null : <GuideButton />}
                <SoundToggle on={sfx} onToggle={toggleSfx} />
              </>
            }
          />

          {mode.kind === "kick" ? (
            <FieldGoalKick
              key={mode.key}
              distance={mode.distance}
              look={{ time: g.conditions.time, weather: g.conditions.weather }}
              wind={mode.wind}
              carry={effects(g).carry}
              kicker={kitOf(g, mode.kicker)}
              rush={kitOf(g, rival(mode.kicker))}
              auto={mode.auto}
              title={mode.purpose === "fg" ? "FIELD GOAL" : "EXTRA POINT"}
              kickerName={mode.kicker === HUMAN ? humanTeamName : cpuName}
              continueLabel="CONTINUE"
              onResult={onKickResult}
              onContinue={onKickContinue}
              note={kickNote}
              sideways={fullscreen}
            />
          ) : (
            <div className={fullscreen ? "relative flex min-h-0 flex-1 items-center justify-center" : "relative"}>
              <canvas
                ref={canvasRef}
                width={VIEW_W}
                height={VIEW_H}
                role="img"
                aria-label="A pixel football field seen from above, with both teams on it."
                className={fullscreen ? "block touch-none" : "block w-full touch-none"}
                style={
                  fullscreen
                    ? { imageRendering: "pixelated", aspectRatio: "16 / 9", height: "100%", width: "auto", maxWidth: "100%" }
                    : { imageRendering: "pixelated", aspectRatio: "16 / 9" }
                }
                onPointerDown={(e) => {
                  if (modeRef.current.kind !== "live") return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const at = pointerAt(e);
                  pointRef.current = at;
                  tapRef.current = { ...at, t: performance.now() };
                }}
                onPointerMove={(e) => {
                  if (pointRef.current) pointRef.current = pointerAt(e);
                }}
                onPointerUp={(e) => {
                  const tap = tapRef.current;
                  const at = pointerAt(e);
                  if (tap && performance.now() - tap.t < 250 && Math.hypot(at.x - tap.x, at.y - tap.y) < 6) {
                    pickRef.current = pickAt(at.x, at.y);
                  }
                  pointRef.current = null;
                  tapRef.current = null;
                }}
                onPointerCancel={() => {
                  pointRef.current = null;
                  tapRef.current = null;
                }}
              />
              {mode.kind === "result" && mode.title ? (
                <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center px-3">
                  <span
                    className="kick-cleared panel px-4 py-2 font-matrix text-[16px] leading-6 sm:text-[22px] sm:leading-8"
                    style={{
                      color:
                        mode.tone === "good"
                          ? "var(--color-alive)"
                          : mode.tone === "bad"
                            ? "var(--color-out-lit)"
                            : "var(--color-chalk)",
                    }}
                  >
                    {mode.title}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {mode.kind !== "kick" ? (
            <div className="flex min-h-[120px] flex-col justify-center gap-2 border-t-2 border-chalk px-3 py-3" aria-live="polite">
              <Panel
                g={g}
                mode={mode}
                meterPhase={meterPhase}
                refs={{ powerFillRef, landRef, needleRef, aimTextRef }}
                onToss={(call) => {
                  const res = callToss(g, call);
                  sound(res.won ? "confirm" : "move");
                  preview();
                  if (!res.won) {
                    setMode({
                      kind: "result",
                      title: "",
                      lines: [`IT'S ${res.landed.toUpperCase()}. ${cpuName} WON THE TOSS AND DEFERRED.`, "YOU WILL RECEIVE THE OPENING KICKOFF."],
                      tone: "plain",
                    });
                  }
                  bump();
                }}
                onChoose={(choice) => {
                  chooseOpening(g, choice);
                  sound("confirm");
                  toCard();
                }}
                onKickoff={startKickoff}
                onOffense={offenseCall}
                onDefense={defenseCall}
                onTimeout={timeout}
                onTry={(kind) => {
                  sound("confirm");
                  if (kind === "kick") startFieldGoal(HUMAN, "pat");
                  else {
                    chooseTry(g, "two");
                    toCard();
                  }
                }}
                onComputerTry={() => {
                  if (computerTry(g) === "kick") startFieldGoal(CPU, "pat");
                  else {
                    chooseTry(g, "two");
                    toCard();
                  }
                }}
                onContinue={() => {
                  sound("move");
                  toCard();
                }}
                onSecondHalf={() => {
                  startSecondHalf(g);
                  sound("confirm");
                  toCard();
                }}
                onOvertime={() => {
                  startOvertime(g);
                  sound("confirm");
                  toCard();
                }}
                onPlayAgain={beginGame}
                onNewTeams={() => {
                  sound("move");
                  music.silence();
                  setScreen("setup");
                }}
                onMeterPress={pressMeter}
                aimHold={(dir) => {
                  aimHoldRef.current = dir;
                }}
                onAction={() => {
                  actionRef.current = true;
                }}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* WHAT THE CONTROLS DO ON THIS SNAP, and only this snap. The same keys mean a
 * spin, a throw, a switch or a fair catch depending on where the ball is, and
 * a paragraph listing all four at once is a paragraph nobody reads mid-play. */
function helpFor(p: Play): string {
  const side = p.humanSide;
  if (p.type === "scrimmage") {
    if (side === 1) {
      return "Chase with the player under the orange marker: arrows, WASD, or hold and drag. Space switches to the defender nearest the ball.";
    }
    if (p.off === "short" || p.off === "deep") {
      return "After the drop: 1, 2 or 3 throws to that receiver (or tap him), Space throws to the one lit yellow. Arrows scramble. After the catch, Space spins.";
    }
    return "Arrows, WASD, or hold and drag to run. Space spins once a play. Push into the sideline to go out of bounds and stop the clock.";
  }
  if (p.type === "punt") {
    return side === 1
      ? "Space while it is in the air calls a fair catch. Otherwise your returner fields it and you run it back."
      : "Cover it: chase the returner with the marked player. Space switches players.";
  }
  return side === 1
    ? "Your returner goes to the ball on his own. Once he has it: arrows or drag to run, Space to spin."
    : "Cover it: chase the returner with the marked player. Space switches players.";
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function aimWords(aim: number): string {
  const a = Math.round(aim);
  return a === 0 ? "STRAIGHT" : `${Math.abs(a)} ${a < 0 ? "UP" : "DOWN"}`;
}

/** Where a kick lining up now would come down, the way the returner's team
 *  would say it. */
function landingWords(p: Play, x: number, y: number): string {
  const yard = yardOf(x);
  // The same sidelines the kick itself is judged against in lib/bowlplay.ts.
  if (y < TOP - 4 || y > BOTTOM + 12) return "OUT OF BOUNDS";
  if (yard >= 100) return p.type === "punt" ? "END ZONE: TOUCHBACK" : "END ZONE: TOUCHBACK TO THE 35";
  const theirs = Math.round(100 - yard);
  if (p.type !== "punt" && theirs > 20) return `THEIR ${theirs}: SHORT, BALL AT THE 40`;
  return `LANDS AT THEIR ${theirs}`;
}

/* --------------------------------------------------------------- the panel */

type PanelProps = {
  g: Game;
  mode: Mode;
  meterPhase: MeterPhase;
  refs: {
    powerFillRef: React.RefObject<HTMLDivElement | null>;
    landRef: React.RefObject<HTMLSpanElement | null>;
    needleRef: React.RefObject<HTMLDivElement | null>;
    aimTextRef: React.RefObject<HTMLSpanElement | null>;
  };
  onToss: (call: "heads" | "tails") => void;
  onChoose: (choice: "receive" | "kick") => void;
  onKickoff: (onside: boolean) => void;
  onOffense: (call: OffCall | "punt" | "field-goal") => void;
  onDefense: (call: DefCall) => void;
  onTimeout: () => void;
  onTry: (kind: "kick" | "two") => void;
  onComputerTry: () => void;
  onContinue: () => void;
  onSecondHalf: () => void;
  onOvertime: () => void;
  onPlayAgain: () => void;
  onNewTeams: () => void;
  onMeterPress: () => void;
  aimHold: (dir: number) => void;
  onAction: () => void;
};

function Title({ children }: { children: React.ReactNode }) {
  return <p className="font-matrix text-[11px] leading-5 text-chalk sm:text-[12px]">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-5 text-cream-dim">{children}</p>;
}

function Buttons({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Choice({
  label,
  note,
  onClick,
  primary = false,
}: {
  label: string;
  note?: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={note}
      className={`btn btn-compact ${primary ? "btn-primary" : "btn-secondary"}`}
    >
      {label}
    </button>
  );
}

function Panel(props: PanelProps) {
  const { g, mode } = props;
  const s = g.stage;
  const last = g.log[g.log.length - 1];
  const human = abbr(g, HUMAN);
  const cpu = abbr(g, CPU);

  if (mode.kind === "live") {
    return (
      <>
        <Title>{mode.call ?? "BALL IS LIVE"}</Title>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Note>{mode.help}</Note>
          <button type="button" onClick={props.onAction} className="btn btn-compact btn-secondary">
            ACTION
          </button>
        </div>
      </>
    );
  }

  if (mode.kind === "aim") {
    const { powerFillRef, landRef, needleRef, aimTextRef } = props.refs;
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Title>{g.stage.kind === "kickoff" ? "YOUR KICKOFF" : "YOUR PUNT"}</Title>
          <WindNow g={g} />
        </div>
        {props.meterPhase === "aim" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Aim up the field"
                className="btn btn-secondary btn-compact w-12 px-0"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  props.aimHold(-1);
                }}
                onPointerUp={() => props.aimHold(0)}
                onPointerCancel={() => props.aimHold(0)}
              >
                &lt;
              </button>
              <span className="w-28 text-center font-matrix text-[10px] leading-4 text-chalk">
                AIM <span ref={aimTextRef}>STRAIGHT</span>
              </span>
              <button
                type="button"
                aria-label="Aim down the field"
                className="btn btn-secondary btn-compact w-12 px-0"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  props.aimHold(1);
                }}
                onPointerUp={() => props.aimHold(0)}
                onPointerCancel={() => props.aimHold(0)}
              >
                &gt;
              </button>
            </div>
            <Choice label="KICK" primary onClick={props.onMeterPress} />
          </div>
        ) : props.meterPhase === "power" ? (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap justify-between gap-2 font-matrix text-[10px] leading-4 text-chalk">
                <span>POWER</span>
                <span ref={landRef} />
              </span>
              <div className="relative h-4 border-2 border-chalk bg-panel">
                <div ref={powerFillRef} className="absolute inset-y-0 left-0 bg-action" style={{ width: "0%" }} />
              </div>
            </div>
            <Choice label="SET" primary onClick={props.onMeterPress} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-matrix text-[10px] leading-4 text-chalk">ACCURACY: STOP IT IN THE MIDDLE</span>
              <div className="relative h-4 border-2 border-chalk bg-panel">
                <div aria-hidden="true" className="absolute inset-y-0 bg-alive/40" style={{ left: "45%", width: "10%" }} />
                <div ref={needleRef} className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 bg-chalk" style={{ left: "50%" }} />
              </div>
            </div>
            <Choice label="SET" primary onClick={props.onMeterPress} />
          </div>
        )}
        <Note>
          {props.meterPhase === "aim"
            ? "Aim with the arrows or the buttons, into the wind on the scoreboard. Then Space or KICK."
            : props.meterPhase === "power"
              ? "The readout says where it will come down. Space or SET to lock the power."
              : "The harder the kick, the faster the needle. Space or SET."}
        </Note>
      </>
    );
  }

  if (mode.kind === "result") {
    const next =
      s.kind === "final" ? "SEE THE FINAL" : s.kind === "halftime" ? "GO TO HALFTIME" : "CONTINUE";
    return (
      <>
        {mode.lines.map((line, i) => (
          <Title key={i}>{line}</Title>
        ))}
        <Buttons>
          <Choice label={next} primary onClick={props.onContinue} />
        </Buttons>
      </>
    );
  }

  // Cards, by stage.
  if (s.kind === "toss") {
    return (
      <>
        <Title>COIN TOSS. {human}, CALL IT IN THE AIR.</Title>
        <Buttons>
          <Choice label="HEADS" primary onClick={() => props.onToss("heads")} />
          <Choice label="TAILS" primary onClick={() => props.onToss("tails")} />
        </Buttons>
      </>
    );
  }
  if (s.kind === "choose") {
    return (
      <>
        <Title>YOU WON THE TOSS.</Title>
        <Buttons>
          <Choice label="RECEIVE" primary onClick={() => props.onChoose("receive")} />
          <Choice label="DEFER AND KICK" onClick={() => props.onChoose("kick")} />
        </Buttons>
        <Note>Most NFL teams defer, so they get the ball to start the second half.</Note>
      </>
    );
  }
  if (s.kind === "kickoff") {
    if (s.kicker === HUMAN) {
      return (
        <>
          <Title>{s.afterSafety ? "FREE KICK FROM YOUR 20" : "YOUR KICKOFF"}</Title>
          <Buttons>
            <Choice label="KICK IT DEEP" primary onClick={() => props.onKickoff(false)} />
            {!s.afterSafety ? <Choice label="ONSIDE KICK" onClick={() => props.onKickoff(true)} /> : null}
          </Buttons>
          <Note>
            Into the end zone is a touchback to their 35. Short of their 20 comes back to the 40.
            In between, they have to return it. An onside kick is recovered about one time in five.
          </Note>
        </>
      );
    }
    return (
      <>
        <Title>{cpu} KICK OFF{s.afterSafety ? " FROM THEIR 20" : ""}.</Title>
        <Buttons>
          <Choice label="RETURN IT" primary onClick={() => props.onKickoff(computerOnside(g))} />
        </Buttons>
        <Note>Your returner goes to the ball on his own. Once he has it, run it back.</Note>
      </>
    );
  }
  if (s.kind === "scrimmage" && g.possession === HUMAN) {
    const o = offenseOptions(g);
    return (
      <>
        <Title>
          {downLabel(g)} ON {spotLabel(g.ballOn, HUMAN, g)}
        </Title>
        {last ? <Note>{last}</Note> : null}
        <Buttons>
          <Choice label="RUN" primary note={OFF_NOTES.run} onClick={() => props.onOffense("run")} />
          <Choice label="SHORT PASS" primary note={OFF_NOTES.short} onClick={() => props.onOffense("short")} />
          <Choice label="DEEP PASS" primary note={OFF_NOTES.deep} onClick={() => props.onOffense("deep")} />
          {o.punt ? <Choice label="PUNT" onClick={() => props.onOffense("punt")} /> : null}
          {o.fieldGoal !== null ? (
            <Choice label={`FIELD GOAL ${o.fieldGoal} YD`} onClick={() => props.onOffense("field-goal")} />
          ) : null}
          {o.kneel ? <Choice label="KNEEL" onClick={() => props.onOffense("kneel")} /> : null}
          {o.timeout ? <Choice label={`TIMEOUT (${g.timeouts[HUMAN]})`} onClick={props.onTimeout} /> : null}
        </Buttons>
      </>
    );
  }
  if (s.kind === "scrimmage") {
    return (
      <>
        <Title>
          {cpu} BALL: {downLabel(g)} ON {spotLabel(g.ballOn, CPU, g)}
        </Title>
        {last ? <Note>{last}</Note> : null}
        <Buttons>
          <Choice label="RUN STOP" primary note={DEF_NOTES.run} onClick={() => props.onDefense("run")} />
          <Choice label="COVER" primary note={DEF_NOTES.cover} onClick={() => props.onDefense("cover")} />
          <Choice label="BLITZ" primary note={DEF_NOTES.blitz} onClick={() => props.onDefense("blitz")} />
          {canTimeout(g, HUMAN) ? <Choice label={`TIMEOUT (${g.timeouts[HUMAN]})`} onClick={props.onTimeout} /> : null}
        </Buttons>
        <Note>You play the linebacker with the orange marker. Space switches to the defender nearest the ball.</Note>
      </>
    );
  }
  if (s.kind === "try") {
    if (s.team === HUMAN) {
      return (
        <>
          <Title>THE TRY.</Title>
          <Buttons>
            <Choice label={`KICK THE EXTRA POINT (${PAT_DISTANCE} YD)`} primary onClick={() => props.onTry("kick")} />
            <Choice label="GO FOR TWO" onClick={() => props.onTry("two")} />
          </Buttons>
        </>
      );
    }
    return (
      <>
        <Title>{cpu} LINE UP FOR THE TRY.</Title>
        <Buttons>
          <Choice label="WATCH" primary onClick={props.onComputerTry} />
        </Buttons>
      </>
    );
  }
  if (s.kind === "two") {
    if (s.team === HUMAN) {
      return (
        <>
          <Title>TWO-POINT TRY FROM THE 2.</Title>
          <Buttons>
            <Choice label="RUN" primary onClick={() => props.onOffense("run")} />
            <Choice label="SHORT PASS" primary onClick={() => props.onOffense("short")} />
            <Choice label="DEEP PASS" primary onClick={() => props.onOffense("deep")} />
          </Buttons>
        </>
      );
    }
    return (
      <>
        <Title>{cpu} GO FOR TWO.</Title>
        <Buttons>
          <Choice label="RUN STOP" primary onClick={() => props.onDefense("run")} />
          <Choice label="COVER" primary onClick={() => props.onDefense("cover")} />
          <Choice label="BLITZ" primary onClick={() => props.onDefense("blitz")} />
        </Buttons>
      </>
    );
  }
  if (s.kind === "halftime") {
    return (
      <>
        <Title>
          HALFTIME: {human} {g.score[HUMAN]}, {cpu} {g.score[CPU]}
        </Title>
        <Stats g={g} />
        <Buttons>
          <Choice label="START THE SECOND HALF" primary onClick={props.onSecondHalf} />
        </Buttons>
      </>
    );
  }
  if (s.kind === "overtime") {
    return (
      <>
        <Title>OVERTIME. {abbr(g, s.receiver)} WILL RECEIVE.</Title>
        <Note>Both teams get the ball unless the defence scores first. After that, the next score wins.</Note>
        <Buttons>
          <Choice label="START OVERTIME" primary onClick={props.onOvertime} />
        </Buttons>
      </>
    );
  }
  // Final.
  const w = winner(g);
  return (
    <>
      <Title>
        FINAL: {human} {g.score[HUMAN]}, {cpu} {g.score[CPU]}
        {g.quarter >= 5 ? " (OT)" : ""}.{" "}
        {w === "tie" ? "A TIE." : w === HUMAN ? "YOU WIN!" : `${cpu} WIN.`}
      </Title>
      <Stats g={g} />
      <Buttons>
        <Choice label="PLAY AGAIN" primary onClick={props.onPlayAgain} />
        <Choice label="CHANGE TEAMS OR WEATHER" onClick={props.onNewTeams} />
        <Link href="/pools/new" className="btn btn-compact btn-secondary">
          START A REAL POOL
        </Link>
      </Buttons>
    </>
  );
}

/** The flag for the kick being lined up, beside the aim. The person always
 *  kicks toward the right of the screen, so screen terms are the kick's. */
function WindNow({ g }: { g: Game }) {
  const w = screenWind(g);
  const mph = windMph(w);
  const heading = headingOf(w.x, w.y);
  const along = w.x > 2 ? "behind you" : w.x < -2 ? "in your face" : "across the field";
  const cross = w.y > 2 ? ", pushing it down the screen" : w.y < -2 ? ", pushing it up the screen" : "";
  return (
    <WindBadge
      heading={heading}
      mph={mph}
      spoken={mph === 0 ? "No wind." : `Wind ${mph} miles an hour, ${along}${cross}.`}
    />
  );
}

function Stats({ g }: { g: Game }) {
  const rows: [string, number, number][] = [
    ["TOTAL YARDS", g.stats.yards[HUMAN], g.stats.yards[CPU]],
    ["FIRST DOWNS", g.stats.firstDowns[HUMAN], g.stats.firstDowns[CPU]],
    ["TURNOVERS", g.stats.turnovers[HUMAN], g.stats.turnovers[CPU]],
  ];
  return (
    <table className="w-full max-w-sm font-matrix text-[10px] leading-5">
      <thead>
        <tr className="text-cream-dim">
          <th className="text-left font-normal"> </th>
          <th className="text-right font-normal">{abbr(g, HUMAN)}</th>
          <th className="text-right font-normal">{abbr(g, CPU)}</th>
        </tr>
      </thead>
      <tbody className="text-chalk tabular-nums">
        {rows.map(([label, a, b]) => (
          <tr key={label}>
            <td className="text-cream-dim">{label}</td>
            <td className="text-right">{a}</td>
            <td className="text-right">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
