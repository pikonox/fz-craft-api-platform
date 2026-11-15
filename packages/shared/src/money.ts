/**
 * All money is stored as integer micro-USD (1 USD = 1_000_000 micros).
 * Image prices go as low as $0.0018, so cents are not precise enough.
 */
export const MICROS_PER_USD = 1_000_000;

export function usdToMicros(usd: number): number {
  return Math.round(usd * MICROS_PER_USD);
}

export function microsToUsd(micros: number): number {
  return micros / MICROS_PER_USD;
}

/** Cost in micros for `tokens` at a price of `pricePer1M` micros per 1M tokens. */
export function tokenCostMicros(tokens: number, pricePer1MMicros: number): number {
  if (!tokens || !pricePer1MMicros) return 0;
  return (tokens * pricePer1MMicros) / 1_000_000;
}

/** Per-1M-token prices: keeps sub-cent detail ("$0.056", "$0.575") but stays at cents from $1 up ("$16.61"). */
export function formatTokenPrice(micros: number): string {
  const usd = microsToUsd(micros || 0);
  return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: usd >= 1 ? 2 : 3 });
}

/**
 * Format micros as a USD string. Small amounts keep extra precision
 * (e.g. $0.0018) while normal amounts show cents.
 */
export function formatUsd(micros: number, opts: { precision?: number; sign?: boolean } = {}): string {
  const usd = microsToUsd(micros || 0);
  const abs = Math.abs(usd);
  let precision = opts.precision;
  if (precision === undefined) {
    if (abs === 0 || abs >= 0.01) precision = 2;
    else if (abs >= 0.0001) precision = 4;
    else precision = 6;
  }
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  const sign = usd < 0 ? "-" : opts.sign && usd > 0 ? "+" : "";
  return `${sign}$${s}`;
}

/** Convert USD micros to PKR (whole rupees, rounded up so the merchant is never short). */
export function microsToPkr(micros: number, pkrPerUsd: number): number {
  return Math.ceil(microsToUsd(micros) * pkrPerUsd);
}

export function formatPkr(pkr: number): string {
  return `Rs ${Math.round(pkr).toLocaleString("en-US")}`;
}
