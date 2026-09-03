/* Money and time, formatted the same way everywhere.
 *
 * Pot amounts wear GOLD in the UI; this module only decides the string. USDC is
 * the pool currency and has 6 decimals on Solana, so amounts move around as
 * integer base units and are only turned into dollars at the edge — floats
 * never touch a balance.
 */

export const USDC_DECIMALS = 6;

/** Base units to a display string. 1_500_000n -> "$1.50" */
export function formatUsdc(baseUnits: bigint | number, opts?: { cents?: boolean }): string {
  const n = typeof baseUnits === "bigint" ? Number(baseUnits) : baseUnits;
  const dollars = n / 10 ** USDC_DECIMALS;
  const showCents = opts?.cents ?? dollars < 1000;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/** A dollars string or number to base units, for building instructions. */
export function toBaseUnits(dollars: string | number): bigint {
  const n = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(n) || n < 0) throw new Error(`bad amount: ${dollars}`);
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

/** "3d 14h 22m" — the countdown to a lock, never a bare timestamp. A deadline
 *  people feel is the difference between a pick made and a pick forgotten. */
export function countdown(to: Date, now: Date = new Date()): string {
  let ms = to.getTime() - now.getTime();
  if (ms <= 0) return "LOCKED";
  const d = Math.floor(ms / 86_400_000); ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000); ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms - m * 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/** Wallets are addresses, but people read them as names. */
export const shortAddress = (a: string, n = 4): string =>
  a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
