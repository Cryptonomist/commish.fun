/* The helmet, as hard squares. One rect per lit pixel, straight out of the
 * bitmap in lib/helmet.ts, so there is one drawing rather than a drawing and a
 * copy of it.
 *
 * SVG rather than canvas because there are thirty-two of these on the pick
 * grid at once. Thirty-two canvases is thirty-two contexts and thirty-two
 * paints for something that never moves; this is markup the browser already
 * knows how to scale, and `shape-rendering: crispEdges` keeps the pixels hard
 * at any size.
 */
import { helmetCells, HELMET_H, HELMET_W } from "@/lib/helmet";

export function Helmet({
  nickname,
  shell,
  trim,
  className = "",
  /** Facemask colour. Defaults to the trim, which is what most clubs do; pass
   *  a pale one where the trim is too close to the shell to read. */
  mask,
  opacity = 1,
}: {
  nickname: string;
  shell: string;
  trim: string;
  className?: string;
  mask?: string;
  opacity?: number;
}) {
  const cells = helmetCells(nickname);
  const paint = { shell, trim, mask: mask ?? trim } as const;

  return (
    <svg
      viewBox={`0 0 ${HELMET_W} ${HELMET_H}`}
      className={className}
      style={{ shapeRendering: "crispEdges", opacity }}
      aria-hidden="true"
      focusable="false"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          fill={paint[c.kind]}
        />
      ))}
    </svg>
  );
}
