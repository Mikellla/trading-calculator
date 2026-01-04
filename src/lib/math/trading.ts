import type {
  AvgEntryLeg,
  AvgEntryResult,
  LiquidationInput,
  LiquidationResult,
  PnlInput,
  PnlResult,
  Side,
  TargetAvgResult,
} from "./types";
import { assertNonNegative, assertPositive, clamp } from "./utils";

/**
 * Notional = price * quantity
 * PnL (linear):
 *  - long: (exit - entry) * qty
 *  - short: (entry - exit) * qty
 * Fees (simple): feeRate * (entryNotional + exitNotional)
 */
export function calcPnl(input: PnlInput): PnlResult {
  const { side, entryPrice, exitPrice, quantity } = input;
  const feeRate = input.feeRate ?? 0;

  assertPositive("entryPrice", entryPrice);
  assertPositive("exitPrice", exitPrice);
  assertPositive("quantity", quantity);
  assertNonNegative("feeRate", feeRate);

  const notionalEntry = entryPrice * quantity;
  const notionalExit = exitPrice * quantity;

  const grossPnl =
    side === "long"
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;

  const fees = feeRate * (notionalEntry + notionalExit);
  const netPnl = grossPnl - fees;

  const roiOnNotionalEntry = netPnl / notionalEntry;

  return {
    notionalEntry,
    notionalExit,
    grossPnl,
    fees,
    netPnl,
    roiOnNotionalEntry,
  };
}

export function calcAvgEntry(legs: AvgEntryLeg[]): AvgEntryResult {
  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error("legs must be a non-empty array");
  }

  let totalQty = 0;
  let totalCost = 0;

  for (const leg of legs) {
    assertPositive("leg.price", leg.price);
    assertPositive("leg.quantity", leg.quantity);
    totalQty += leg.quantity;
    totalCost += leg.price * leg.quantity;
  }

  const avgPrice = totalCost / totalQty;

  return { totalQty, totalCost, avgPrice };
}

/**
 * Solve for x:
 * newAvg = (currentAvg*currentQty + newPrice*x) / (currentQty + x)
 */
export function calcRequiredQtyForTargetAvg(params: {
  currentAvg: number;
  currentQty: number;
  newPrice: number;
  targetAvg: number;
}): TargetAvgResult {
  const { currentAvg, currentQty, newPrice, targetAvg } = params;

  assertPositive("currentAvg", currentAvg);
  assertPositive("currentQty", currentQty);
  assertPositive("newPrice", newPrice);
  assertPositive("targetAvg", targetAvg);

  const min = Math.min(currentAvg, newPrice);
  const max = Math.max(currentAvg, newPrice);
  if (targetAvg < min || targetAvg > max) {
    return { requiredQty: 0 };
  }

  const denom = newPrice - targetAvg;
  if (denom === 0) return { requiredQty: 0 };

  const requiredQty = (currentQty * (targetAvg - currentAvg)) / denom;

  return { requiredQty: Math.max(0, requiredQty) };
}

/**
 * VERY simplified liquidation estimate for linear perpetuals:
 * - long approx: liq ≈ entry * (1 - 1/leverage + mmr)
 * - short approx: liq ≈ entry * (1 + 1/leverage - mmr)
 *
 * Exchanges differ; treat as v1 estimate.
 */
export function calcLiquidationPrice(
  input: LiquidationInput
): LiquidationResult {
  const { side, entryPrice, leverage } = input;
  const mmr = input.mmr ?? 0.005;

  assertPositive("entryPrice", entryPrice);
  assertPositive("leverage", leverage);
  assertNonNegative("mmr", mmr);

  const invLev = 1 / leverage;

  let liq: number;
  if (side === "long") {
    liq = entryPrice * (1 - invLev + mmr);
    liq = Math.min(liq, entryPrice);
  } else {
    liq = entryPrice * (1 + invLev - mmr);
    liq = Math.max(liq, entryPrice);
  }

  liq = clamp(liq, 0, Number.MAX_SAFE_INTEGER);

  return {
    liquidationPrice: liq,
    assumptions: { mmr, simplified: true },
  };
}

export function flipSide(side: Side): Side {
  return side === "long" ? "short" : "long";
}

export function compareAvgPnl(params: {
  side: Side;
  initialPrice: number;
  initialQty: number;
  addedPrice: number;
  addedQty: number;
  marketPrice: number;
}) {
  const {
    side,
    initialPrice,
    initialQty,
    addedPrice,
    addedQty,
    marketPrice,
  } = params;

  assertPositive("initialPrice", initialPrice);
  assertPositive("initialQty", initialQty);
  assertPositive("addedPrice", addedPrice);
  assertPositive("addedQty", addedQty);
  assertPositive("marketPrice", marketPrice);

  const totalQty = initialQty + addedQty;
  const avgPrice =
    (initialPrice * initialQty + addedPrice * addedQty) / totalQty;

  const pnlOld =
    side === "long"
      ? (marketPrice - initialPrice) * initialQty
      : (initialPrice - marketPrice) * initialQty;

  const pnlNew =
    side === "long"
      ? (marketPrice - avgPrice) * totalQty
      : (avgPrice - marketPrice) * totalQty;

  const delta = pnlNew - pnlOld;

  let verdict: "better" | "worse" | "same";
  if (Math.abs(delta) < 1e-8) verdict = "same";
  else verdict = delta > 0 ? "better" : "worse";

  return {
    avgPrice,
    totalQty,
    pnlOld,
    pnlNew,
    delta,
    verdict,
  };
}

export function qtyForTargetAvg(params: {
  currentPrice: number;
  currentQty: number;
  targetAvg: number;
  newPrice: number;
}) {
  const { currentPrice, currentQty, targetAvg, newPrice } = params;

  assertPositive("currentPrice", currentPrice);
  assertPositive("currentQty", currentQty);
  assertPositive("targetAvg", targetAvg);
  assertPositive("newPrice", newPrice);

  if (newPrice === targetAvg) {
    return { type: "invalid" as const };
  }

  const qty =
    (currentQty * (targetAvg - currentPrice)) / (newPrice - targetAvg);

  if (qty < 0) {
    return { type: "reverse" as const, qty: Math.abs(qty) };
  }

  return { type: "ok" as const, qty };
}

