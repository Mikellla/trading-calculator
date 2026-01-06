"use client";

import { HelpIcon, HelpProvider } from "@/components/HelpTooltip";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { roundTo } from "@/lib/math/utils";
import { qtyForTargetAvg } from "@/lib/math/trading";

type Side = "long" | "short";
type Mode = "futures" | "forex";

type TabLike = "avg"; // we keep prop firm on an "avg-entry-style" layout

const FUTURES_PRESETS: Array<{
  key: string;
  label: string;
  tickSize: number;
  tickValueUsd: number;
}> = [
  { key: "ES", label: "ES (E-mini S&P 500)", tickSize: 0.25, tickValueUsd: 12.5 },
  { key: "MES", label: "MES (Micro E-mini S&P)", tickSize: 0.25, tickValueUsd: 1.25 },
  { key: "NQ", label: "NQ (E-mini Nasdaq)", tickSize: 0.25, tickValueUsd: 5 },
  { key: "MNQ", label: "MNQ (Micro E-mini Nasdaq)", tickSize: 0.25, tickValueUsd: 0.5 },
  { key: "YM", label: "YM (E-mini Dow)", tickSize: 1.0, tickValueUsd: 5 },
  { key: "MYM", label: "MYM (Micro E-mini Dow)", tickSize: 1.0, tickValueUsd: 0.5 },
  { key: "RTY", label: "RTY (E-mini Russell)", tickSize: 0.1, tickValueUsd: 5 },
  { key: "M2K", label: "M2K (Micro E-mini Russell)", tickSize: 0.1, tickValueUsd: 0.5 },
  { key: "CL", label: "CL (Crude Oil)", tickSize: 0.01, tickValueUsd: 10 },
  { key: "MCL", label: "MCL (Micro Crude)", tickSize: 0.01, tickValueUsd: 1 },
  { key: "GC", label: "GC (Gold)", tickSize: 0.1, tickValueUsd: 10 },
  { key: "MGC", label: "MGC (Micro Gold)", tickSize: 0.1, tickValueUsd: 1 },
];

function n(v: number) {
  return Number.isFinite(v) ? v : Number.NaN;
}
function toNum(s: string) {
  const x = Number(s);
  return Number.isFinite(x) ? x : Number.NaN;
}

