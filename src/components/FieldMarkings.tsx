/* The hero sits on a field, drawn to scale.
 *
 * The container is a hundred yards. Lines fall every five, numbers every ten,
 * and the numerals run 10-20-30-40-50-40-30-20-10 out from the middle exactly
 * as they do on grass, each with the little directional arrow that points at
 * the goal line it is counting toward. The fifty has no arrow, because on a
 * real field it does not: it is not counting toward anything.
 *
 * That arrow is the whole difference between a football field and a ruler, and
 * it costs one character.
 *
 * Everything here is decoration and none of it is content, so the layer is
 * aria-hidden, ignores pointer events, and sits at an opacity where it can
 * never come near the contrast of the type above it.
 */

/* Percent across the field, what the marker says there, and whether it survives
 * a phone. Nine numerals across 375px is a picket fence, and the three that
 * earn the room are the fifty and the twenties either side of it: midfield with
 * something to measure from. Spelled out rather than derived, because every
 * arithmetic rule I tried dropped the fifty, which is the one number a field
 * cannot be missing. */
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

export function FieldMarkings() {
  return (
    <div
      aria-hidden="true"
      /* Behind the section's own content. An absolutely positioned element
         paints above static siblings by default, which would put yard lines
         over the headline. */
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
    >
      {LINES.map((at) => (
        <span
          key={at}
          className={`absolute inset-y-0 w-px ${
            at % 10 === 0 ? "bg-cream/[0.10]" : "bg-cream/[0.05]"
          }`}
          style={{ left: `${at}%` }}
        />
      ))}

      {/* Hash marks: the two rows of ticks a field carries between the numbers,
          set in from the sidelines the way the real ones are. */}
      {[30, 70].map((top) =>
        LINES.map((at) => (
          <span
            key={`${top}-${at}`}
            className="absolute h-px w-2.5 bg-cream/[0.08]"
            style={{ left: `calc(${at}% - 5px)`, top: `${top}%` }}
          />
        )),
      )}

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
              /* 0.08, down from 0.13. The numerals were tuned against Anton, whose
                 strokes are thin; a bitmap face is mostly filled area, so the same
                 alpha comes out far heavier and the field started competing with
                 the headline sitting on it. Exactly the correction the banner
                 needed, for exactly the same reason. */
              /* SCALED FOR THE BITMAP FACE, not just faded for it.
                 
                 The opacity came down when the display face changed and the
                 SIZE did not, which is half a fix. These numerals sit in slots
                 ten per cent of the field wide — 115px on the widest layout —
                 and Silkscreen sets "20" plus its arrow at about 127px at the
                 old 4rem ceiling. They were overlapping their neighbours and
                 bunching against the arrows. The clamp is the old one times
                 the same 0.62 every heading took, which puts the widest
                 numeral back to about 82px in a 115px slot. */
              "text-cream/[0.08] text-[clamp(1.1rem,3.4vw,2.5rem)] tracking-[0.06em]",
              side === "top" ? "top-3" : "bottom-3",
              phone ? "" : "hidden sm:inline",
            ].join(" ")}
            style={{ left: `${at}%` }}
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
