/* HOW TO PLAY, WRITTEN DOWN.
 *
 * Each game explains itself while it runs, one line at a time, because a
 * paragraph listing every control mid-play is a paragraph nobody reads. That
 * is the right place for a reminder and the wrong place to learn: somebody
 * who wants to know how to throw a pass before they call one had nowhere to
 * look. So all of it lives here, under the game.
 *
 * TWO LAYERS, BECAUSE ALL OF IT AT ONCE IS TOO MUCH. Written out in full the
 * Commish Bowl guide came to four and a half thousand pixels at desktop width,
 * which is a page nobody scans for "how do I pass". So the controls a person
 * reaches for every snap sit in one short table that is always open, and the
 * detail (routes, kick placement, the clock, overtime) is in sections below it
 * that open on a click. Native <details>, so it works with a keyboard and a
 * screen reader without a line of script.
 *
 * EVERY LINE HERE IS SOMETHING THE CODE DOES. The numbers come from the same
 * constants the rules use, so a change to the clock or the kickoff rules cannot
 * leave this page describing the old game. Keyboard and phone sit side by side
 * because they are two ways of doing the same thing, and a guide that only
 * speaks keyboard leaves out most people holding a phone.
 *
 * No state and no effects: it is text. The games' "?" buttons scroll here.
 */

import type { ReactNode } from "react";

import { GUIDE_ID } from "@/components/ArcadeKit";
import {
  HURRY_RUNOFF,
  KICKOFF_TOUCHBACK,
  OT_TIMEOUTS,
  PUNT_TOUCHBACK,
  RUNOFF,
  SHORT_KICK_SPOT,
  TIMEOUTS,
  TWO_POINT_SPOT,
  ZONE_TOUCHBACK,
} from "@/lib/bowlgame";
import { PAT_DISTANCE } from "@/lib/fieldgoal";
import { NFL_RECORD, NFL_RECORD_HOLDER, START_DISTANCE, STRIKES } from "@/lib/longkick";

/* ----------------------------------------------------------------- pieces */

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center border border-rule bg-night-2 px-1.5 py-0.5 font-matrix text-[9px] leading-3 text-chalk">
      {children}
    </kbd>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((k, i) => (
        <span key={k} className="flex items-center gap-1">
          {i > 0 ? <span className="text-[10px] text-cream-dim">or</span> : null}
          <Key>{k}</Key>
        </span>
      ))}
    </span>
  );
}

const COLUMNS = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]";

/** One thing you can do: what it is, the keys that do it (any one of them),
 *  and the way to do it on a phone. One action a row: two actions sharing a
 *  row read as alternatives, which is how "run, and spin" once came out as
 *  "arrows or space". */
function Row({ does, keys, phone }: { does: ReactNode; keys: string[] | string; phone: ReactNode }) {
  return (
    <div className={`grid gap-1.5 border-t border-rule py-2 sm:gap-4 ${COLUMNS}`}>
      <div className="text-sm leading-relaxed text-cream">{does}</div>
      <div className="flex items-start gap-2">
        <span className="font-matrix text-[9px] leading-5 text-cream-dim sm:hidden">KEYS</span>
        {typeof keys === "string" ? (
          <span className="text-xs leading-5 text-cream-dim">{keys}</span>
        ) : (
          <Keys keys={keys} />
        )}
      </div>
      <div className="flex items-start gap-2 text-xs leading-5 text-cream-dim">
        <span className="font-matrix text-[9px] leading-5 text-cream-dim sm:hidden">PHONE</span>
        <span>{phone}</span>
      </div>
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className={`hidden gap-4 pb-1 font-matrix text-[9px] leading-4 text-cream-dim sm:grid ${COLUMNS}`}>
        <span>WHAT</span>
        <span>KEYBOARD</span>
        <span>PHONE</span>
      </div>
      {children}
    </div>
  );
}

