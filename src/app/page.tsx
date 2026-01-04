"use client";

import { useRef } from "react";
import { useEffect } from "react";
import { useMemo, useState } from "react";
import {
  calcAvgEntry,
  calcLiquidationPrice,
  calcPnl,
  compareAvgPnl,
  qtyForTargetAvg,
} from "@/lib/math/trading";
import { roundTo } from "@/lib/math/utils";
import type { Side } from "@/lib/math/types";

type Tab = "pnl" | "avg" | "liq";

function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  inputMode?: "decimal" | "numeric";
}) {
  const { label, value, onChange, placeholder, step, min, max, inputMode } = props;

  const [text, setText] = useState("");
  const isFocused = useRef(false);

  // Sync from parent -> input, but only when user is NOT typing (prevents fighting the cursor)
  useEffect(() => {
    if (isFocused.current) return;
    setText(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  return (
    <label className="block">
      <div className="mb-1 text-sm text-neutral-400">{label}</div>

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
          e.currentTarget.select(); // auto-highlight on tap/click
        }}
        onBlur={() => {
          isFocused.current = false;

          // Normalize trailing dot on blur: "2." -> "2"
          if (text.endsWith(".")) {
            const trimmed = text.slice(0, -1);
            setText(trimmed);
            const n = Number(trimmed);
            onChange(Number.isFinite(n) ? n : Number.NaN);
            return;
          }

          // Apply min/max on blur (optional safety)
          const n = Number(text);
          if (Number.isFinite(n)) {
            let clamped = n;
            if (min !== undefined) clamped = Math.max(clamped, Number(min));
            if (max !== undefined) clamped = Math.min(clamped, Number(max));
            if (clamped !== n) {
              setText(String(clamped));
              onChange(clamped);
            }
          }
        }}
        onChange={(e) => {
          // Accept comma too (some numpads/locales emit ",")
          let raw = e.target.value.replace(",", ".");

          // Allow empty
          if (raw === "") {
            setText("");
            onChange(Number.NaN);
            return;
          }

          // Allow typing states: "2", "2.", "2.0", ".5", etc.
          if (!/^[-+]?\d*\.?\d*$/.test(raw)) return;

          setText(raw);

          // If it's an incomplete number like "." or "-" or "2." -> keep numeric as NaN
          if (raw === "." || raw === "-" || raw === "+" || raw === "-." || raw === "+.") {
            onChange(Number.NaN);
            return;
          }

          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : Number.NaN);
        }}
      />
    </label>
  );
}
function SegmentedTabs(props: { tab: Tab; setTab: (t: Tab) => void }) {
  const { tab, setTab } = props;

  const base = "px-4 py-2 text-sm transition-colors";
  const active = "bg-white text-black shadow-sm";
  const inactive = "bg-neutral-900 text-neutral-200 hover:bg-neutral-800";

  const btn = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`${base} ${tab === key ? active : inactive}`}
    >
      {label}
    </button>
  );

  return (
    <div className="inline-flex overflow-hidden rounded-xl border">
      {btn("pnl", "pnl")}
      {btn("avg", "avg entry")}
      {btn("liq", "liquidation")}
    </div>
  );
}

function SideToggle(props: { side: Side; setSide: (s: Side) => void }) {
  const { side, setSide } = props;

  const base =
    "px-4 py-2 text-sm transition-colors";

  const active =
    "bg-white text-black shadow-sm";

  const inactive =
    "bg-neutral-900 text-neutral-200 hover:bg-neutral-800";

  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-neutral-800">
      <button
        type="button"
        className={`${base} ${side === "long" ? active : inactive}`}
        onClick={() => setSide("long")}
      >
        long
      </button>

      <button
        type="button"
        className={`${base} ${side === "short" ? active : inactive}`}
        onClick={() => setSide("short")}
      >
        short
      </button>
    </div>
  );
}


