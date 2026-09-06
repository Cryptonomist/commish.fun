/* THE LACES — the whole mark, and the only one.
 *
 * One spine, four ticks, rounded ends, tilted 14 degrees. It is the single part
 * of a football that means football and nothing else, so it survives being 16px
 * in a browser tab, and it doubles as plus-signs (money in) and a ladder
 * (surviving weeks).
 *
 * Rules: it is never set inside the wordmark, never stretched, and never given
 * a colour outside the palette — orange on night, or cream on a dark surface.
 * It wears the action orange, and the reason the lockup does not therefore read
 * as a button is that it carries no filled tile. See Wordmark below.
 * The illustrated footballs are retired.
 */
export function Laces({
  className = "",
  size = 32,
  title,
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-100 -100 200 200"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g transform="rotate(-14)" fill="currentColor">
        <rect x="-9" y="-84" width="18" height="168" rx="9" />
        <rect x="-49" y="-63" width="98" height="18" rx="9" />
        <rect x="-49" y="-27" width="98" height="18" rx="9" />
        <rect x="-49" y="9" width="98" height="18" rx="9" />
        <rect x="-49" y="45" width="98" height="18" rx="9" />
      </g>
    </svg>
  );
}

/** The lockup: orange laces set straight on the ground, wordmark beside them.
 *  Header and nav use this; social banners use the wordmark alone.
 *
 *  NO TILE. The mark used to sit in a filled orange square, which is the same
 *  shape and the same colour as every button on the site, so the logo read as
 *  something to click. Setting the laces directly on night fixes that without
 *  needing a second brand colour to do it. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Laces size={size * 1.2} title="Commish" className="text-action" />
      <span className="display text-cream" style={{ fontSize: size * 1.35 }}>
        COMMISH<span className="text-action">.FUN</span>
      </span>
    </span>
  );
}
