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
            at % 10 === 0 ? "bg-cream/[0.055]" : "bg-cream/[0.028]"
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
            className="absolute h-px w-2.5 bg-cream/[0.05]"
            style={{ left: `calc(${at}% - 5px)`, top: `${top}%` }}
          />
        )),
      )}

      {NUMBERS.map(({ at, yards, phone }) => (
        <span
          key={at}
          className={[
            "display absolute bottom-5 -translate-x-1/2 whitespace-nowrap",
            "text-cream/[0.07] text-[clamp(1.5rem,4vw,3rem)] tracking-[0.1em]",
            phone ? "" : "hidden sm:inline",
          ].join(" ")}
          style={{ left: `${at}%` }}
        >
          {at < 50 ? <span className="mr-1.5 align-middle text-[0.5em]">◄</span> : null}
          {yards}
          {at > 50 ? <span className="ml-1.5 align-middle text-[0.5em]">►</span> : null}
        </span>
      ))}
    </div>
  );
}
