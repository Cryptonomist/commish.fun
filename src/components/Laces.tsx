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

/* THE TILE: cream laces on an orange square, and the same image as the avatar
 * on the X account. Geometry copied from brand/avatar.svg exactly, so the mark
 * in the header and the mark in somebody's timeline are one mark rather than
 * two drawings that nearly agree.
 *
 * THE OLD OBJECTION, AND WHY IT IS DEAD. The comment above used to say the
 * tile was dropped because a filled orange square is the same shape and colour
 * as every button on the site, so the logo read as something to click. That
 * was true of the old design and it is not true of this one: no button here is
 * a square, every button is a wide rectangle carrying a hard offset shadow,
 * and this tile has no shadow at all. Shape disambiguates now, so the tile is
 * free. Recorded rather than deleted, because somebody will find the old
 * reasoning in the history and wonder whether this was a slip. */
export function LacesTile({
  size = 40,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* Zero radius, like everything else in this system. */}
      <rect width="512" height="512" fill="var(--color-action)" />
      <g transform="translate(256 256) scale(1.55)">
        <g transform="rotate(-14)" fill="var(--color-cream)">
          <rect x="-9" y="-84" width="18" height="168" rx="9" />
          <rect x="-49" y="-63" width="98" height="18" rx="9" />
          <rect x="-49" y="-27" width="98" height="18" rx="9" />
          <rect x="-49" y="9" width="98" height="18" rx="9" />
          <rect x="-49" y="45" width="98" height="18" rx="9" />
        </g>
      </g>
    </svg>
  );
}

/** The lockup: the app icon, wordmark beside it.
 *
 *  BOTH ORANGES ARE THE SAME ORANGE, and getting there took two goes. The
 *  wordmark sits on the field, where plain action is 3.56:1 and fails as small
 *  type, so .FUN was briefly lightened to #FF9450. That was legible and it was
 *  visibly a different orange from the tile an inch to its left, which reads as
 *  a mistake rather than as a rule.
 *
 *  The sprite outline fixes it properly: a panel-coloured ring makes the pair
 *  the eye resolves action on panel at 6.42:1, legal at any size, so the brand
 *  colour survives contact with the grass. COMMISH carries the same outline in
 *  chalk. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LacesTile size={size * 1.4} title="Commish" />
      {/* 0.9, not 1.35. Silkscreen sets COMMISH.FUN 1.48 times wider than
          Anton did — measured, on this exact string — so holding the lockup
          at the width it has always been means taking the size down by the
          same factor. */}
      <span className="display field-type" style={{ fontSize: size * 0.9 }}>
        COMMISH<span className="field-action">.FUN</span>
      </span>
    </span>
  );
}
