/* The hero sits on a field, drawn to scale.
 *
 * THE CONTAINER IS 120 YARDS, not 100. It used to be goal line to goal line,
 * which is a field of play rather than a field: there was nowhere for an end
 * zone and therefore nowhere for a goalpost to stand. Everything inside is
 * positioned through `pct()`, which maps a yard of the field of play onto the
 * wider box, so the markings did not have to be renumbered by hand.
 *
 * Lines fall every five yards, numbers every ten, and the numerals run
 * 10-20-30-40-50-40-30-20-10 out from the middle exactly as they do on grass,
 * each with the little directional arrow pointing at the goal line it counts
 * toward. The fifty has no arrow, because on a real field it does not: it is
 * not counting toward anything. That arrow is the whole difference between a
 * football field and a ruler, and it costs one character.
 *
 * Everything here is decoration and none of it is content, so the layer is
 * aria-hidden, ignores pointer events, and sits at an opacity where it can
 * never come near the contrast of the type above it.
 */

/** One end zone as a share of the whole box: ten yards of a hundred and
 *  twenty. */
const EZ = 100 / 12;

/** A yard line of the field of play, 0 at your goal line and 100 at theirs,
 *  as a percentage across the 120-yard box. */
const pct = (yard: number): number => EZ + yard * ((100 - 2 * EZ) / 100);

/* Which numerals appear, and which survive a phone. Nine across 375px is a
 * picket fence, and the three that earn the room are the fifty and the twenties
 * either side of it: midfield with something to measure from. Spelled out
 * rather than derived, because every arithmetic rule I tried dropped the fifty,
 * which is the one number a field cannot be missing. */
const NUMBERS = [
  { at: 10, yards: 10, phone: false },
  { at: 20, yards: 20, phone: true },
  { at: 30, yards: 30, phone: false },
  { at: 40, yards: 40, phone: false },
  { at: 50, yards: 50, phone: true },
  { at: 60, yards: 40, phone: false },
  { at: 70, yards: 30, phone: false },
  { at: 80, yards: 20, phone: true },
  { at: 90, yards: 10, phone: false },
];

/** Every five yards, so the numbered lines have the unnumbered ones between. */
const LINES = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);

/* THE UPRIGHTS, SEEN FROM WHERE WE ARE ACTUALLY STANDING.
 *
 * The first attempt drew them in elevation — the head-on "H" everybody
 * pictures — which is what a stylised field print does, and it was wrong here
 * for two reasons. Every other mark on this layer is a plan view, so a
 * suddenly-vertical goalpost read as a floating bracket; and centred on the
 * end line, half of each one fell outside the box and `overflow-hidden` ate it.
 *
 * From directly overhead a goalpost is almost nothing: the crossbar is a short
 * bar lying across the field, and the gooseneck base runs back from the middle
 * of it, away from play. That is all that is drawn here.
 *
 * The crossbar's length is the real one. 18 feet 6 inches across a 160-foot
 * field is 11.6% of the width, which is why it looks so small against the
 * sideline — a goalpost really is a narrow thing, and drawing it wider is the
 * usual tell that somebody guessed.
 *
 * YELLOW, and it is the one exception on this layer. Goalposts are painted
 * yellow and a cream one reads as another chalk line. It is deliberately NOT
 * the gold token: gold means money in this system and nothing else, ever, so
 * this is the goalposts' own colour and carries no other meaning. */
const POST = "#FFC72C";

function Uprights({ side }: { side: "left" | "right" }) {
  const edge = side === "left" ? { left: 0 } : { right: 0 };
  return (
    <span
      className="absolute top-1/2 h-[11.6%] w-[1.6%] -translate-y-1/2"
      style={edge}
      aria-hidden="true"
    >
      {/* The crossbar, lying across the field on the end line. */}
      <span
        className="absolute top-0 h-full w-[3px]"
        style={{
          background: POST,
          opacity: 0.55,
          [side === "left" ? "right" : "left"]: 0,
        }}
      />
      {/* The gooseneck, running back out of play. */}
      <span
        className="absolute top-1/2 h-[3px] w-full -translate-y-1/2"
        style={{ background: POST, opacity: 0.4 }}
      />
    </span>
  );
}