function Facts({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-cream-dim">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 inline-block h-1 w-1 shrink-0 bg-action" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A section that opens on a click: a title, a line saying what is inside,
 *  and the detail. */
function Section({ title, about, children }: { title: string; about: string; children: ReactNode }) {
  return (
    <details className="group border-t-2 border-rule">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col gap-1">
          <span className="font-matrix text-[11px] leading-5 text-chalk">{title}</span>
          <span className="text-xs leading-5 text-cream-dim">{about}</span>
        </span>
        <span aria-hidden="true" className="font-matrix text-[14px] leading-5 text-action">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">-</span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-4">{children}</div>
    </details>
  );
}

function Shell({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section
      id={GUIDE_ID}
      tabIndex={-1}
      aria-labelledby={`${GUIDE_ID}-title`}
      className="panel flex scroll-mt-6 flex-col gap-5 p-5 outline-none sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <h2 id={`${GUIDE_ID}-title`} className="font-matrix text-[13px] leading-5 text-chalk">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-cream-dim">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="font-matrix text-[11px] leading-5 text-chalk">{children}</h3>;
}

const MOVE = ["ARROWS", "WASD"];
const PRESS = ["SPACE", "ENTER"];
const CLICK = "Click the button";
const TAP = "Tap the button";

/* ------------------------------------------------------------ Commish Bowl */

export function BowlGuide() {
  return (
    <Shell
      title="HOW TO PLAY COMMISH BOWL"
      lead={
        <>
          Before every snap you pick a play with the buttons under the field. Then the ball is live
          and you steer one player, the one with the orange arrow over his head: whoever has the ball
          on offense, or a defender on defense. The line under the field always says what the
          controls do on that snap.
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Heading>THE CONTROLS</Heading>
        <Rows>
          <Row does="Move your player" keys={MOVE} phone="Hold a finger on the field and drag toward where you want him to go" />
          <Row does="Pass: throw to receiver 1, 2 or 3" keys={["1", "2", "3"]} phone="Tap the receiver" />
          <Row does="Pass: throw to the receiver whose number is lit yellow, the most open one" keys={PRESS} phone="ACTION button" />
          <Row does="Spin, with the ball: a burst of speed, once a play" keys={PRESS} phone="ACTION button" />
          <Row does="On defense: switch to the defender nearest the ball" keys={PRESS} phone="ACTION button, or tap one of your players" />
          <Row does="Returning a punt: fair catch, while the ball is in the air" keys={PRESS} phone="ACTION button" />
          <Row does="Aim a kick" keys={MOVE} phone="Hold the < and > buttons" />
          <Row does="Kick: start the power bar, lock the power, lock the accuracy" keys={["SPACE x3", "ENTER x3"]} phone="KICK, then SET, then SET" />
          <Row does="Call a play, punt, kick a field goal, take a timeout, go to the next play" keys={CLICK} phone={TAP} />
          <Row does="Sound on or off" keys="Click the note button" phone="Tap the note button" />
        </Rows>
        <p className="text-xs leading-5 text-cream-dim">Open a section below for how each part of the game works.</p>
      </div>

      <div className="flex flex-col">
        <Section title="PASSING" about="Routes, reading the receivers, scrambling, sacks and interceptions.">
          <p className="text-sm leading-relaxed text-cream-dim">
            Call SHORT PASS or DEEP PASS. The quarterback takes his drop on his own, and every receiver
            shows a number beside him. The number lit yellow is whoever is most open right now.
          </p>
          <Facts
            items={[
              <>SHORT PASS: 1 slants in from the top, 2 runs a quick out along the bottom, and 3 is the running back swinging out into the flat.</>,
              <>DEEP PASS: 1 runs straight down the field, 2 runs a post toward the middle, and the back stays in to block.</>,
            ]}
          />
          <Rows>
            <Row does="Throw to receiver 1, 2 or 3, once the drop is finished" keys={["1", "2", "3"]} phone="Tap the receiver" />
            <Row does="Throw to the receiver lit yellow" keys={PRESS} phone="ACTION button" />
            <Row
              does="Step up in the pocket, or scramble. Cross the line of scrimmage and you are a runner, with no more throwing."
              keys={MOVE}
              phone="Drag"
            />
            <Row
              does="The receiver goes to the ball by himself. Once he catches it he is your ball carrier: run, and spin once."
              keys="As when running"
              phone="As when running"
            />
          </Rows>
          <Facts
            items={[
              <>Hold the ball too long and you will be sacked. A blitz gets there fastest.</>,
              <>Throws into tight coverage get knocked down or intercepted. Deep balls are harder to catch the longer they hang in the air.</>,
              <>Rain and snow make catches harder, and wind moves a deep ball while it is in the air.</>,
            ]}
          />
        </Section>

        <Section title="CALLING A PLAY" about="What each offensive and defensive call is good against.">
          <p className="text-sm leading-relaxed text-cream-dim">
            Each call beats one thing and loses to another, and the computer is choosing too. After the
            play, the result tells you what it called against you.
          </p>
          <Rows>
            <Row does={<><strong className="text-chalk">RUN.</strong> Hand it to the back. Best against COVER.</>} keys={CLICK} phone={TAP} />
            <Row does={<><strong className="text-chalk">SHORT PASS.</strong> A quick throw. Beats the BLITZ.</>} keys={CLICK} phone={TAP} />
            <Row
              does={<><strong className="text-chalk">DEEP PASS.</strong> Go for the big play. Beats a RUN STOP, but a blitz has time to get to your quarterback.</>}
              keys={CLICK}
              phone={TAP}
            />
            <Row
              does={<><strong className="text-chalk">PUNT</strong> and <strong className="text-chalk">FIELD GOAL.</strong> The field goal button shows its distance when you are in range.</>}
              keys={CLICK}
              phone={TAP}
            />
            <Row
              does={<><strong className="text-chalk">KNEEL.</strong> Appears late in a half when you are ahead or tied: a yard lost, a lot of clock gone.</>}
              keys={CLICK}
              phone={TAP}
            />
            <Row
              does={<><strong className="text-chalk">TIMEOUT.</strong> Appears while the clock is running, and stops it before the next snap.</>}
              keys={CLICK}
              phone={TAP}
            />
            <Row
              does={<><strong className="text-chalk">RUN STOP, COVER, BLITZ</strong> on defense. Run stop crowds the line. Cover drops everybody back against the deep ball. Blitz sends the linebackers after the quarterback.</>}
              keys={CLICK}
              phone={TAP}
            />
          </Rows>
        </Section>

        <Section title="RUNNING WITH THE BALL" about="After a run, a catch, a kick return or an interception.">
          <Rows>
            <Row does="Run" keys={MOVE} phone="Drag toward where you want to go" />
            <Row does="Spin: a burst of speed, once a play. Save it for the last man." keys={PRESS} phone="ACTION button" />
            <Row
              does="Run out of bounds: push into the sideline. It stops the clock in the last two minutes of a half."
              keys={MOVE}
              phone="Drag into the sideline"
            />
          </Rows>
        </Section>

        <Section title="DEFENSE" about="Chasing, switching players, tackling and picking off passes.">
          <p className="text-sm leading-relaxed text-cream-dim">
            You start as a linebacker. Every defender you are not steering plays the call you made.
          </p>
          <Rows>
            <Row does="Chase the ball carrier. Touch him and he is down." keys={MOVE} phone="Drag" />
            <Row does="Switch to the defender nearest the ball" keys={PRESS} phone="ACTION button, or tap one of your defenders" />
            <Row
              does="Break up a pass: get to where the ball is going. The player you steer picks it off far more often than the rest, and then you run it back."
              keys={MOVE}
              phone="Drag"
            />
          </Rows>
        </Section>

        <Section title="YOUR KICKOFFS AND PUNTS" about="Aim, power and accuracy, and where the ball ends up.">
          <p className="text-sm leading-relaxed text-cream-dim">
            Pick KICK IT DEEP or ONSIDE KICK on a kickoff, or PUNT on offense. An onside kick goes on its
            own, and your team gets it back about one time in five.
          </p>
          <Rows>
            <Row
              does="Aim up or down the field. The dotted line shows the direction, and the wind is shown beside the aim."
              keys={MOVE}
              phone="Hold the < and > buttons"
            />
            <Row does="Start the power bar" keys={PRESS} phone="KICK button" />
            <Row does="Lock the power. The readout says where the ball will come down." keys={PRESS} phone="SET button" />
            <Row
              does="Lock the accuracy: stop the needle in the green middle. It moves faster the harder you kicked."
              keys={PRESS}
              phone="SET button"
            />
            <Row does="Cover it: chase the returner. Touch him and he is down." keys={MOVE} phone="Drag" />
            <Row does="Switch to the player nearest the ball" keys={PRESS} phone="ACTION button, or tap one of your players" />
          </Rows>
          <Facts
            items={[
              <>A kickoff that lands in the end zone is a touchback to their {KICKOFF_TOUCHBACK}.</>,
              <>A kickoff short of their 20, or out of bounds, comes back to their {SHORT_KICK_SPOT}.</>,
              <>A kickoff that lands between the goal line and their 20 has to be returned. If it rolls into the end zone and is downed there, it goes to the {ZONE_TOUCHBACK}.</>,
              <>A punt into the end zone is a touchback to their {PUNT_TOUCHBACK}. After a safety, the team that gave it up kicks from its own 20.</>,
            ]}
          />
        </Section>

        <Section title="RETURNING KICKS" about="Running kicks back, and fair catches.">
          <p className="text-sm leading-relaxed text-cream-dim">
            Your returner goes to the ball on his own. Once he has it, he is yours.
          </p>
          <Rows>
            <Row does="Run it back" keys={MOVE} phone="Drag" />
            <Row does="Spin, once a return" keys={PRESS} phone="ACTION button" />
            <Row
              does="Fair catch on a punt: press while the ball is still in the air. The ball is dead where he catches it."
              keys={PRESS}
              phone="ACTION button"
            />
          </Rows>
        </Section>

        <Section title="FIELD GOALS AND EXTRA POINTS" about="The kicker's-eye view, the meters and the wind.">
          <p className="text-sm leading-relaxed text-cream-dim">
            After a touchdown, choose KICK THE EXTRA POINT (a {PAT_DISTANCE}-yard kick) or GO FOR TWO (one
            play from the {100 - TWO_POINT_SPOT}, with RUN, SHORT PASS or DEEP PASS). FIELD GOAL shows on
            offense with its distance.
          </p>
          <Rows>
            <Row
              does="Aim left or right. The dots and the marker over the crossbar show where it points. The wind is not drawn in: read the flag at the top right and the ribbons on the uprights."
              keys={["LEFT/RIGHT", "A/D"]}
              phone="Hold the < and > buttons"
            />
            <Row
              does="Start the power bar. LEG is how far this kick would carry in this wind, green when it is enough. The line on the bar marks the power this distance needs."
              keys={PRESS}
              phone="KICK button"
            />
            <Row does="Lock the power" keys={PRESS} phone="SET button, or tap the view" />
            <Row does="Lock the accuracy: stop the needle in the green" keys={PRESS} phone="SET button, or tap the view" />
            <Row does="Continue after the call" keys={PRESS} phone="CONTINUE button" />
          </Rows>
          <Facts
            items={[
              <>A kick can clip the upright or the crossbar and bounce in or out.</>,
              <>A missed field goal gives the other team the ball where it was kicked from, or at their 20.</>,
              <>When the computer kicks a field goal you watch it from the same camera. For its extra point, press WATCH. When it goes for two, you pick the defense.</>,
            ]}
          />
        </Section>

        <Section title="THE CLOCK AND THE RULES" about="Downs, scoring, timeouts, the two-minute warning, overtime and weather.">
          <Facts
            items={[
              <>Four downs to gain ten yards. On the field, the orange line is the line of scrimmage and the yellow line is the line to gain.</>,
              <>Touchdown 6, extra point 1, two-point try 2, field goal 3, safety 2.</>,
              <>The clock runs during plays and between them: about {RUNOFF} seconds between snaps, or {HURRY_RUNOFF} when a team is hurrying late in a half. It stops after an incomplete pass, a score, a change of possession, and running out of bounds in the last two minutes of a half.</>,
              <>{TIMEOUTS} timeouts a half ({OT_TIMEOUTS} in overtime), and a two-minute warning in each half of a 5-minute or 15-minute game.</>,
              <>Teams change ends every quarter, so a wind at your back becomes a wind in your face.</>,
              <>Tied after four quarters: overtime. Both teams get the ball unless the defense scores first, then the next score wins. It lasts one of your quarters, up to ten minutes, and can end in a tie.</>,
              <>Weather changes the game. Snow slows everybody and shortens kicks. Rain means more fumbles and drops and slightly shorter kicks. Wind pushes every kick and every deep ball. Time of day changes the light.</>,
              <>On a phone, turn it sideways and the game fills the screen.</>,
            ]}
          />
        </Section>
      </div>
    </Shell>
  );
}

/* --------------------------------------------------------------- Long Kick */

export function LongKickGuide() {
  return (
    <Shell
      title="HOW TO PLAY LONG KICK"
      lead={
        <>
          Pick the weather and the time of day, press START KICKING, and see how far back you can make a
          field goal from. Every kick is three decisions: where to aim, how hard, and how clean.
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Heading>THE CONTROLS</Heading>
        <Rows>
          <Row
            does="Aim left or right. The dots and the marker over the crossbar show where it points. The wind is not drawn in: read the flag at the top right and the ribbons on the uprights."
            keys={["LEFT/RIGHT", "A/D"]}
            phone="Hold the < and > buttons"
          />
          <Row
            does="Start the power bar. LEG is how far this kick would carry in this wind, green when it is enough. The line on the bar marks the power this distance needs."
            keys={PRESS}
            phone="KICK button"
          />
          <Row does="Lock the power" keys={PRESS} phone="SET button, or tap the view" />
          <Row
            does="Lock the accuracy: stop the needle in the green middle. It moves faster the harder you kicked."
            keys={PRESS}
            phone="SET button, or tap the view"
          />
          <Row does="Next kick, after the call" keys={PRESS} phone="NEXT KICK button" />
          <Row does="Sound on or off" keys="Click the note button" phone="Tap the note button" />
        </Rows>
      </div>

      <div className="flex flex-col gap-2">
        <Heading>THE LADDER</Heading>
        <Facts
          items={[
            <>You start at {START_DISTANCE} yards. Every make moves you back: five yards at a time to 50, then three at a time to 62, then two.</>,
            <>A miss costs one of your {STRIKES} strikes, and you kick again from the same spot. The third miss ends the run.</>,
            <>Every kick gets its own wind, from any direction and at any strength the weather allows, so read the flag before every kick.</>,
            <>A kick can clip the upright or the crossbar and bounce in or out.</>,
            <>Your longest kick is saved in this browser. The NFL record is {NFL_RECORD} yards ({NFL_RECORD_HOLDER}), and beating it takes a big leg, a clean strike and some help from the wind.</>,
            <>Snow and rain shorten every kick. Wind can carry one further or knock it down, and pushes it sideways.</>,
            <>On a phone, turn it sideways and the game fills the screen.</>,
          ]}
        />
      </div>
    </Shell>
  );
}
