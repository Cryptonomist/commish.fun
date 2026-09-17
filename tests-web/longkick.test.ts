/* The long kick game's ladder, which is small enough to get wrong quietly. */

import { expect } from "chai";

import { EFFECTS, type Weather } from "../src/lib/conditions";
import { reach } from "../src/lib/fieldgoal";
import {
  afterKick,
  celebrates,
  newRun,
  nextDistance,
  NFL_RECORD,
  noteFor,
  runOver,
  START_DISTANCE,
  STRIKES,
  windForKick,
} from "../src/lib/longkick";
import { seeded } from "../src/lib/rng";

describe("the long kick game", () => {
  it("starts at thirty yards with three strikes", () => {
    const run = newRun();
    expect(run.distance).to.equal(START_DISTANCE);
    expect(run.strikesLeft).to.equal(STRIKES);
    expect(runOver(run)).to.equal(false);
  });

  it("moves back after a make and remembers the longest", () => {
    let run = newRun();
    run = afterKick(run, true);
    expect(run.distance).to.equal(35);
    expect(run.longest).to.equal(30);
    expect(run.made).to.equal(1);
  });

  it("keeps the spot after a miss and takes a strike", () => {
    let run = afterKick(newRun(), true);
    run = afterKick(run, false);
    expect(run.distance).to.equal(35);
    expect(run.strikesLeft).to.equal(STRIKES - 1);
    expect(run.longest).to.equal(30);
  });

  it("ends on the third miss and not before", () => {
    let run = newRun();
    for (let i = 1; i < STRIKES; i++) {
      run = afterKick(run, false);
      expect(runOver(run), `after miss ${i}`).to.equal(false);
    }
    run = afterKick(run, false);
    expect(runOver(run)).to.equal(true);
  });

  it("slows the ladder down as it nears the record, and never stands still", () => {
    let d = START_DISTANCE;
    let lastStep = Infinity;
    while (d < 80) {
      const step = nextDistance(d) - d;
      expect(step).to.be.above(0);
      expect(step).to.be.at.most(lastStep);
      lastStep = step;
      d = nextDistance(d);
    }
  });

  it("puts the record on the ladder, reachable only with help from the wind", () => {
    const rungs: number[] = [];
    for (let d = START_DISTANCE; d <= 80; d = nextDistance(d)) rungs.push(d);
    expect(rungs).to.include(NFL_RECORD);
    // The rung past the record is out of reach in still air and in reach of a
    // perfect kick with a tailwind, which is exactly what a record should be.
    const past = nextDistance(NFL_RECORD);
    expect(reach(1, 0)).to.be.above(past - 2);
    expect(reach(1, 18)).to.be.above(past);
  });

  it("says something only when there is something to say", () => {
    expect(noteFor(50, false, 40)).to.equal(null);
    expect(noteFor(45, true, 50)).to.equal(null);
    expect(noteFor(53, true, 50)).to.contain("PERSONAL BEST");
    expect(noteFor(NFL_RECORD, true, 60)).to.contain("TIES");
    expect(noteFor(NFL_RECORD + 2, true, 60)).to.contain("NFL RECORD");
  });

  /* THE WIND IS A NEW READ EVERY KICK. A run used to draw one wind and gust a
   * little around it, so the flag said the same thing all run. Two hundred
   * kicks in a row here have to come from every direction, at strengths across
   * the weather's whole range, and almost never repeat the one before. */
  it("draws a new wind for every kick, from any direction, across the weather's whole range", () => {
    for (const weather of ["clear", "rain", "snow", "wind"] as Weather[]) {
      const { windMin, windMax } = EFFECTS[weather];
      const r = seeded(weather.length * 97 + 3);
      const quadrants = new Set<string>();
      let weakest = Infinity;
      let strongest = 0;
      let changed = 0;
      let last = windForKick(r, weather);
      for (let i = 0; i < 200; i++) {
        const w = windForKick(r, weather);
        const mph = Math.hypot(w.x, w.y);
        expect(mph, weather).to.be.within(windMin - 1e-9, windMax + 1e-9);
        weakest = Math.min(weakest, mph);
        strongest = Math.max(strongest, mph);
        quadrants.add(`${w.x >= 0 ? "+" : "-"}${w.y >= 0 ? "+" : "-"}`);
        const turned = Math.abs(Math.atan2(w.y, w.x) - Math.atan2(last.y, last.x));
        if (turned > 0.2 || Math.abs(mph - Math.hypot(last.x, last.y)) > 1) changed++;
        last = w;
      }
      expect(quadrants.size, `${weather}: directions`).to.equal(4);
      // Spread across most of the range, not clustered around one speed.
      expect(strongest - weakest, `${weather}: strengths`).to.be.above((windMax - windMin) * 0.8);
      expect(changed, `${weather}: kicks with a different wind from the last`).to.be.above(180);
    }
  });

  it("throws confetti for a real best or a record, and not for a first chip shot", () => {
    expect(celebrates(30, true, 0)).to.equal(false);
    expect(celebrates(45, true, 40)).to.equal(true);
    expect(celebrates(45, true, 50)).to.equal(false);
    expect(celebrates(NFL_RECORD, true, 80)).to.equal(true);
    expect(celebrates(NFL_RECORD, false, 0)).to.equal(false);
  });
});