export default function Page() {
  const [tab, setTab] = useState<Tab>("pnl");

  // ---------- PnL ----------
const [side, setSide] = useState<Side>("long");
const [entryPrice, setEntryPrice] = useState(Number.NaN);
const [exitPrice, setExitPrice] = useState(Number.NaN);
const [quantity, setQuantity] = useState(Number.NaN);
const [feeRate, setFeeRate] = useState(0.0004); // or NaN if you want empty too
const [pnlIsExample, setPnlIsExample] = useState(false);

  const pnl = useMemo(() => {
    try {
      return calcPnl({ side, entryPrice, exitPrice, quantity, feeRate });
    } catch {
      return null;
    }
  }, [side, entryPrice, exitPrice, quantity, feeRate]);

  useEffect(() => {
  if (!pnlIsExample) return;

  if (side === "long") {
    setEntryPrice(1.5);
    setExitPrice(2.0);
  } else {
    setEntryPrice(2.0);
    setExitPrice(1.5);
  }

  setQuantity(10_000);
  setFeeRate(0.0004);
}, [side, pnlIsExample]);


  // ---------- Avg Entry + Comparison (Tkinter-style) ----------
  const [avgSide, setAvgSide] = useState<Side>("long");
  const [avgIsExample, setAvgIsExample] = useState(false);
  // v1: 2 legs
  const [leg1Price, setLeg1Price] = useState(Number.NaN);
  const [leg1Qty, setLeg1Qty] = useState(Number.NaN);
  const [leg2Price, setLeg2Price] = useState(Number.NaN);
  const [leg2Qty, setLeg2Qty] = useState(Number.NaN);

  const avg = useMemo(() => {
    try {
      return calcAvgEntry([
        { price: leg1Price, quantity: leg1Qty },
        { price: leg2Price, quantity: leg2Qty },
      ]);
    } catch {
      return null;
    }
  }, [leg1Price, leg1Qty, leg2Price, leg2Qty]);

  const [marketPrice, setMarketPrice] = useState(Number.NaN);

  const comparison = useMemo(() => {
    try {
      return compareAvgPnl({
        side: avgSide,
        initialPrice: leg1Price,
        initialQty: leg1Qty,
        addedPrice: leg2Price,
        addedQty: leg2Qty,
        marketPrice,
      });
    } catch {
      return null;
    }
  }, [avgSide, leg1Price, leg1Qty, leg2Price, leg2Qty, marketPrice]);

  const [targetAvg, setTargetAvg] = useState(Number.NaN);
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
  }, [leg1Price, leg1Qty, leg2Price, targetAvg]);

  useEffect(() => {
  if (!avgIsExample) return;

  if (avgSide === "long") {
    setLeg1Price(1.5);
    setLeg2Price(2.0);
    setMarketPrice(2.1);
    setTargetAvg(1.8);
  } else {
    setLeg1Price(2.0);
    setLeg2Price(1.5);
    setMarketPrice(1.4);
    setTargetAvg(1.7);
  }

  setLeg1Qty(10_000);
  setLeg2Qty(5_000);
}, [avgSide, avgIsExample]);


  // ---------- Liquidation ----------