export function FieldMarkings() {
  return (
    <div
      aria-hidden="true"
      /* Behind the section's own content. An absolutely positioned element
         paints above static siblings by default, which would put yard lines
         over the headline. */
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
    >
      {/* THE END ZONES. Darker ground with a fine diagonal rake through it,
          which is how a painted end zone reads from above without turning into
          a solid block that competes with the copy. */}
      {(["left", "right"] as const).map((side) => (
        <span
          key={side}
          className="absolute inset-y-0"
          style={{
            width: `${EZ}%`,
            [side]: 0,
            background:
              "linear-gradient(rgba(11,23,16,0.30), rgba(11,23,16,0.30)), repeating-linear-gradient(135deg, rgba(240,242,236,0.05) 0 2px, transparent 2px, transparent 9px)",
          }}
        />
      ))}

      {/* SIDELINES, END LINES AND GOAL LINES — the frame everything else hangs
          on. A field with yard lines and nothing enclosing them reads as graph
          paper, which is what this was. The goal lines are the brightest marks
          here because they are the brightest marks on grass. */}
      <span className="absolute inset-x-0 top-0 h-[2px] bg-cream/[0.22]" />
      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-cream/[0.22]" />
      <span className="absolute inset-y-0 left-0 w-[2px] bg-cream/[0.18]" />
      <span className="absolute inset-y-0 right-0 w-[2px] bg-cream/[0.18]" />
      {[0, 100].map((goal) => (
        <span
          key={goal}
          className="absolute inset-y-0 w-[3px] bg-cream/[0.28]"
          style={{ left: `${pct(goal)}%` }}
        />
      ))}

      {LINES.map((at) => (
        <span
          key={at}
          className={`absolute inset-y-0 ${
            at % 10 === 0 ? "w-[2px] bg-cream/[0.13]" : "w-px bg-cream/[0.07]"
          }`}
          style={{ left: `${pct(at)}%` }}
        />
      ))}

      {/* HASH MARKS, EVERY YARD, and this is the detail that makes a glance say
          NFL rather than "some sport".

          On a 160-foot field the NFL puts its hashes 70 feet 9 inches in from
          each sideline — 44.2% — a far narrower pair than college football's,
          and the single most recognisable thing about these markings.

          Drawn as repeating gradients rather than spans: every yard across four
          rows would be roughly 320 absolutely positioned elements, and this is
          four. They are inset to the field of play, because an end zone carries
          no hash marks. */}
      {[
        { top: 44.2, alpha: 0.13 },
        { top: 55.8, alpha: 0.13 },
        /* The shorter ticks a field also carries just inside each sideline. */
        { top: 3.5, alpha: 0.09 },
        { top: 96.5, alpha: 0.09 },
      ].map(({ top, alpha }) => (
        <span
          key={top}
          className="absolute h-[2px]"
          style={{
            top: `${top}%`,
            left: `${pct(0)}%`,
            width: `${pct(100) - pct(0)}%`,
            /* One yard is 1% of the field of play, and this element is exactly
               the field of play, so the repeat still needs no arithmetic. */
            background: `repeating-linear-gradient(to right, rgba(240,242,236,${alpha}) 0 2px, transparent 2px, transparent 1%)`,
          }}
        />
      ))}

      <Uprights side="left" />
      <Uprights side="right" />

      {/* Both rows, the way a field carries them: one set in from each
          sideline. Both are set upright rather than mirrored — on grass the
          far row is upside down from where you are standing, and reproducing
          that on a web page reads as a rendering fault rather than as a
          field. */}
      {(["top", "bottom"] as const).map((side) =>
        NUMBERS.map(({ at, yards, phone }) => (
          <span
            key={`${side}-${at}`}
            className={[
              "display absolute -translate-x-1/2 whitespace-nowrap",
              /* SIZE FIRST, THEN COLOUR — the first attempt only did colour.

                 These numerals sit in slots ten per cent of the field wide,
                 about 115px on the widest layout, and Silkscreen set "20" plus
                 its arrow at roughly 127px at the old 4rem ceiling. They
                 overlapped their neighbours and bunched against the arrows.
                 Halving the clamp puts the widest one near 66px in that slot.

                 AND THEY ARE PROPERLY CREAM NOW, the same cream as the laces in
                 the mark. At 8% over turf, cream does not read as cream: it
                 reads as slightly paler grass, which is exactly why these
                 looked grey and dead. 16% lets the colour arrive, and it can
                 afford to because the size came down at the same time. */
              "text-cream/[0.16] text-[clamp(0.95rem,2.6vw,2rem)] tracking-[0.06em]",
              side === "top" ? "top-3" : "bottom-3",
              phone ? "" : "hidden sm:inline",
            ].join(" ")}
            style={{ left: `${pct(at)}%` }}
          >
            {at < 50 ? <Arrow dir="left" /> : null}
            {yards}
            {at > 50 ? <Arrow dir="right" /> : null}
          </span>
        )),
      )}
    </div>
  );
}

/* THE DIRECTION MARKER, DRAWN RATHER THAN TYPED.
 *
 * These were ◄ and ► — U+25C4 and U+25BA, geometric shapes, which are not in
 * the Latin subset of any of the three faces this site ships. The browser was
 * quietly pulling them from whatever system font had them, which nobody
 * noticed while the numerals beside them were set in a smooth condensed face.
 * The moment the numerals became a bitmap, a soft anti-aliased triangle next
 * to a stack of hard squares is the most obvious thing on the field.
 *
 * A stepped triangle in an SVG viewBox of whole units, scaled by font size and
 * painted in currentColor, so it inherits the numeral's colour and its opacity
 * and cannot fall back to anything. Five rows of pixels: this is the arrow the
 * machine would have drawn. */
function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 5 9"
      aria-hidden="true"
      className={`inline-block h-[0.45em] w-[0.25em] align-middle ${
        dir === "left" ? "mr-1.5" : "ml-1.5"
      }`}
      style={{ transform: dir === "left" ? "scaleX(-1)" : undefined }}
      fill="currentColor"
    >
      <rect x="0" y="0" width="1" height="9" />
      <rect x="1" y="1" width="1" height="7" />
      <rect x="2" y="2" width="1" height="5" />
      <rect x="3" y="3" width="1" height="3" />
      <rect x="4" y="4" width="1" height="1" />
    </svg>
  );
}
