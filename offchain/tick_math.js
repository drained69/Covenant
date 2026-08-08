/**
 * JS port of src/libraries/TickLib.sol.
 *
 * Offers quote a `tick`, not a rate. The UI wants to show a rate, so something has to
 * do the conversion — and if that something is an approximation, every rate in the
 * order book is a number the protocol never agreed to. This is a literal port instead:
 * same constants, same truncating integer division, same rounding step, so
 * `tickToPrice(t)` here returns the identical uint256 the Solidity library returns.
 *
 * Verified against the on-chain library by script/_TickCheck.s.sol (see build notes).
 *
 * Faithfulness notes:
 *  - Solidity int256 division truncates toward zero; JS BigInt division does too.
 *  - `uint256(expR) << uint256(q)` maps to BigInt `<<`, which is exact at any width.
 *  - Every intermediate stays BigInt, so there is no float rounding anywhere.
 */

const WAD = 10n ** 18n;

/** floor(ln(1.005) * 1e18) */
const LN_ONE_PLUS_DELTA = 4987541511039073n;
const MAX_TICK = 5820n;
/** Minimum representable price increment in WAD (1e-6 WAD). */
const PRICE_ROUNDING_STEP = 10n ** 12n;

/** x / d rounded to nearest, ties down. */
function divHalfDownUnchecked(x, d) {
  return (x + (d - 1n) / 2n) / d;
}

function wExp(x) {
  if (x < 0n) return 10n ** 36n / wExp(-x);

  const ln2 = 693147180559945309n; // floor(ln(2) * 1e18)
  const offset = 322611214989459870n; // 0.32261121498945987e18
  const q = (x + offset) / ln2;
  const r = x - q * ln2;
  const secondTerm = (r * r) / (2n * WAD);
  const thirdTerm = (secondTerm * r) / (3n * WAD);
  const expR = WAD + r + secondTerm + thirdTerm;
  return expR << q;
}

/** WAD price of one credit unit at `tick`. tickToPrice(MAX_TICK) === 1e18 (par). */
function tickToPrice(tick) {
  const t = BigInt(tick);
  if (t > MAX_TICK) throw new Error(`TickOutOfRange: ${t} > ${MAX_TICK}`);
  const inner = WAD + wExp(LN_ONE_PLUS_DELTA * (MAX_TICK / 2n - t));
  return divHalfDownUnchecked(divHalfDownUnchecked(10n ** 36n, inner), PRICE_ROUNDING_STEP) * PRICE_ROUNDING_STEP;
}

/** Among ticks that are multiples of `spacing`, the lowest one priced at or above `price`. */
function priceToTick(price, spacing) {
  const p = BigInt(price);
  const s = BigInt(spacing);
  if (p > WAD) throw new Error("PriceGreaterThanOne");
  let low = 0n;
  let high = MAX_TICK;
  while (low !== high) {
    const mid = (low + high) / 2n;
    if (tickToPrice(mid) < p) low = mid + 1n;
    else high = mid;
  }
  return ((low + s - 1n) / s) * s;
}

/**
 * Annualized simple yield in basis points implied by buying a unit at `price` and
 * redeeming it for 1.0 at `maturity`.
 *
 * Simple (not compounded) because these are zero-coupon claims with a single
 * settlement — there is nothing to reinvest, so a compounded quote would overstate
 * what the holder actually receives. Returned as bps to match the UI's `rateBps/100`.
 */
function priceToRateBps(price, secondsToMaturity) {
  const p = BigInt(price);
  if (p === 0n || secondsToMaturity <= 0) return 0;
  const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
  // discount = (1 - p) / p, held in WAD; then scale to a year and to bps.
  const discountWad = ((WAD - p) * WAD) / p;
  const bps = (discountWad * SECONDS_PER_YEAR * 10_000n) / (BigInt(secondsToMaturity) * WAD);
  return Number(bps);
}

module.exports = {
  WAD,
  MAX_TICK,
  PRICE_ROUNDING_STEP,
  tickToPrice,
  priceToTick,
  priceToRateBps,
};