/** Same input behavior as your crypto NumberField: decimal-friendly + auto-select on click */
function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  inputMode?: "decimal" | "numeric";
  help?: string;     // ✅ add
  helpId?: string;   // ✅ add (unique per field)
}) {

  const { label, value, onChange, placeholder, step, min, max, inputMode } = props;

  const [text, setText] = useState("");
  const isFocused = useRef(false);

  useEffect(() => {
    if (isFocused.current) return;
    setText(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  return (
    <label className="block">
<div className="mb-1 flex items-center text-sm text-neutral-400">
  <span>{label}</span>
  {props.help ? <HelpIcon id={props.helpId ?? label} text={props.help} /> : null}
</div>

      <input
        type="text"
        inputMode={inputMode ?? "decimal"}
        step={step}
        min={min}
        max={max}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-700"
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          isFocused.current = true;
          e.currentTarget.select(); // ✅ auto-highlight on click
        }}
        onBlur={() => {
          isFocused.current = false;

          if (text.endsWith(".")) {
            const trimmed = text.slice(0, -1);
            setText(trimmed);
            const nn = Number(trimmed);
            onChange(Number.isFinite(nn) ? nn : Number.NaN);
            return;
          }

          const nn = Number(text);
          if (Number.isFinite(nn)) {
            let clamped = nn;
            if (min !== undefined) clamped = Math.max(clamped, Number(min));
            if (max !== undefined) clamped = Math.min(clamped, Number(max));
            if (clamped !== nn) {
              setText(String(clamped));
              onChange(clamped);
            }
          }
        }}
        onChange={(e) => {
          let raw = e.target.value.replace(",", ".");

          if (raw === "") {
            setText("");
            onChange(Number.NaN);
            return;
          }

          if (!/^[-+]?\d*\.?\d*$/.test(raw)) return;

          setText(raw);

          if (raw === "." || raw === "-" || raw === "+" || raw === "-." || raw === "+.") {
            onChange(Number.NaN);
            return;
          }

          const nn = Number(raw);
          onChange(Number.isFinite(nn) ? nn : Number.NaN);
        }}
      />
    </label>
  );
}

function SideToggle(props: { side: Side; setSide: (s: Side) => void }) {
  const { side, setSide } = props;

  const base = "px-4 py-2 text-sm transition-colors";
  const active = "bg-white text-black shadow-sm";
  const inactive = "bg-neutral-900 text-neutral-200 hover:bg-neutral-800";

  return (
        <div className="inline-flex overflow-hidden rounded-xl border border-neutral-800">
      <button type="button" className={`${base} ${side === "long" ? active : inactive}`} onClick={() => setSide("long")}>
        long
      </button>
      <button type="button" className={`${base} ${side === "short" ? active : inactive}`} onClick={() => setSide("short")}>
        short
      </button>
    </div>
  );
}

function derivePointValueUsd(tickSize: number, tickValueUsd: number, pointValueOverride?: number) {
  if (Number.isFinite(pointValueOverride) && (pointValueOverride ?? 0) > 0) return pointValueOverride!;
  if (!Number.isFinite(tickSize) || tickSize <= 0) return Number.NaN;
  if (!Number.isFinite(tickValueUsd) || tickValueUsd <= 0) return Number.NaN;
  return tickValueUsd / tickSize;
}

function calcAvg2Leg(p1: number, q1: number, p2: number, q2: number) {
  if (!(p1 > 0 && q1 > 0 && p2 > 0 && q2 > 0)) throw new Error("invalid");
  const totalQty = q1 + q2;
  const avgPrice = (p1 * q1 + p2 * q2) / totalQty;
  const totalCost = p1 * q1 + p2 * q2;
  return { totalQty, avgPrice, totalCost };
}

/** Futures/Forex PnL model: linear in price move (points or pips), not notional */
function pnlAtPrice(args: {
  mode: Mode;
  side: Side;
  entryPrice: number;
  qty: number; // contracts or lots
  markPrice: number;
  pointValueUsd?: number; // futures
  pipSize?: number;       // forex
  pipValueUsd?: number;   // forex ($ per pip per 1.0 lot)
}) {
  const { mode, side, entryPrice, qty, markPrice } = args;
  if (!(entryPrice > 0 && markPrice > 0 && qty > 0)) throw new Error("invalid");

  const dir = side === "long" ? 1 : -1;

  if (mode === "futures") {
    const pv = args.pointValueUsd!;
    if (!(pv > 0)) throw new Error("invalid");
    const points = (markPrice - entryPrice) * dir;
    return points * pv * qty;
  }

  // forex
  const pipSize = args.pipSize!;
  const pipValue = args.pipValueUsd!;
  if (!(pipSize > 0 && pipValue > 0)) throw new Error("invalid");
  const pips = ((markPrice - entryPrice) / pipSize) * dir;
  return pips * pipValue * qty;
}

function breachPrice(args: {
  mode: Mode;
  side: Side;
  avgEntry: number;
  qty: number;
  remainingDrawdownUsd: number;
  pointValueUsd?: number;
  pipSize?: number;
  pipValueUsd?: number;
}) {
  const { mode, side, avgEntry, qty, remainingDrawdownUsd } = args;
  if (!(avgEntry > 0 && qty > 0 && remainingDrawdownUsd > 0)) throw new Error("invalid");

  const dir = side === "long" ? -1 : 1; // adverse direction from entry

  if (mode === "futures") {
    const pv = args.pointValueUsd!;
    if (!(pv > 0)) throw new Error("invalid");
    const maxAdversePoints = remainingDrawdownUsd / (pv * qty);
    const price = avgEntry + dir * maxAdversePoints;
    return { maxAdverse: maxAdversePoints, breach: price, unit: "points" as const };
  }

  const pipSize = args.pipSize!;
  const pipValue = args.pipValueUsd!;
  if (!(pipSize > 0 && pipValue > 0)) throw new Error("invalid");
  const maxAdversePips = remainingDrawdownUsd / (pipValue * qty);
  const price = avgEntry + dir * (maxAdversePips * pipSize);
  return { maxAdverse: maxAdversePips, breach: price, unit: "pips" as const };
}

export default function PropFirmCalculator() {
  const [tab] = useState<TabLike>("avg"); // single layout like crypto avg-entry

  // Mode + side
  const [mode, setMode] = useState<Mode>("futures");
  const [side, setSide] = useState<Side>("long");

  // Instrument
  const [instrument, setInstrument] = useState(FUTURES_PRESETS[0].key);

  const preset = useMemo(() => FUTURES_PRESETS.find((p) => p.key === instrument)!, [instrument]);

  const [tickSize, setTickSize] = useState<number>(preset.tickSize);
  const [tickValueUsd, setTickValueUsd] = useState<number>(preset.tickValueUsd);
  const [pointValueOverride, setPointValueOverride] = useState<number>(Number.NaN);

  useEffect(() => {
    // when preset changes, update tick fields
    setTickSize(preset.tickSize);
    setTickValueUsd(preset.tickValueUsd);
    setPointValueOverride(Number.NaN);
  }, [preset.key]);

  const pointValueUsd = useMemo(
    () => derivePointValueUsd(tickSize, tickValueUsd, pointValueOverride),
    [tickSize, tickValueUsd, pointValueOverride]
  );

  // Forex specs (manual v1)
  const [pipSize, setPipSize] = useState<number>(0.0001);
  const [pipValueUsd, setPipValueUsd] = useState<number>(10); // $ per pip per 1.0 lot (manual v1)

  // Account rules
  const [remainingDrawdownUsd, setRemainingDrawdownUsd] = useState<number>(Number.NaN);
  const [dailyLossRemainingUsd, setDailyLossRemainingUsd] = useState<number>(Number.NaN);

  const effectiveRemaining = useMemo(() => {
    const a = remainingDrawdownUsd;
    const b = dailyLossRemainingUsd;
    if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) return Math.min(a, b);
    if (Number.isFinite(a) && a > 0) return a;
    if (Number.isFinite(b) && b > 0) return b;
    return Number.NaN;
  }, [remainingDrawdownUsd, dailyLossRemainingUsd]);

  // Avg Entry (2 legs) + market + stop
  const [leg1Price, setLeg1Price] = useState<number>(Number.NaN);
  const [leg1Qty, setLeg1Qty] = useState<number>(Number.NaN);
  const [leg2Price, setLeg2Price] = useState<number>(Number.NaN);
  const [leg2Qty, setLeg2Qty] = useState<number>(Number.NaN);

  const [marketPrice, setMarketPrice] = useState<number>(Number.NaN);
  const [stopPrice, setStopPrice] = useState<number>(Number.NaN);

  // Target average (needs market price)
  const [targetAvg, setTargetAvg] = useState<number>(Number.NaN);

  const avg = useMemo(() => {
    try {
      return calcAvg2Leg(leg1Price, leg1Qty, leg2Price, leg2Qty);
    } catch {
      return null;
    }
  }, [leg1Price, leg1Qty, leg2Price, leg2Qty]);

  // PnL comparison (initial vs new average) at market price
  const comparison = useMemo(() => {
    try {
      if (!(marketPrice > 0)) throw new Error("invalid");
      if (!(leg1Price > 0 && leg1Qty > 0)) throw new Error("invalid");
      if (!(leg2Price > 0 && leg2Qty > 0)) throw new Error("invalid");

      const avgEntry = (leg1Price * leg1Qty + leg2Price * leg2Qty) / (leg1Qty + leg2Qty);

      const pnlOld = pnlAtPrice({
        mode,
        side,
        entryPrice: leg1Price,
        qty: leg1Qty,
        markPrice: marketPrice,
        pointValueUsd,
        pipSize,
        pipValueUsd,
      });

      const pnlNew = pnlAtPrice({
        mode,
        side,
        entryPrice: avgEntry,
        qty: leg1Qty + leg2Qty,
        markPrice: marketPrice,
        pointValueUsd,
        pipSize,
        pipValueUsd,
      });

      const delta = pnlNew - pnlOld;

      const verdict = Math.abs(delta) < 1e-9 ? "same" : delta > 0 ? "better" : "worse";

      return { pnlOld, pnlNew, delta, verdict };
    } catch {
      return null;
    }
  }, [mode, side, leg1Price, leg1Qty, leg2Price, leg2Qty, marketPrice, pointValueUsd, pipSize, pipValueUsd]);

  // Target qty (same logic as crypto — add at market price to reach target average)
  const targetQty = useMemo(() => {
    try {
      return qtyForTargetAvg({
        currentPrice: leg1Price,
        currentQty: leg1Qty,
        targetAvg,
        newPrice: marketPrice,
      });
    } catch {
      return null;
    }
  }, [leg1Price, leg1Qty, targetAvg, marketPrice]);

  // Breach price + risk to stop (shown in results card)
  const breach = useMemo(() => {
    try {
      if (!avg) throw new Error("invalid");
      if (!(effectiveRemaining > 0)) throw new Error("invalid");

      return breachPrice({
        mode,
        side,
        avgEntry: avg.avgPrice,
        qty: avg.totalQty,
        remainingDrawdownUsd: effectiveRemaining,
        pointValueUsd,
        pipSize,
        pipValueUsd,
      });
    } catch {
      return null;
    }
  }, [avg, mode, side, effectiveRemaining, pointValueUsd, pipSize, pipValueUsd]);

  const riskToStop = useMemo(() => {
    try {
      if (!avg) throw new Error("invalid");
      if (!(stopPrice > 0)) throw new Error("invalid");

      // treat stop pnl as adverse move from avg entry to stop price
      const risk = pnlAtPrice({
        mode,
        side,
        entryPrice: avg.avgPrice,
        qty: avg.totalQty,
        markPrice: stopPrice,
        pointValueUsd,
        pipSize,
        pipValueUsd,
      });

      // pnlAtPrice gives signed pnl; risk should be positive dollar loss
      return Math.abs(risk);
    } catch {
      return null;
    }
  }, [avg, stopPrice, mode, side, pointValueUsd, pipSize, pipValueUsd]);

  // Clear handlers per card
  const clearInputs = () => {
    setLeg1Price(Number.NaN);
    setLeg1Qty(Number.NaN);
    setLeg2Price(Number.NaN);
    setLeg2Qty(Number.NaN);
    setMarketPrice(Number.NaN);
    setStopPrice(Number.NaN);
    setTargetAvg(Number.NaN);
    setRemainingDrawdownUsd(Number.NaN);
    setDailyLossRemainingUsd(Number.NaN);
  };

  const clearResults = () => {
    // results derived; "clear" here means clear stop & limits (most common)
    setStopPrice(Number.NaN);
    setRemainingDrawdownUsd(Number.NaN);
    setDailyLossRemainingUsd(Number.NaN);
  };

  const clearComparison = () => {
    setMarketPrice(Number.NaN);
  };

  const clearTarget = () => {
    setTargetAvg(Number.NaN);
  };

  // Small “example” for prop tab (optional but helpful)
  const example = () => {
    setSide("long");
    setMode("futures");
    setInstrument("ES");
    // avg entry like your crypto example but for futures
    setLeg1Price(5000);
    setLeg1Qty(1);
    setLeg2Price(5050);
    setLeg2Qty(1);
    setMarketPrice(5075);
    setStopPrice(4980);
    setRemainingDrawdownUsd(500);
    setDailyLossRemainingUsd(Number.NaN);
    setTargetAvg(5020);
  };

return (
  <HelpProvider>
    <div className="space-y-6">
      {/* Header row like crypto avg-entry: title + side toggle */}
      <section className="rounded-2xl border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-medium">Prop firm — average entry</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-neutral-800">
              <button
                type="button"
                className={`px-4 py-2 text-sm transition-colors ${
                  mode === "futures"
                    ? "bg-white text-black shadow-sm"
                    : "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
                }`}
                onClick={() => setMode("futures")}
              >
                futures
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm transition-colors ${
                  mode === "forex"
                    ? "bg-white text-black shadow-sm"
                    : "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
                }`}
                onClick={() => setMode("forex")}
              >
                forex
              </button>
            </div>
            <SideToggle side={side} setSide={setSide} />
          </div>
        </div>

        {/* --- Inputs card (same structure as crypto avg-entry) --- */}
        {tab === "avg" && (
          <>
            <div className="mt-4 space-y-4">
              {/* Instrument + Point value emphasis */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {mode === "futures" ? (
                  <label className="block">
                    <div className="mb-1 text-sm text-neutral-400">instrument</div>
                    <select
                      value={instrument}
                      onChange={(e) => setInstrument(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-700"
                    >
                      {FUTURES_PRESETS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.key} — {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                    <div className="text-sm text-neutral-400">forex</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      pip value is manual for v1 (later we auto-calc from live price)
                    </div>
                  </div>
                )}

                {/* Point value / Pip value prominent */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                  <div className="text-sm text-neutral-400">
                    {mode === "futures" ? "point value ($/point)" : "$ per pip (per 1.0 lot)"}
                  </div>

                  <div className="mt-1 text-2xl font-semibold">
                    {mode === "futures"
                      ? Number.isFinite(pointValueUsd)
                        ? `$${roundTo(pointValueUsd, 4)}`
                        : "—"
                      : Number.isFinite(pipValueUsd)
                        ? `$${roundTo(pipValueUsd, 4)}`
                        : "—"}
                  </div>

                  {mode === "futures" ? (
                    <div className="mt-2">
                      <NumberField
                        label="override point value (optional)"
                        value={pointValueOverride}
                        onChange={setPointValueOverride}
                        help="Dollar value of a one-point price move per contract."
                        helpId="prop_point_value"
                      />

                      {/* Less visible advanced tick inputs */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-neutral-400 hover:text-neutral-200">
                          advanced (tick size / tick value)
                        </summary>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <NumberField
                            label="tick size"
                            value={tickSize}
                            onChange={setTickSize}
                            help="Smallest possible price movement of the instrument."
                            helpId="prop_tick_size"
                          />
                          <NumberField
                            label="tick value ($)"
                            value={tickValueUsd}
                            onChange={setTickValueUsd}
                            help="Dollar value of one tick movement per contract."
                            helpId="prop_tick_value"
                          />
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <NumberField
                        label="pip size"
                        value={pipSize}
                        onChange={setPipSize}
                      />
                      <NumberField
                        label="$ per pip (manual)"
                        value={pipValueUsd}
                        onChange={setPipValueUsd}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Account rules + stop */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  label="remaining drawdown ($)"
                  value={remainingDrawdownUsd}
                  onChange={setRemainingDrawdownUsd}
                  help="Maximum additional loss allowed before the account fails."
                  helpId="prop_remaining_drawdown"
                />
                <NumberField
                  label="daily loss remaining ($)"
                  value={dailyLossRemainingUsd}
                  onChange={setDailyLossRemainingUsd}
                  help="Maximum loss allowed for the current trading day."
                  helpId="prop_daily_loss_remaining"
                />

                <NumberField
                  label="stop loss price"
                  value={stopPrice}
                  onChange={setStopPrice}
                  help="Price where the position would be closed to limit loss."
                  helpId="prop_stop_price"
                />
                <NumberField
                  label="market price"
                  value={marketPrice}
                  onChange={setMarketPrice}
                  help="Current price where an additional order would be executed."
                  helpId="prop_market_price"
                />
              </div>

              {/* Avg-entry inputs (exact same pattern as crypto) */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  label="initial entry price"
                  value={leg1Price}
                  onChange={setLeg1Price}
                />
                <NumberField
                  label={mode === "futures" ? "initial qty (contracts)" : "initial qty (lots)"}
                  value={leg1Qty}
                  onChange={setLeg1Qty}
                />

                <NumberField
                  label="added entry price"
                  value={leg2Price}
                  onChange={setLeg2Price}
                />
                <NumberField
                  label={mode === "futures" ? "added qty (contracts)" : "added qty (lots)"}
                  value={leg2Qty}
                  onChange={setLeg2Qty}
                />
              </div>

              {/* Buttons like crypto */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
                  onClick={clearInputs}
                >
                  clear inputs
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
                  onClick={example}
                >
                  example
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Result card (same as crypto “Average entry result”) */}
      <section className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Average entry result</h2>
        </div>

        {!avg ? (
          <p className="mt-2 text-sm text-red-600">Invalid inputs (prices & qty must be &gt; 0)</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>total qty</div>
            <div className="text-right">{roundTo(avg.totalQty, 6)}</div>

            <div>avg price</div>
            <div className="text-right">{roundTo(avg.avgPrice, 8)}</div>

            <div>account breach price (estimate)</div>
            <div className="text-right">{breach ? roundTo(breach.breach, 8) : "—"}</div>

            <div>risk to stop ($)</div>
            <div className="text-right">{riskToStop !== null ? roundTo(riskToStop, 2) : "—"}</div>

            <div className="col-span-2 text-xs text-neutral-500">
              breach price is the level where you hit remaining drawdown (prop “liquidation”).
            </div>
          </div>
        )}
      </section>

      {/* PnL comparison card (same as crypto) */}
      <section className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">PnL comparison</h2>
        </div>

        {!comparison ? (
          <p className="mt-2 text-sm text-red-600">
            Invalid inputs (need initial/add + market price + instrument values)
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>pnl (initial only)</div>
            <div className="text-right">{roundTo(comparison.pnlOld, 2)}</div>

            <div>pnl (new average)</div>
            <div className="text-right">{roundTo(comparison.pnlNew, 2)}</div>

            <div className="font-medium">difference</div>
            <div className="text-right font-medium">{roundTo(comparison.delta, 2)}</div>

            <div className="col-span-2 font-medium">
              {comparison.verdict === "better" && <span className="text-green-600">📈 Better after adding</span>}
              {comparison.verdict === "worse" && <span className="text-red-600">📉 Worse after adding</span>}
              {comparison.verdict === "same" && <span className="text-neutral-600">⚖️ No change</span>}
            </div>
          </div>
        )}
      </section>

      {/* Target average card (same as crypto) */}
      <section className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Target average</h2>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField
            label="target avg price"
            value={targetAvg}
            onChange={setTargetAvg}
            help="Desired average entry price after adding to the position."
            helpId="prop_target_avg"
          />
        </div>

        <div className="mt-3 text-sm">
          {!targetQty ? null : targetQty.type === "invalid" ? (
            <span className="text-orange-600">Invalid: new entry price equals target average</span>
          ) : targetQty.type === "reverse" ? (
            <span className="text-red-600">Reverse / reduce needed: {roundTo(targetQty.qty, 4)}</span>
          ) : (
            <span className="text-blue-600">Required quantity: {roundTo(targetQty.qty, 4)}</span>
          )}
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          Uses your current position (leg 1) and assumes you add at the current market price to reach your target average.
        </p>
      </section>
    </div>
  </HelpProvider>
);
}