const [liqSide, setLiqSide] = useState<Side>("long");
const [liqEntry, setLiqEntry] = useState(Number.NaN);
const [leverage, setLeverage] = useState(Number.NaN);
const [mmr, setMmr] = useState(Number.NaN);
const [liqIsExample, setLiqIsExample] = useState(false);

  const liq = useMemo(() => {
    try {
      return calcLiquidationPrice({
        side: liqSide,
        entryPrice: liqEntry,
        leverage,
        mmr,
      });
    } catch {
      return null;
    }
  }, [liqSide, liqEntry, leverage, mmr]);
  useEffect(() => {
  if (!liqIsExample) return;

  setLiqEntry(liqSide === "long" ? 1.5 : 2.0);
  setLeverage(50);
  setMmr(0.005);
}, [liqSide, liqIsExample]);


  return (
    <main className="min-h-dvh bg-neutral-950 p-6 text-neutral-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Trading Calculator v1</h1>
            <p className="text-sm text-neutral-600">Simple calculators (no backend)</p>
          </div>
          <SegmentedTabs tab={tab} setTab={setTab} />
        </header>

        {/* ---------------- PnL TAB ---------------- */}
        {tab === "pnl" && (
          <>
            <section className="rounded-2xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-medium">PnL inputs</h2>
                <SideToggle side={side} setSide={setSide} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField label="entry price" value={entryPrice} onChange={setEntryPrice} />
                <NumberField label="exit price" value={exitPrice} onChange={setExitPrice} />
                <NumberField label="quantity" value={quantity} onChange={setQuantity} />
                <NumberField
                  label="fee rate (per side, decimal)"
                  value={feeRate}
                  onChange={setFeeRate}
                  step="0.0001"
                  min="0"
                />
              </div>

<div className="mt-4 flex flex-wrap gap-2">
  <button
    type="button"
    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
    onClick={() => {
  setPnlIsExample(false);
  setEntryPrice(Number.NaN);
  setExitPrice(Number.NaN);
  setQuantity(Number.NaN);
}}
  >
    clear
  </button>

  <button
    type="button"
    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
    onClick={() => {
  setPnlIsExample(true);
  if (side === "long") {
    setEntryPrice(1.5);
    setExitPrice(2.0);
  } else {
    setEntryPrice(2.0);
    setExitPrice(1.5);
  }
  setQuantity(10_000);
  setFeeRate(0.0004);
}}
  >
    example
  </button>
</div>
            </section>

            <section className="rounded-2xl border p-4">
              <h2 className="text-lg font-medium">PnL result</h2>

              {!pnl ? (
                <p className="mt-2 text-sm text-red-600">
                  Invalid inputs (all values must be &gt; 0, fee rate must be ≥ 0)
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>entry notional</div>
                  <div className="text-right">{roundTo(pnl.notionalEntry, 2)}</div>

                  <div>exit notional</div>
                  <div className="text-right">{roundTo(pnl.notionalExit, 2)}</div>

                  <div>gross pnl</div>
                  <div className="text-right">{roundTo(pnl.grossPnl, 2)}</div>

                  <div>fees</div>
                  <div className="text-right">{roundTo(pnl.fees, 2)}</div>

                  <div className="font-medium">net pnl</div>
                  <div className="text-right font-medium">{roundTo(pnl.netPnl, 2)}</div>

                  <div>roi (on entry notional)</div>
                  <div className="text-right">{roundTo(pnl.roiOnNotionalEntry * 100, 2)}%</div>
                </div>
              )}
            </section>
          </>
        )}

        {/* ---------------- AVG ENTRY TAB ---------------- */}
        {tab === "avg" && (
          <>
            <section className="rounded-2xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-medium">Average entry inputs</h2>
                <SideToggle side={avgSide} setSide={setAvgSide} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField label="initial entry price" value={leg1Price} onChange={setLeg1Price} />
                <NumberField label="initial qty" value={leg1Qty} onChange={setLeg1Qty} />

                <NumberField label="added entry price" value={leg2Price} onChange={setLeg2Price} />
                <NumberField label="added qty" value={leg2Qty} onChange={setLeg2Qty} />

                <NumberField label="market price" value={marketPrice} onChange={setMarketPrice} />
              </div>

<div className="mt-4 flex flex-wrap gap-2">
  {/* Clear = back to empty */}
  <button
    type="button"
    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
onClick={() => {
  setAvgIsExample(false);
  setLeg1Price(Number.NaN);
  setLeg1Qty(Number.NaN);
  setLeg2Price(Number.NaN);
  setLeg2Qty(Number.NaN);
  setMarketPrice(Number.NaN);
  setTargetAvg(Number.NaN);
}}
  >
    clear
  </button>

  {/* Example = fills smart values, side-aware */}
  <button
    type="button"
    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
onClick={() => {
  setAvgIsExample(true);

  if (avgSide === "long") {
    setLeg1Price(Number.NaN);
    setLeg2Price(2.0);
    setMarketPrice(2.1);
    setTargetAvg(1.8);
  } else {
    setLeg1Price(2.0);
    setLeg2Price(1.5);
    setMarketPrice(1.4);
    setTargetAvg(1.7);
  }

  setLeg1Qty(10_000);
  setLeg2Qty(5_000);
}}
  >
    example
  </button>
</div>
            </section>

            <section className="rounded-2xl border p-4">
              <h2 className="text-lg font-medium">Average entry result</h2>

              {!avg ? (
                <p className="mt-2 text-sm text-red-600">Invalid inputs (all values must be &gt; 0)</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>total qty</div>
                  <div className="text-right">{roundTo(avg.totalQty, 6)}</div>

                  <div>avg price</div>
                  <div className="text-right">{roundTo(avg.avgPrice, 8)}</div>

                  <div>total cost</div>
                  <div className="text-right">{roundTo(avg.totalCost, 2)}</div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border p-4">
              <h2 className="text-lg font-medium">PnL comparison</h2>

              {!comparison ? (
                <p className="mt-2 text-sm text-red-600">
                  Invalid inputs (all values must be &gt; 0)
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
                    {comparison.verdict === "better" && (
                      <span className="text-green-600">📈 Better after adding</span>
                    )}
                    {comparison.verdict === "worse" && (
                      <span className="text-red-600">📉 Worse after adding</span>
                    )}
                    {comparison.verdict === "same" && (
                      <span className="text-neutral-600">⚖️ No change</span>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border p-4">
              <h2 className="text-lg font-medium">Target average</h2>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField label="target avg price" value={targetAvg} onChange={setTargetAvg} />
              </div>

              <div className="mt-3 text-sm">
                {!targetQty ? null : targetQty.type === "invalid" ? (
                  <span className="text-orange-600">
                    Invalid: new entry price equals target average
                  </span>
                ) : targetQty.type === "reverse" ? (
                  <span className="text-red-600">
                    Reverse / reduce needed: {roundTo(targetQty.qty, 4)}
                  </span>
                ) : (
                  <span className="text-blue-600">
                    Required quantity: {roundTo(targetQty.qty, 4)}
                  </span>
                )}
              </div>

              <p className="mt-2 text-xs text-neutral-500">
                Uses your current position (leg 1) and assumes you add at the current market price to reach your target average
              </p>
            </section>
          </>
        )}

{/* ---------------- LIQUIDATION TAB ---------------- */}
{tab === "liq" && (
  <>
    <section className="rounded-2xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Liquidation inputs</h2>
        <SideToggle side={liqSide} setSide={setLiqSide} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumberField label="entry price" value={liqEntry} onChange={setLiqEntry} />
        <NumberField label="leverage" value={leverage} onChange={setLeverage} step="1" min="1" />
        <NumberField label="mmr (decimal)" value={mmr} onChange={setMmr} step="0.0001" min="0" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
          onClick={() => {
            setLiqIsExample(false);
            setLiqEntry(Number.NaN);
            setLeverage(Number.NaN);
            setMmr(Number.NaN);
          }}
        >
          clear
        </button>

        <button
          type="button"
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
          onClick={() => {
  setLiqIsExample(true);
  setLiqEntry(liqSide === "long" ? 1.5 : 2.0);
  setLeverage(50);
  setMmr(0.005);
}}
        >
          example
        </button>
      </div>
    </section>

    <section className="rounded-2xl border p-4">
      <h2 className="text-lg font-medium">Liquidation result</h2>

      {!liq ? (
        <p className="mt-2 text-sm text-red-600">
          Invalid inputs (entry &gt; 0, leverage &gt; 0, mmr ≥ 0)
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>liq price (estimate)</div>
          <div className="text-right">{roundTo(liq.liquidationPrice, 8)}</div>
          <div className="col-span-2 text-neutral-500">
            Simplified estimate. Exchanges use wallet balance, fees, funding, and tiered MMR.
          </div>
        </div>
      )}
    </section>
  </>

  )}

      </div>
    </main>
  );
}
