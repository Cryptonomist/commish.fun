/* THE LACES — the whole mark, and the only one.
 *
 * One spine, four ticks, rounded ends, tilted 14 degrees. It is the single part
 * of a football that means football and nothing else, so it survives being 16px
 * in a browser tab, and it doubles as plus-signs (money in) and a ladder
 * (surviving weeks).
 *
 * Rules: it is never set inside the wordmark, never stretched, and never given
 * a colour outside the palette — cream on an orange tile, orange on night black.
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

/** The lockup: mark on an orange tile, wordmark beside it. Header and nav use
 *  this; social banners use the wordmark alone. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span
        className="inline-flex items-center justify-center rounded-xl bg-leather text-cream"
        style={{ width: size * 1.5, height: size * 1.5 }}
      >
        <Laces size={size} title="Commish" />
      </span>
      <span className="display text-cream" style={{ fontSize: size * 1.35 }}>
        COMMISH<span className="text-leather">.FUN</span>
      </span>
    </span>
  );
}
