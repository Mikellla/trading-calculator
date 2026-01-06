// src/lib/math/prop.ts
// Prop firm math helpers (2-leg only): futures + forex
// No external dependencies.

export type Side = "long" | "short";

// ---------- Shared helpers ----------
export function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function safeDiv(n: number, d: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

export function roundTo(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** Math.max(0, decimals);
  return Math.round(n * p) / p;
}

// ---------- 2-leg average entry ----------
export type TwoLegAverageInput = {
  entry1Price: number;
  entry1Qty: number;   // contracts (futures) or lots (forex) or units
  entry2Price?: number;
  entry2Qty?: number;
};

export type TwoLegAverageResult = {
  totalQty: number;
  avgEntry: number;
  // helpful deltas for UI
  avgShift: number; // avgEntry - entry1Price
  hasSecondLeg: boolean;
};

export function calcTwoLegAverage(input: TwoLegAverageInput): TwoLegAverageResult {
  const p1 = input.entry1Price;
  const q1 = input.entry1Qty;

  const p2 = input.entry2Price ?? 0;
  const q2 = input.entry2Qty ?? 0;

  const hasSecondLeg = Number.isFinite(p2) && Number.isFinite(q2) && q2 > 0;

  const totalQty = clampNonNegative(q1) + (hasSecondLeg ? clampNonNegative(q2) : 0);
  const avgEntry =
    totalQty > 0
      ? (p1 * clampNonNegative(q1) + (hasSecondLeg ? p2 * clampNonNegative(q2) : 0)) / totalQty
      : 0;

  return {
    totalQty,
    avgEntry,
    avgShift: avgEntry - p1,
    hasSecondLeg,
  };
}

// ---------- FUTURES: ticks / points ----------
export type FuturesSpec = {
  tickSize: number;      // e.g. ES = 0.25
  tickValueUsd: number;  // e.g. ES = 12.5
  // Optional: allow direct point value input. If provided, we trust it.
  pointValueUsd?: number; // $ per 1.0 point
};

export function derivePointValueUsd(spec: FuturesSpec): number {
  if (Number.isFinite(spec.pointValueUsd) && (spec.pointValueUsd ?? 0) > 0) {
    return spec.pointValueUsd!;
  }
  // pointValue = tickValue / tickSize
  return safeDiv(spec.tickValueUsd, spec.tickSize);
}

export function priceToPoints(priceDistance: number): number {
  // In futures, "points" is the raw price distance (e.g., ES 1.00 = 1 point).
  return Math.abs(priceDistance);
}

export function pointsToTicks(points: number, tickSize: number): number {
  return safeDiv(Math.abs(points), tickSize);
}

// Risk to stop using POINT VALUE (beginner-friendly)
export function futuresRiskToStopUsd(args: {
  avgEntry: number;
  stopPrice: number;
  contracts: number;
  spec: FuturesSpec;
}): { stopPoints: number; stopTicks: number; riskUsd: number } {
  const { avgEntry, stopPrice, contracts, spec } = args;
  const pointValue = derivePointValueUsd(spec);

  const stopPoints = priceToPoints(avgEntry - stopPrice);
  const stopTicks = pointsToTicks(stopPoints, spec.tickSize);
  const riskUsd = stopPoints * pointValue * clampNonNegative(contracts);

  return { stopPoints, stopTicks, riskUsd };
}

// Prop "liquidation": Account breach price given remaining drawdown
export function futuresBreachPrice(args: {
  side: Side;                 // long/short position direction
  avgEntry: number;
  contracts: number;
  remainingDrawdownUsd: number;
  spec: FuturesSpec;
}): {
  maxAdversePoints: number;
  maxAdverseTicks: number;
  breachPrice: number;
} {
  const { side, avgEntry, contracts, remainingDrawdownUsd, spec } = args;
  const pointValue = derivePointValueUsd(spec);

  const denom = pointValue * clampNonNegative(contracts);
  const maxAdversePoints = denom > 0 ? clampNonNegative(remainingDrawdownUsd) / denom : 0;
  const maxAdverseTicks = pointsToTicks(maxAdversePoints, spec.tickSize);

  const breachPrice =
    side === "long" ? avgEntry - maxAdversePoints : avgEntry + maxAdversePoints;

  return { maxAdversePoints, maxAdverseTicks, breachPrice };
}

// Max contracts allowed for a chosen stop (so they don’t breach rules)
export function futuresMaxContractsForStop(args: {
  avgEntry: number;
  stopPrice: number;
  remainingDrawdownUsd: number;
  spec: FuturesSpec;
}): { stopPoints: number; maxContracts: number } {
  const { avgEntry, stopPrice, remainingDrawdownUsd, spec } = args;
  const pointValue = derivePointValueUsd(spec);
  const stopPoints = priceToPoints(avgEntry - stopPrice);

  const perContractRisk = stopPoints * pointValue;
  const maxContracts = perContractRisk > 0 ? Math.floor(remainingDrawdownUsd / perContractRisk) : 0;

  return { stopPoints, maxContracts: clampNonNegative(maxContracts) };
}

// ---------- FOREX: pips ----------
export type ForexSpec = {
  pipSize: number;     // usually 0.0001, JPY pairs 0.01
  pipValueUsd: number; // $ per 1 pip for 1.0 lot (or for the chosen lot unit)
  // NOTE: In v1 you said manual is fine. Later you can compute this from price + lot size.
};

export function forexPriceToPips(priceDistance: number, pipSize: number): number {
  return safeDiv(Math.abs(priceDistance), pipSize);
}

export function forexRiskToStopUsd(args: {
  avgEntry: number;
  stopPrice: number;
  lots: number;
  spec: ForexSpec;
}): { stopPips: number; riskUsd: number } {
  const { avgEntry, stopPrice, lots, spec } = args;

  const stopPips = forexPriceToPips(avgEntry - stopPrice, spec.pipSize);
  const riskUsd = stopPips * spec.pipValueUsd * clampNonNegative(lots);

  return { stopPips, riskUsd };
}

export function forexBreachPrice(args: {
  side: Side;
  avgEntry: number;
  lots: number;
  remainingDrawdownUsd: number;
  spec: ForexSpec;
}): {
  maxAdversePips: number;
  breachPrice: number;
} {
  const { side, avgEntry, lots, remainingDrawdownUsd, spec } = args;

  const denom = spec.pipValueUsd * clampNonNegative(lots);
  const maxAdversePips = denom > 0 ? clampNonNegative(remainingDrawdownUsd) / denom : 0;

  const maxAdversePriceDist = maxAdversePips * spec.pipSize;
  const breachPrice =
    side === "long" ? avgEntry - maxAdversePriceDist : avgEntry + maxAdversePriceDist;

  return { maxAdversePips, breachPrice };
}

export function forexMaxLotsForStop(args: {
  avgEntry: number;
  stopPrice: number;
  remainingDrawdownUsd: number;
  spec: ForexSpec;
}): { stopPips: number; maxLots: number } {
  const { avgEntry, stopPrice, remainingDrawdownUsd, spec } = args;

  const stopPips = forexPriceToPips(avgEntry - stopPrice, spec.pipSize);
  const perLotRisk = stopPips * spec.pipValueUsd;

  // lots can be fractional (0.01). Let UI decide step size; here we return raw max.
  const maxLots = perLotRisk > 0 ? remainingDrawdownUsd / perLotRisk : 0;

  return { stopPips, maxLots: clampNonNegative(maxLots) };
}
