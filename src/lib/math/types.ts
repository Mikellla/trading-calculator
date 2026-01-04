export type Side = "long" | "short";

/**
 * PnL
 */
export type PnlInput = {
  side: Side;
  entryPrice: number;
  exitPrice: number;
  quantity: number; // base asset quantity
  feeRate?: number; // e.g. 0.0004 = 0.04% per side
};

export type PnlResult = {
  notionalEntry: number;
  notionalExit: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  roiOnNotionalEntry: number;
};

/**
 * Average entry
 */
export type AvgEntryLeg = {
  price: number;
  quantity: number;
};

export type AvgEntryResult = {
  totalQty: number;
  totalCost: number;
  avgPrice: number;
};

/**
 * Target average
 */
export type TargetAvgResult = {
  requiredQty: number;
};

/**
 * Liquidation (simplified)
 */
export type LiquidationInput = {
  side: Side;
  entryPrice: number;
  leverage: number;
  mmr?: number;
};

export type LiquidationResult = {
  liquidationPrice: number;
  assumptions: {
    mmr: number;
    simplified: true;
  };
};
