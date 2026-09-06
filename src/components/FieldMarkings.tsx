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
              "text-cream/[0.13] text-[clamp(1.75rem,5.5vw,4rem)] tracking-[0.08em]",
              side === "top" ? "top-3" : "bottom-3",
              phone ? "" : "hidden sm:inline",
            ].join(" ")}
            style={{ left: `${at}%` }}
          >
            {at < 50 ? (
              <span className="mr-1.5 align-middle text-[0.45em]">◄</span>
            ) : null}
            {yards}
            {at > 50 ? (
              <span className="ml-1.5 align-middle text-[0.45em]">►</span>
            ) : null}
          </span>
        )),
      )}
    </div>
  );
}
